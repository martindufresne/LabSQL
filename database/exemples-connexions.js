// database/exemples-connexions.js
// GUIDE PÉDAGOGIQUE : Comment connecter une base de données en Node.js
// Ce fichier détaille et compare les architectures de connexion pour :
// 1. SQLite (Embarqué / In-Process)
// 2. PostgreSQL (Client-Serveur avec Connection Pool)
// 3. MySQL (Client-Serveur avec Connection Pool)
// 4. Query Builder Agnostique (Knex.js - Multi-SGBD)

/**
 * ============================================================================
 * 1. SQLITE : MODÈLE EMBARQUÉ (IN-PROCESS)
 * ============================================================================
 * - Pas de serveur distinct, pas de socket réseau, pas de port TCP.
 * - Le moteur SQL est compilé directement dans le processus de l'application.
 * - Node.js lit et écrit directement dans le fichier binaire sur le disque.
 */
function exempleConnexionSQLite() {
  // Option A : Module natif Node.js (Node 22+)
  const { DatabaseSync } = require('node:sqlite');
  const path = require('node:path');

  // La "connexion" est simplement l'ouverture d'un descripteur de fichier
  const db = new DatabaseSync(path.join(__dirname, 'data.db'));

  // Activer le mode WAL (Write-Ahead Logging) pour des lectures/écritures concurrentes rapides
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  console.log('✅ SQLite connecté directement au fichier local.');
  return db;
}

/**
 * ============================================================================
 * 2. POSTGRESQL : MODÈLE CLIENT-SERVEUR & CONNECTION POOL
 * ============================================================================
 * - Le serveur PostgreSQL tourne sur un port réseau (par défaut: 5432).
 * - En production, ouvrir/fermer une connexion TCP à chaque clic utilisateur est
 *   trop lent (coût de la négociation TLS et de l'authentification).
 * - On utilise un "Pool" qui maintient plusieurs connexions ouvertes en réserve.
 * 
 * Nécessite : npm install pg
 */
function exempleConnexionPostgreSQL() {
  /*
  const { Pool } = require('pg');

  // Chaîne de connexion standard (DSN / Connection String)
  // Format : postgresql://utilisateur:mot_de_passe@hote:port/nom_base
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:secret@localhost:5432/maboutique',
    max: 20,                  // Maximum 20 connexions ouvertes simultanément
    idleTimeoutMillis: 30000, // Ferme une connexion si inutilisée pendant 30s
    connectionTimeoutMillis: 2000 // Échoue si la connexion prend plus de 2s
  });

  // Cycle d'exécution d'une requête dans le pool :
  async function executerRequete(sql, params) {
    // 1. Emprunter un client du pool
    const client = await pool.connect();
    try {
      // 2. Exécuter la requête sur le socket réseau
      const res = await client.query(sql, params);
      return res.rows;
    } finally {
      // 3. IMPÉRATIF : Relâcher le client pour qu'il redevienne disponible
      client.release();
    }
  }

  return { pool, executerRequete };
  */
  return `
  // Exemple d'initialisation PostgreSQL (Driver 'pg')
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20
  });
  const { rows } = await pool.query('SELECT * FROM clients WHERE ville = $1', ['Paris']);
  `;
}

/**
 * ============================================================================
 * 3. MYSQL / MARIADB : MODÈLE CLIENT-SERVEUR
 * ============================================================================
 * - Port réseau par défaut : 3306
 * - Utilise également un pool de connexions pour absorber la charge web.
 * 
 * Nécessite : npm install mysql2
 */
function exempleConnexionMySQL() {
  /*
  const mysql = require('mysql2/promise');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'secret',
    database: process.env.DB_NAME || 'maboutique',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Exécution avec requête préparée automatique
  async function chercherClients(ville) {
    const [rows] = await pool.execute('SELECT * FROM clients WHERE ville = ?', [ville]);
    return rows;
  }
  */
  return `
  // Exemple d'initialisation MySQL (Driver 'mysql2/promise')
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'boutique'
  });
  const [rows] = await pool.execute('SELECT * FROM clients WHERE ville = ?', ['Paris']);
  `;
}

/**
 * ============================================================================
 * 4. CODE AGNOSTIQUE MULTI-SGBD (QUERY BUILDER)
 * ============================================================================
 * Comment faire pour que le même code tourne sur SQLite en dev et Postgres en prod ?
 * On utilise un constructeur de requêtes comme Knex.js ou Kysely.
 * 
 * Seule la configuration change, tout le code de l'application reste IDENTIQUE !
 */
function exempleQueryBuilderAgnostique() {
  /*
  const knex = require('knex');

  // En local / développement : SQLite
  const dbDev = knex({
    client: 'sqlite3',
    connection: { filename: './data.db' },
    useNullAsDefault: true
  });

  // En production : PostgreSQL
  const dbProd = knex({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 20 }
  });

  // Le code applicatif ci-dessous est 100% IDENTIQUE quel que soit le SGBD :
  async function obtenirTopClients(db) {
    return await db('clients')
      .join('commandes', 'clients.id', '=', 'commandes.client_id')
      .select('clients.nom')
      .sum('commandes.montant_total as total')
      .groupBy('clients.id')
      .orderBy('total', 'desc')
      .limit(5);
  }
  */
  return `
  // Configuration Knex.js
  const db = knex({
    client: process.env.NODE_ENV === 'production' ? 'pg' : 'sqlite3',
    connection: process.env.NODE_ENV === 'production' 
      ? process.env.DATABASE_URL 
      : { filename: './data.db' }
  });

  // Requête unique portable sur SQLite, Postgres ou MySQL :
  const topClients = await db('clients')
    .where('ville', 'Paris')
    .orderBy('date_inscription', 'desc');
  `;
}

if (require.main === module) {
  console.log('--- DÉMONSTRATION DES MODES DE CONNEXION SQL EN NODE.JS ---');
  exempleConnexionSQLite();
  console.log('\n--- Modèle PostgreSQL Client-Serveur ---');
  console.log(exempleConnexionPostgreSQL());
  console.log('--- Modèle Agnostique Multi-SGBD ---');
  console.log(exempleQueryBuilderAgnostique());
}

module.exports = {
  exempleConnexionSQLite,
  exempleConnexionPostgreSQL,
  exempleConnexionMySQL,
  exempleQueryBuilderAgnostique
};
