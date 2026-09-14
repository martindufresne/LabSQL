// database/init.js
// Initialisation du schéma relationnel et insertion de données de test pour le cours.

const db = require('./db');

function initDatabase() {
  console.log('📦 Initialisation de la base SQLite...');

  // 1. Suppression préalable des tables et vues si elles existent déjà
  db.exec(`
    DROP VIEW IF EXISTS vue_ventes;
    DROP TABLE IF EXISTS fts_catalogue;
    DROP TABLE IF EXISTS commandes;
    DROP TABLE IF EXISTS produits;
    DROP TABLE IF EXISTS clients;
  `);

  // 2. Création des tables relationnelles
  db.exec(`
    -- Table des clients
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      ville TEXT NOT NULL,
      pays TEXT NOT NULL,
      date_inscription TEXT NOT NULL
    );

    -- Table des produits
    CREATE TABLE produits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      categorie TEXT NOT NULL,
      prix REAL NOT NULL,
      stock INTEGER NOT NULL,
      description TEXT NOT NULL
    );

    -- Table des commandes (fait le lien entre clients et produits)
    CREATE TABLE commandes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      produit_id INTEGER NOT NULL,
      quantite INTEGER NOT NULL,
      montant_total REAL NOT NULL,
      date_commande TEXT NOT NULL,
      statut TEXT NOT NULL CHECK(statut IN ('livree', 'en attente', 'annulee')),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (produit_id) REFERENCES produits(id)
    );

    -- 3. Vue sémantique dénormalisée (Data Mart)
    -- Très utilisée en BI pour simplifier l'accès sans obliger le moteur de Q&A à réinventer les jointures
    CREATE VIEW vue_ventes AS
    SELECT 
      c.id AS commande_id,
      c.date_commande,
      strftime('%Y', c.date_commande) AS annee,
      c.statut,
      c.quantite,
      c.montant_total,
      cl.id AS client_id,
      cl.nom AS client_nom,
      cl.ville AS client_ville,
      cl.pays AS client_pays,
      p.id AS produit_id,
      p.nom AS produit_nom,
      p.categorie AS produit_categorie,
      p.prix AS produit_prix
    FROM commandes c
    JOIN clients cl ON c.client_id = cl.id
    JOIN produits p ON c.produit_id = p.id;

    -- 4. Table virtuelle FTS5 (Full Text Search - Index inversé)
    -- Sert pour l'Approche 3 (Moteur de recherche d'entreprise)
    CREATE VIRTUAL TABLE fts_catalogue USING fts5(
      produit_id UNINDEXED,
      nom,
      categorie,
      description,
      tokenize = 'unicode61 remove_diacritics 1'
    );
  `);

  // 5. Données d'exemple : Clients
  const insertClient = db.prepare(`
    INSERT INTO clients (nom, email, ville, pays, date_inscription)
    VALUES (?, ?, ?, ?, ?)
  `);

  const clientsData = [
    ['Alice Martin', 'alice@example.com', 'Paris', 'France', '2022-01-15'],
    ['Thomas Bernard', 'thomas@example.com', 'Paris', 'France', '2022-03-22'],
    ['Claire Dubois', 'claire@example.com', 'Lyon', 'France', '2022-06-10'],
    ['David Moreau', 'david@example.com', 'Marseille', 'France', '2023-01-05'],
    ['Émilie Laurent', 'emilie@example.com', 'Bruxelles', 'Belgique', '2023-02-18'],
    ['François Petit', 'francois@example.com', 'Montréal', 'Canada', '2023-04-12'],
    ['Sophie Leroy', 'sophie@example.com', 'Lyon', 'France', '2023-07-29'],
    ['Lucas Roux', 'lucas@example.com', 'Genève', 'Suisse', '2023-09-14'],
    ['Julie Garcia', 'julie@example.com', 'Bordeaux', 'France', '2024-01-11'],
    ['Marc Simon', 'marc@example.com', 'Nantes', 'France', '2024-02-01']
  ];

  for (const c of clientsData) {
    insertClient.run(...c);
  }

  // 6. Données d'exemple : Produits
  const insertProduit = db.prepare(`
    INSERT INTO produits (nom, categorie, prix, stock, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const produitsData = [
    [
      'Ordinateur Portable Pro 15',
      'Informatique',
      1299.99,
      15,
      'Ordinateur portable haute performance avec processeur 16 coeurs, 32 Go RAM et écran OLED 4K ultra précis pour professionnels.'
    ],
    [
      'Clavier Mécanique RGB',
      'Accessoires',
      89.50,
      45,
      'Clavier mécanique rétroéclairé avec switchs rouges linéaires silencieux, idéal pour la programmation et la bureautique.'
    ],
    [
      'Souris Ergonomique Sans Fil',
      'Accessoires',
      49.90,
      60,
      'Souris verticale ergonomique Bluetooth pour prévenir les douleurs du poignet et du canal carpien.'
    ],
    [
      'Casque Audio Bluetooth ANC',
      'Audio',
      199.00,
      25,
      'Casque circum-aural sans fil avec réduction active du bruit (ANC), autonomie 30 heures et son spatial haute résolution.'
    ],
    [
      'Écouteurs Sans Fil Sport',
      'Audio',
      79.99,
      30,
      'Écouteurs intra-auriculaires étanches IPX7 avec basses profondes et maintien renforcé pour le running et fitness.'
    ],
    [
      'Smartphone Vision 12',
      'Téléphonie',
      799.00,
      20,
      'Smartphone écran 120 Hz AMOLED, triple capteur photo 108 MP, recharge ultra-rapide 65W et connectivité 5G.'
    ],
    [
      'Écran PC 27 Pouces 144Hz',
      'Informatique',
      249.90,
      18,
      'Moniteur IPS 27 pouces résolution QHD 2K avec taux de rafraîchissement 144Hz et bordures ultra-fines.'
    ],
    [
      'Disque SSD Externe 1To',
      'Informatique',
      109.90,
      50,
      'Disque dur externe SSD NVMe USB-C débit 1050 Mo/s, ultra-compact, résistant aux chutes et chocs.'
    ]
  ];

  for (const p of produitsData) {
    insertProduit.run(...p);
  }

  // 7. Remplissage de l'index FTS5 (synchronisation avec les produits)
  const insertFts = db.prepare(`
    INSERT INTO fts_catalogue (produit_id, nom, categorie, description)
    SELECT id, nom, categorie, description FROM produits;
  `);
  insertFts.run();

  // 8. Données d'exemple : Commandes
  const insertCommande = db.prepare(`
    INSERT INTO commandes (client_id, produit_id, quantite, montant_total, date_commande, statut)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const commandesData = [
    [1, 1, 1, 1299.99, '2023-01-20', 'livree'],
    [1, 2, 2, 179.00,  '2023-02-15', 'livree'],
    [2, 4, 1, 199.00,  '2023-03-05', 'livree'],
    [3, 6, 1, 799.00,  '2023-04-18', 'livree'],
    [4, 3, 1, 49.90,   '2023-05-12', 'annulee'],
    [5, 5, 2, 159.98,  '2023-06-25', 'livree'],
    [6, 7, 1, 249.90,  '2023-07-14', 'livree'],
    [7, 8, 3, 329.70,  '2023-08-01', 'livree'],
    [2, 1, 1, 1299.99, '2023-09-09', 'livree'],
    [3, 2, 1, 89.50,   '2023-10-30', 'livree'],
    [8, 4, 1, 199.00,  '2023-11-22', 'livree'],
    [9, 6, 1, 799.00,  '2024-01-15', 'livree'],
    [10, 8, 2, 219.80, '2024-02-04', 'en attente'],
    [1, 3, 1, 49.90,   '2024-02-18', 'livree'],
    [4, 5, 1, 79.99,   '2024-03-01', 'en attente']
  ];

  for (const cmd of commandesData) {
    insertCommande.run(...cmd);
  }

  console.log('✅ Base de données initialisée avec succès !');
}

if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
