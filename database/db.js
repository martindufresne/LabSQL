// database/db.js
// Gestion de la connexion unique à la base de données SQLite.
// Utilise le module natif 'node:sqlite' (disponible à partir de Node.js v22+).

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);

// Activer les clés étrangères pour garantir l'intégrité référentielle
db.exec('PRAGMA foreign_keys = ON;');

module.exports = db;
