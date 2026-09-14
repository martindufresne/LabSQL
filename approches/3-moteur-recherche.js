// approches/3-moteur-recherche.js
// APPROCHE 3 : Moteur de recherche d'entreprise (Search Engine / Index inversé FTS5)
//
// Principe : Utilisé par des outils comme ThoughtSpot, Elasticsearch ou Algolia.
// Tout le corpus textuel est indexé dans un "Index Inversé" (SQLite FTS5 natif).
// Les résultats sont classés par score de pertinence statistique (BM25)
// et les mots-clés sont surlignés dynamiquement dans le texte.

const db = require('../database/db');

// Liste standard de mots vides (stop words) et mots interrogatifs
// Dans un moteur de recherche, ces mots n'ont aucune valeur discriminante
// et pollueraient la recherche s'ils étaient cherchés littéralement dans les fiches produits.
const STOP_WORDS = new Set([
  'combien', 'quel', 'quelle', 'quels', 'quelles', 'est', 'sont',
  'de', 'du', 'des', 'le', 'la', 'les', 'en', 'un', 'une', 'a', 'au', 'aux',
  'pour', 'avec', 'dans', 'par', 'sur', 'ce', 'cet', 'cette', 'ces', 'qui', 'que',
  'y', 'a-t-il', 'avoir', 'etre', 'faire'
]);

/**
 * Découpe la saisie utilisateur et retire les mots vides
 */
function tokeniser(saisie) {
  const motsBruts = saisie
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // suppression diacritiques
    .replace(/[^\w\s-]/gi, ' ')
    .split(/\s+/)
    .filter(m => m.length > 0);

  const motsRetenus = [];
  const motsIgnores = [];

  for (const m of motsBruts) {
    if (STOP_WORDS.has(m) || m.length === 1) {
      motsIgnores.push(m);
    } else {
      motsRetenus.push(m);
    }
  }

  return { motsBruts, motsRetenus, motsIgnores };
}

/**
 * Exécute une recherche plein texte avec classement BM25 et facettes
 * @param {string} texteRecherche - Mots-clés recherchés
 * @param {object} facettes - Filtres relationnels additionnels (ex: categorie, prixMax)
 */
function executerApproche3(texteRecherche, facettes = {}) {
  const etapes = [];
  const saisie = texteRecherche.trim();

  if (!saisie) {
    return {
      succes: false,
      erreur: 'Veuillez saisir au moins un mot-clé.',
      etapes
    };
  }

  let queryFTS = '';
  const { motsBruts, motsRetenus, motsIgnores } = tokeniser(saisie);

  // 1. Analyse lexicale et filtrage des Stop Words
  if (motsIgnores.length > 0) {
    etapes.push({
      etape: '1. Filtrage des mots vides (Stop Words)',
      detail: `Mots interrogatifs ou vides ignorés : ${motsIgnores.map(w => `"${w}"`).join(', ')}`
    });
  }

  // Si la saisie contient déjà des opérateurs booléens stricts (AND, OR, NOT, guillemets)
  if (/\b(AND|OR|NOT)\b/.test(saisie) || saisie.includes('"')) {
    queryFTS = saisie;
    etapes.push({
      etape: '2. Syntaxe booléenne explicite',
      detail: `Expression FTS5 brute conservée : "${queryFTS}"`
    });
  } else {
    // Sinon, on construit la requête à partir des mots significatifs
    const motsCibles = motsRetenus.length > 0 ? motsRetenus : motsBruts;
    // On applique le préfixe '*' sur chaque terme pour la recherche partielle
    queryFTS = motsCibles.map(m => `${m}*`).join(' AND ');
    etapes.push({
      etape: '2. Tokenisation & préfixage FTS',
      detail: `Termes de recherche compilés : "${queryFTS}"`
    });
  }

  // 2. Fonction de construction et exécution SQL
  function executerRequete(ftsExpr) {
    let sql = `
      SELECT 
        p.id,
        p.nom,
        p.categorie,
        p.prix,
        p.stock,
        highlight(fts_catalogue, 3, '<mark>', '</mark>') AS description_surlignee,
        ROUND(bm25(fts_catalogue), 3) AS score_bm25
      FROM fts_catalogue
      JOIN produits p ON fts_catalogue.produit_id = p.id
      WHERE fts_catalogue MATCH ?
    `;

    const params = [ftsExpr];

    if (facettes.categorie) {
      sql += ` AND p.categorie = ?`;
      params.push(facettes.categorie);
    }

    if (facettes.prixMax && !isNaN(facettes.prixMax)) {
      sql += ` AND p.prix <= ?`;
      params.push(parseFloat(facettes.prixMax));
    }

    // Tri par score BM25 (plus c'est négatif, plus c'est pertinent)
    sql += ` ORDER BY bm25(fts_catalogue) ASC LIMIT 20;`;

    const stmt = db.prepare(sql);
    const resultats = stmt.all(...params);

    const planStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    const plan = planStmt.all(...params);

    return { sql, params, plan, resultats };
  }

  try {
    // Tentative A : Conjonction stricte (AND)
    let execution = executerRequete(queryFTS);

    // Tentative B : Si 0 résultat et qu'on avait plusieurs mots (ex: "inventaire" n'existe pas dans le texte),
    // on bascule en disjonction pondérée (OR) avec classement BM25 (comportement standard Google / Elasticsearch)
    if (execution.resultats.length === 0 && motsRetenus.length > 1 && !saisie.includes('"')) {
      const fallbackQueryFTS = motsRetenus.map(m => `${m}*`).join(' OR ');
      etapes.push({
        etape: '3. Ajustement de stratégie (Conjonction stricte vide)',
        detail: `0 résultat avec AND strict. Bascule en disjonction pondérée (OR + scoring BM25) : "${fallbackQueryFTS}"`
      });

      const fallbackExec = executerRequete(fallbackQueryFTS);
      if (fallbackExec.resultats.length > 0) {
        queryFTS = fallbackQueryFTS;
        execution = fallbackExec;
      }
    }

    etapes.push({
      etape: '4. Exécution SQLite FTS5',
      detail: `${execution.resultats.length} document(s) trouvé(s) via l'index inversé.`
    });

    return {
      succes: true,
      question: saisie,
      queryFTS,
      sql: execution.sql.replace(/\s+/g, ' ').trim(),
      params: execution.params,
      planExecution: execution.plan,
      etapes,
      resultats: execution.resultats,
      totalLignes: execution.resultats.length
    };

  } catch (err) {
    return {
      succes: false,
      question: saisie,
      erreur: `Erreur syntaxique FTS5 : ${err.message}`,
      etapes
    };
  }
}

/**
 * Fournit la liste des facettes disponibles pour alimenter l'interface HTML
 */
function obtenirFacettes() {
  const categories = db.prepare(`SELECT DISTINCT categorie FROM produits ORDER BY categorie;`).all();
  return {
    categories: categories.map(c => c.categorie)
  };
}

module.exports = {
  executerApproche3,
  obtenirFacettes
};
