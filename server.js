// server.js
// Serveur Node.js / Express pour le cours SQL
// Expose les pages de démonstration HTML et les routes d'API pour chaque approche.

const express = require('express');
const path = require('node:path');
const { initDatabase } = require('./database/init');
const db = require('./database/db');

// Import des moteurs des 4 approches
const { executerApproche1, REGLES } = require('./approches/1-syntaxique');
const { executerApproche2, METRIQUES, DIMENSIONS } = require('./approches/2-bi-dictionnaire');
const { executerApproche3, obtenirFacettes } = require('./approches/3-moteur-recherche');
const { executerApproche4, listerModelesOllama } = require('./approches/4-ollama-llm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialiser la base au démarrage
initDatabase();

// Route 1 : Approche 1 (Analyseur syntaxique)
app.post('/api/approche1', (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ succes: false, erreur: 'Paramètre "question" manquant.' });
  }
  const resultat = executerApproche1(question);
  res.json(resultat);
});

// Route 2 : Approche 2 (Q&A BI / Dictionnaire sémantique)
app.post('/api/approche2', (req, res) => {
  const { phrase } = req.body;
  if (!phrase) {
    return res.status(400).json({ succes: false, erreur: 'Paramètre "phrase" manquant.' });
  }
  const resultat = executerApproche2(phrase);
  res.json(resultat);
});

// Route 3 : Approche 3 (Moteur de recherche inversé FTS5)
app.post('/api/approche3', (req, res) => {
  const { query, facettes } = req.body;
  const resultat = executerApproche3(query || '', facettes || {});
  res.json(resultat);
});

// Route 4 : Approche 4 (Text-to-SQL avec LLM Ollama)
app.post('/api/approche4', async (req, res) => {
  const { question, modele } = req.body;
  if (!question) {
    return res.status(400).json({ succes: false, erreur: 'Paramètre "question" manquant.' });
  }
  const resultat = await executerApproche4(question, modele);
  res.json(resultat);
});

// Route pour lister les modèles Ollama installés
app.get('/api/ollama/modeles', async (req, res) => {
  const info = await listerModelesOllama();
  res.json(info);
});

// Route d'exploration des tables et données
app.get('/api/tables', (req, res) => {
  try {
    const list = [
      { nom: 'clients', type: 'table', label: 'Clients' },
      { nom: 'produits', type: 'table', label: 'Produits' },
      { nom: 'commandes', type: 'table', label: 'Commandes' },
      { nom: 'vue_ventes', type: 'view', label: 'Vue dénormalisée (Data Mart)' },
      { nom: 'fts_catalogue', type: 'virtual_table', label: 'Index inversé FTS5' }
    ];

    const tablesAvecStats = list.map(t => {
      let count = 0;
      try {
        count = db.prepare(`SELECT COUNT(*) as c FROM ${t.nom}`).all()[0].c;
      } catch (e) {
        count = 0;
      }
      return { ...t, totalLignes: count };
    });

    res.json({ tables: tablesAvecStats });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Contenu et structure d'une table spécifique
app.get('/api/table/:nom', (req, res) => {
  const nom = req.params.nom;
  const tablesAutorisees = ['clients', 'produits', 'commandes', 'vue_ventes', 'fts_catalogue'];
  if (!tablesAutorisees.includes(nom)) {
    return res.status(400).json({ erreur: 'Table non autorisée ou inexistante.' });
  }

  try {
    const colonnes = db.prepare(`PRAGMA table_info(${nom})`).all();
    const rows = db.prepare(`SELECT * FROM ${nom} LIMIT 100`).all();
    res.json({ table: nom, colonnes, rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Console SQL libre pour les étudiants (Lecture seule sécurisée)
app.post('/api/sql-direct', (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ erreur: 'Requête SQL vide.' });

  const sqlClean = sql.trim();
  if (!sqlClean.toUpperCase().startsWith('SELECT')) {
    return res.status(400).json({ erreur: 'Sécurité : Seules les requêtes SELECT sont autorisées.' });
  }

  try {
    const stmt = db.prepare(sqlClean);
    const rows = stmt.all();
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sqlClean}`).all();
    res.json({ succes: true, rows, total: rows.length, plan });
  } catch (err) {
    res.status(400).json({ succes: false, erreur: err.message });
  }
});

// Route d'information : Métadonnées et facettes
app.get('/api/metadata', (req, res) => {
  try {
    const clientsCount = db.prepare('SELECT COUNT(*) as c FROM clients').all()[0].c;
    const produitsCount = db.prepare('SELECT COUNT(*) as c FROM produits').all()[0].c;
    const commandesCount = db.prepare('SELECT COUNT(*) as c FROM commandes').all()[0].c;
    const facettes = obtenirFacettes();

    res.json({
      statistiques: {
        clients: clientsCount,
        produits: produitsCount,
        commandes: commandesCount
      },
      reglesApproche1: REGLES.map(r => r.description),
      dictionnaireApproche2: {
        metriques: METRIQUES.map(m => ({ label: m.label, synonymes: m.synonymes })),
        dimensions: DIMENSIONS.map(d => ({ label: d.label, synonymes: d.synonymes }))
      },
      facettesApproche3: facettes
    });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur du cours SQL démarré sur : http://localhost:${PORT}`);
  console.log(`📖 Ouvrez http://localhost:${PORT} dans votre navigateur pour tester les démos !\n`);
});
