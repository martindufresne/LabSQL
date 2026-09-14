// approches/4-ollama-llm.js
// APPROCHE 4 : Text-to-SQL avec LLM local (Ollama)
//
// Principe : Utilisation d'un modèle de langage exécuté en local (ex: llama3.2, llama3.1, qwen2.5)
// pour traduire directement une question en langage naturel libre vers une requête SQL brute.
// Comprend l'injection du schéma (prompt), la génération zero-shot, et un bac à sable de sécurité.

const db = require('../database/db');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Récupère la liste des modèles installés localement dans Ollama
 */
async function listerModelesOllama() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return {
      disponible: true,
      modeles: (data.models || []).map(m => m.name)
    };
  } catch (err) {
    return {
      disponible: false,
      erreur: 'Ollama n’est pas accessible sur ' + OLLAMA_HOST,
      modeles: []
    };
  }
}

/**
 * Construit le prompt système avec le schéma relationnel et des exemples few-shot
 */
function construirePrompt(question) {
  return `Tu es un assistant expert en SQL SQLite.
Génère une requête SQL SQLite valide pour répondre à la question de l'utilisateur.

Schéma de la base de données :
- clients(id INTEGER PRIMARY KEY, nom TEXT, email TEXT, ville TEXT, pays TEXT, date_inscription TEXT)
- produits(id INTEGER PRIMARY KEY, nom TEXT, categorie TEXT, prix REAL, stock INTEGER, description TEXT)
- commandes(id INTEGER PRIMARY KEY, client_id INTEGER, produit_id INTEGER, quantite INTEGER, montant_total REAL, date_commande TEXT, statut TEXT)

Règles impératives :
1. Réponds UNIQUEMENT avec la requête SQL commençant par SELECT, sur une seule ligne.
2. N'ajoute aucun bloc markdown, aucun commentaire, aucun texte d'introduction.
3. Pour rechercher un produit, utilise toujours : (LOWER(nom) LIKE '%mot%' OR LOWER(description) LIKE '%mot%').
4. Pour l'inventaire ou la disponibilité d'un article, sélectionne les colonnes 'nom' et 'stock' de la table 'produits' (ou SUM(stock)).
5. Pour les jointures, utilise les clés étrangères : commandes.client_id = clients.id et commandes.produit_id = produits.id.

Exemples :
Question : liste des clients de Paris
SQL : SELECT * FROM clients WHERE LOWER(ville) = 'paris';

Question : chiffre d'affaires total en 2023
SQL : SELECT ROUND(SUM(montant_total), 2) AS total_ventes FROM commandes WHERE strftime('%Y', date_commande) = '2023';

Question : stock ou inventaire du casque bluetooth
SQL : SELECT nom, stock FROM produits WHERE LOWER(nom) LIKE '%casque%' OR LOWER(description) LIKE '%bluetooth%';

Question : ${question}
SQL :`;
}

/**
 * Nettoie le SQL brut retourné par le LLM
 */
function nettoyerSQL(reponseLLM) {
  let sql = reponseLLM.trim();

  // Retrait des éventuels blocs markdown ```sql ... ```
  if (sql.includes('```')) {
    sql = sql.replace(/```(?:sql)?/gi, '').replace(/```/g, '').trim();
  }

  // Si le LLM a ajouté du texte explicatif avant le SELECT
  const indexSelect = sql.search(/\bSELECT\b/i);
  if (indexSelect !== -1) {
    sql = sql.substring(indexSelect);
  }

  // Ne garder que la première instruction SQL terminée par un point-virgule
  const pointVirgule = sql.indexOf(';');
  if (pointVirgule !== -1) {
    sql = sql.substring(0, pointVirgule + 1);
  } else {
    sql = sql + ';';
  }

  return sql.trim();
}

/**
 * Bac à sable de sécurité (Guardrail)
 * Vérifie que la requête ne contient aucune commande destructive
 */
function verifierSecuriteSQL(sql) {
  const sqlUpper = sql.toUpperCase();

  // Doit impérativement commencer par SELECT
  if (!sqlUpper.startsWith('SELECT')) {
    throw new Error('Sécurité : Seules les requêtes de lecture (SELECT) sont autorisées.');
  }

  // Mots-clés interdits pour prévenir toute altération de données
  const motsInterdits = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'EXEC'];
  for (const mot of motsInterdits) {
    const regex = new RegExp(`\\b${mot}\\b`, 'i');
    if (regex.test(sqlUpper)) {
      throw new Error(`Sécurité : L'instruction "${mot}" est strictement interdite par le bac à sable.`);
    }
  }

  return true;
}

/**
 * Exécute l'approche 4 : Text-to-SQL avec Ollama
 * @param {string} question - Question posée en langage naturel
 * @param {string} modeleChoisi - Nom du modèle Ollama (optionnel)
 */
async function executerApproche4(question, modeleChoisi = null) {
  const etapes = [];
  const debut = Date.now();

  const q = question.trim();
  if (!q) {
    return { succes: false, erreur: 'Veuillez saisir une question.', etapes };
  }

  // 1. Détection du modèle à utiliser
  const etatOllama = await listerModelesOllama();
  if (!etatOllama.disponible || etatOllama.modeles.length === 0) {
    return {
      succes: false,
      question: q,
      erreur: 'Ollama n’est pas accessible en local ou aucun modèle n’est installé. Lancez "ollama serve" dans votre terminal.',
      etapes
    };
  }

  // Sélection du modèle
  let modele = modeleChoisi;
  if (!modele || !etatOllama.modeles.includes(modele)) {
    if (etatOllama.modeles.includes('llama3.2:3b')) {
      modele = 'llama3.2:3b';
    } else if (etatOllama.modeles.includes('llama3.1:8b')) {
      modele = 'llama3.1:8b';
    } else if (etatOllama.modeles.includes('qwen2.5:14b')) {
      modele = 'qwen2.5:14b';
    } else {
      modele = etatOllama.modeles[0];
    }
  }

  etapes.push({
    etape: '1. Modèle LLM sélectionné',
    detail: `${modele} (via Ollama local)`
  });

  // 2. Construction du Prompt avec injection de schéma
  const prompt = construirePrompt(q);
  etapes.push({
    etape: '2. Injection du schéma DDL & Few-shot',
    detail: `Schéma clients, produits, commandes transmis dans le prompt.`
  });

  try {
    // 3. Appel de l'API locale d'Ollama
    const t0 = Date.now();
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modele,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.0, // Température 0 pour une génération strictement déterministe
          top_p: 0.9
        }
      })
    });

    if (!res.ok) {
      throw new Error(`Erreur HTTP Ollama : ${res.statusText}`);
    }

    const dataLLM = await res.json();
    const tempsInferenceMs = Date.now() - t0;

    etapes.push({
      etape: '3. Inférence du modèle de langage',
      detail: `Génération en ${tempsInferenceMs} ms (${dataLLM.eval_count || 0} tokens générés)`
    });

    // 4. Nettoyage et extraction de la requête SQL
    const sqlBrut = dataLLM.response || '';
    const sql = nettoyerSQL(sqlBrut);

    etapes.push({
      etape: '4. Nettoyage et normalisation SQL',
      detail: `SQL extrait : ${sql}`
    });

    // 5. Garde-fou de sécurité (Guardrail)
    verifierSecuriteSQL(sql);
    etapes.push({
      etape: '5. Bac à sable de sécurité (Guardrails)',
      detail: 'Validation : Requête en lecture seule (SELECT pur), sans injection destructive.'
    });

    // 6. Exécution sur SQLite
    const stmt = db.prepare(sql);
    const resultats = stmt.all();

    const planStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    const plan = planStmt.all();

    etapes.push({
      etape: '6. Exécution dans SQLite',
      detail: `${resultats.length} ligne(s) retournée(s).`
    });

    return {
      succes: true,
      question: q,
      modele,
      tempsInferenceMs,
      promptInjecte: prompt,
      reponseBruteLLM: sqlBrut,
      sql,
      planExecution: plan,
      etapes,
      resultats,
      totalLignes: resultats.length,
      tempsTotalMs: Date.now() - debut
    };

  } catch (err) {
    return {
      succes: false,
      question: q,
      modele,
      erreur: err.message,
      promptInjecte: prompt,
      etapes
    };
  }
}

module.exports = {
  executerApproche4,
  listerModelesOllama
};
