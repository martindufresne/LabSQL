# Notes de Cours : Bases de Données, Connexion & Moteurs de Recherche SQL

Ce document constitue le support théorique et pratique complet du cours. Il couvre les deux grands piliers de l'interaction avec une base de données en génie logiciel :
1. **Comment une application se connecte à une base de données** (architecture embarquée vs client-serveur, drivers, sockets TCP/IP, connection pooling et portabilité multi-SGBD).
2. **Comment un système sait quoi chercher** (traduction d'une intention humaine en SQL via 4 architectures distinctes : grammaires formelles, couche sémantique BI, index inversé plein texte, et modèle de langage local LLM).

---

## Sommaire

1. [Problématique : Le fossé sémantique (Semantic Gap)](#1-problématique--le-fossé-sémantique-semantic-gap)
2. [L'anatomie d'une connexion de base de données](#2-lanatomie-dune-connexion-de-base-de-données)
3. [L'environnement d'étude : Schéma relationnel & SQLite](#3-lenvironnement-détude--schéma-relationnel--sqlite)
4. [Approche 1 : Les analyseurs syntaxiques et grammaires formelles](#4-approche-1--les-analyseurs-syntaxiques-et-grammaires-formelles)
5. [Approche 2 : Le « Q&A » des outils de Business Intelligence (BI)](#5-approche-2--le-qa-des-outils-de-business-intelligence-bi)
6. [Approche 3 : Les moteurs de recherche d'entreprise (Index inversé & FTS5)](#6-approche-3--les-moteurs-de-recherche-dentreprise-index-inversé--fts5)
7. [Approche 4 : Text-to-SQL avec LLM local (Ollama)](#7-approche-4--text-to-sql-avec-llm-local-ollama)
8. [Tableau comparatif des 4 approches](#8-tableau-comparatif-des-4-approches)
9. [L'architecture industrielle moderne : Le compromis hybride](#9-larchitecture-industrielle-moderne--le-compromis-hybride)
10. [Travaux pratiques & Questions d'évaluation pour les étudiants](#10-travaux-pratiques--questions-dévaluation-pour-les-étudiants)

---

## 1. Problématique : Le fossé sémantique (Semantic Gap)

Lorsqu'un utilisateur pose une question telle que :
> *« Quels sont nos meilleurs clients à Paris cette année ? »*

Le cerveau humain comprend intuitivement des concepts abstraits :
* « *meilleurs* » implique un classement basé sur une métrique monétaire (le total des dépenses).
* « *clients* » renvoie à l'entité acheteur.
* « *Paris* » est une contrainte de lieu géographique.
* « *cette année* » est une contrainte temporelle relative à la date actuelle.

Pour un Système de Gestion de Base de Données Relationnelle (SGBDR) comme SQLite, PostgreSQL ou MySQL, ces concepts n'existent pas sous cette forme. Une base de données ne manipule que :
* Des **relations** (tables) ;
* Des **attributs typés** (colonnes) ;
* Des opérations d'**algèbre relationnelle** (projections `SELECT`, sélections `WHERE`, jointures `JOIN`, agrégations `GROUP BY`).

Le rôle d'un moteur de requêtes est de combler ce **fossé sémantique** (*Semantic Gap*).

```mermaid
flowchart TD
    A["Intention Utilisateur (Langage naturel fluide)"] --> B{"Compilateur / Moteur de Recherche"}
    B -->|"Module 1"| C["Grammaire Formelle & Arbre Syntaxique"]
    B -->|"Module 2"| D["Couche Sémantique BI (Mesures / Dimensions)"]
    B -->|"Module 3"| E["Index Inversé & Scoring BM25 (FTS5)"]
    B -->|"Module 4"| F["Modèle de Langage Local (Ollama LLM)"]
    C --> G["Requête SQL Exécutable & Sécurisée"]
    D --> G
    E --> G
    F --> G
    G --> H["Moteur SQL (Exécution & Données)"]
```

---

## 2. L'anatomie d'une connexion de base de données

Avant de pouvoir chercher quoi que ce soit, une application Node.js doit **établir une connexion** avec le moteur de base de données. Il existe deux grands modèles fondamentaux :

```mermaid
flowchart TD
    subgraph sub1 ["Modèle Embarqué - SQLite"]
        App1["Application Node.js"] -->|"Appel direct C / Descripteur OS"| File["Fichier local data.db sur le disque"]
    end

    subgraph sub2 ["Modèle Client-Serveur - PostgreSQL / MySQL"]
        App2["Application Node.js"] -->|"Pool de connexions TCP/IP"| Socket["Socket Réseau - Port 5432 / 3306"]
        Socket --> Engine["Serveur SGBD distant - Processus autonome"]
        Engine --> Disk["Fichiers de données serveur"]
    end
```

### A. SQLite : Le modèle embarqué (In-Process)
* **Pas de processus serveur autonome :** SQLite n'écoute sur aucun port réseau et ne consomme aucune socket TCP.
* **Intégration directe :** Le moteur SQLite est une bibliothèque C embarquée directement à l'intérieur du binaire Node.js (via le module natif `node:sqlite` ou `better-sqlite3`).
* **La connexion :** Elle consiste simplement à ouvrir un descripteur de fichier binaire sur le système de fichiers de l'OS (`fs`).
```javascript
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./database/data.db');
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
```

### B. PostgreSQL & MySQL : Le modèle Client-Serveur
Le moteur SQL est un serveur dédié (sur une machine virtuelle, un conteneur Docker ou un service Cloud comme AWS RDS ou GCP Cloud SQL).
1. Node.js doit ouvrir un **socket réseau TCP/IP** (port par défaut `5432` pour Postgres, `3306` pour MySQL).
2. Il négocie une poignée de main cryptographique (**Handshake TLS**).
3. Il envoie un mot de passe d'authentification.
4. Les requêtes et résultats voyagent sous forme de trames binaires via le protocole réseau (*Wire Protocol*).

### C. La chaîne de connexion (Connection String / DSN)
Dans les architectures client-serveur, la connexion s'exprime sous forme d'une URI standardisée :
```text
postgresql://app_user:secret123@db.entreprise.com:5432/boutique_prod
│            │        │         │                 │    └─ Nom de la base
│            │        │         │                 └────── Port TCP
│            │        │         └──────────────────────── Hôte (IP ou domaine)
│            │        └────────────────────────────────── Mot de passe
│            └─────────────────────────────────────────── Utilisateur
└──────────────────────────────────────────────────────── Protocole / SGBD
```

### D. Le concept indispensable en production : Le Connection Pool
Ouvrir et fermer une connexion TCP à chaque requête HTTP d'un internaute prend entre 50 et 200 ms. Si 200 utilisateurs cliquent en même temps, le serveur sature.
Un **Pool de connexions** maintient 10 à 20 connexions pré-ouvertes et chaudes :
1. Une requête web arrive $\rightarrow$ elle « emprunte » une connexion libre du pool ;
2. Elle exécute sa requête SQL en 1 à 5 ms ;
3. Elle « relâche » immédiatement la connexion pour le client suivant.

```javascript
// Exemple réel PostgreSQL (Driver 'pg')
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                  // 20 connexions max en réserve
  idleTimeoutMillis: 30000  // Fermeture des connexions inutilisées après 30s
});

const { rows } = await pool.query('SELECT * FROM clients WHERE ville = $1', ['Paris']);
```

### E. La portabilité multi-SGBD : Query Builders (Knex.js / Kysely)
Pour que le même code tourne sur SQLite en développement local et sur PostgreSQL en production, on utilise un **Query Builder**. Seule la configuration change, le code reste identique :
```javascript
const knex = require('knex');
const db = knex({
  client: process.env.NODE_ENV === 'production' ? 'pg' : 'sqlite3',
  connection: process.env.NODE_ENV === 'production' 
    ? process.env.DATABASE_URL 
    : { filename: './database/data.db' }
});

// Requête 100% portable quel que soit le SGBD :
const clients = await db('clients').where('ville', 'Paris').select('nom', 'email');
```

> [!TIP] Fichier d'exemple du cours
> Retrouvez tous ces modes de connexion comparés et commentés dans le fichier de référence : [`database/exemples-connexions.js`](file:///Users/madbrain/Documents/Lab/coursSQL/database/exemples-connexions.js).

---

## 3. L'environnement d'étude : Schéma relationnel & SQLite

### Modèle de données (Schéma entité-association)

```mermaid
erDiagram
    CLIENTS ||--o{ COMMANDES : "passe"
    PRODUITS ||--o{ COMMANDES : "concerne"

    CLIENTS {
        int id PK
        string nom
        string email
        string ville
        string pays
        string date_inscription
    }

    PRODUITS {
        int id PK
        string nom
        string categorie
        float prix
        int stock
        string description
    }

    COMMANDES {
        int id PK
        int client_id FK
        int produit_id FK
        int quantite
        float montant_total
        string date_commande
        string statut
    }
```

Le code d'initialisation de ce schéma et l'insertion des données de banc d'essai se trouvent dans [`database/init.js`](file:///Users/madbrain/Documents/Lab/coursSQL/database/init.js).

### La sécurité fondamentale : Requêtes Préparées (*Parameterized Queries*)
Aucune concaténation directe de chaîne (`'SELECT * WHERE ville = ' + saisie`) ne doit être tolérée. Nous utilisons systématiquement des requêtes préparées pour neutraliser les injections SQL :
```javascript
const stmt = db.prepare('SELECT * FROM clients WHERE ville = ?');
const results = stmt.all(saisieUtilisateur);
```

---

## 4. Approche 1 : Les analyseurs syntaxiques et grammaires formelles

* **Fichier source Node.js :** [`approches/1-syntaxique.js`](file:///Users/madbrain/Documents/Lab/coursSQL/approches/1-syntaxique.js)
* **Interface interactive :** [`public/approche1.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche1.html)

### Fondement théorique
Historiquement (TALN / NLP symbolique), les premiers systèmes d'interrogation reposaient sur des **grammaires hors-contexte (CFG)** et l'extraction de variables (*Slot Filling*).

Le système applique une liste de règles ordonnées. Chaque règle comporte :
1. Un motif structurel strict (expression régulière ou arbre de dérivation) ;
2. Un compilateur qui injecte les variables capturées dans un gabarit SQL.

```javascript
{
  id: 'COMPTAGE_TOTAL',
  pattern: /^combien\s+de\s+([a-zéèêëàâîïôöûüç]+)$/i,
  compiler: (match) => ({
    sql: `SELECT COUNT(*) AS total FROM ${ENTITES[match[1]].table};`,
    params: []
  })
}
```

### Limite constatée en laboratoire
* `combien de clients` $\rightarrow$ Succès immédiat (`SELECT COUNT(*) AS total FROM clients;`).
* `combien y a-t-il de clients` $\rightarrow$ **Échec !** Dès que l'ordre des mots varie ou qu'une particule est ajoutée, la règle ne correspond plus et le système s'arrête.

---

## 5. Approche 2 : Le « Q&A » des outils de Business Intelligence (BI)

* **Fichier source Node.js :** [`approches/2-bi-dictionnaire.js`](file:///Users/madbrain/Documents/Lab/coursSQL/approches/2-bi-dictionnaire.js)
* **Interface interactive :** [`public/approche2.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche2.html)

### Fondement théorique
Utilisée par des outils d'entreprise comme **Power BI Q&A** ou **Tableau Ask Data**, cette approche abandonne l'idée d'analyser la grammaire d'une phrase. Elle décompose la question en briques analytiques indépendantes :
1. **Les Métriques (Mesures)** : Calculs d'agrégations numériques (`SUM(montant_total)`, `AVG(montant_total)`, `COUNT(id)`).
2. **Les Dimensions** : Axes d'analyse pour la clause `GROUP BY` (`client_ville`, `produit_categorie`, `annee`).
3. **Les Filtres** : Valeurs réelles détectées dans la base pour la clause `WHERE` (`2023`, `Paris`, `livree`).

### Recherche floue (Fuzzy Matching avec Fuse.js)
Pour tolérer les fautes de frappe et variations lexicales (*« chifre dafaire »* $\rightarrow$ *« chiffre d'affaires »*), la bibliothèque `Fuse.js` calcule la distance de Levenshtein.

Le compilateur sémantique assemble ensuite automatiquement :
```sql
SELECT 
  client_ville AS "Ville", 
  ROUND(SUM(montant_total), 2) AS "Chiffre d’affaires (€)" 
FROM vue_ventes 
WHERE annee = ? 
GROUP BY client_ville 
ORDER BY 2 DESC LIMIT 50;
```

---

## 6. Approche 3 : Les moteurs de recherche d'entreprise (Index inversé & FTS5)

* **Fichier source Node.js :** [`approches/3-moteur-recherche.js`](file:///Users/madbrain/Documents/Lab/coursSQL/approches/3-moteur-recherche.js)
* **Interface interactive :** [`public/approche3.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche3.html)

### Pourquoi `LIKE '%mot%'` est inacceptable
Un scan séquentiel `LIKE '%casque%'` parcourt l'intégralité de la table ligne par ligne ($O(N)$). Sur des millions d'articles, la base ralentit drastiquement.

### L'Index Inversé (SQLite FTS5)
Un index inversé découpe le texte des articles en lexèmes (tokens) et stocke un B-Tree inversé associant chaque mot aux identifiants de documents. La recherche s'effectue en temps logarithmique $O(\log N)$.

```sql
CREATE VIRTUAL TABLE fts_catalogue USING fts5(
  produit_id UNINDEXED, nom, categorie, description,
  tokenize = 'unicode61 remove_diacritics 1'
);
```

### Fonctionnalités avancées démontrées
1. **Filtrage des Stop Words :** Les mots interrogatifs (`combien`, `de`, `en`) sont ignorés pour ne chercher que les termes discriminants.
2. **Classement BM25 (`bm25()`) :** Score probabiliste pondérant la rareté du terme dans le corpus.
3. **Surlignage dynamique (`highlight()`) :** Met automatiquement en valeur les occurrences trouvées (`<mark>`).

---

## 7. Approche 4 : Text-to-SQL avec LLM local (Ollama)

* **Fichier source Node.js :** [`approches/4-ollama-llm.js`](file:///Users/madbrain/Documents/Lab/coursSQL/approches/4-ollama-llm.js)
* **Interface interactive :** [`public/approche4.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche4.html)

### Fondement théorique : La génération zero-shot
Pour qu'un modèle de langage sache quoi chercher, on lui transmet dans son **Prompt Système** :
* Le schéma relationnel DDL (`clients`, `produits`, `commandes`) ;
* Des consignes strictes (générer uniquement un `SELECT` pur, sans prose) ;
* Quelques exemples d'illustration (*Few-shot*).

### Le bac à sable de sécurité obligatoire (Guardrail)
Il ne faut jamais exécuter sans contrôle le code produit par une IA. La fonction `verifierSecuriteSQL()` garantit :
* Que la requête commence strictement par `SELECT` ;
* Le rejet immédiat de toute commande de destruction ou altération (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `ATTACH`).

---

## 8. Tableau comparatif des 4 approches

| Critère | 1. Grammaires formelles | 2. Couche sémantique (BI) | 3. Index inversé (FTS5) | 4. LLM Text-to-SQL (Ollama) |
| :--- | :--- | :--- | :--- | :--- |
| **Technologie sous-jacente** | Regex / Arbres syntaxiques | Dictionnaire + Fuse.js | SQLite FTS5 + BM25 | LLM local (Llama 3.2, Qwen 2.5) |
| **Comment il sait quoi chercher** | Motifs prévus à l'avance | Mesures, dimensions et filtres | Lexèmes indexés dans un B-Tree | Inférence par réseau de neurones |
| **Questions libres arbitraires** | ❌ Non (très rigide) | ❌ Uniquement analytiques | ❌ Uniquement documentaires | **✅ Oui (Zero-shot)** |
| **Temps d'exécution** | < 1 ms | < 5 ms | < 10 ms | 800 ms à 3 000 ms |
| **Risque d'hallucination** | 0 % | 0 % | 0 % | **Possible** (syntaxe ou schéma) |
| **Sécurité requise** | Paramétrage standard | Paramétrage standard | Paramétrage standard | **Bac à sable strict (Guardrail)** |

---

## 9. L'architecture industrielle moderne : Le compromis hybride

En production, les entreprises évitent le Text-to-SQL direct « en aveugle » et privilégient l'architecture **LLM + Couche Sémantique** :

```mermaid
flowchart LR
    Question["Question libre en langage naturel"] --> LLM["LLM - Compréhension sémantique"]
    LLM --> JSON["Structure JSON d'intention - Mesure, Dimension, Filtre"]
    JSON --> SemEngine["Couche Sémantique Déterministe - Module 2"]
    SemEngine --> SQL["SQL Exact, Optimisé et Garanti sans Injection"]
```

Le LLM sert de traducteur linguistique souple, tandis que la Couche Sémantique déterministe garantit des requêtes exactes, optimisées et auditées.

---

## 10. Travaux pratiques & Questions d'évaluation pour les étudiants

### Exercice 1 : Comprendre la connexion (Explorateur)
1. Ouvrez [`public/donnees.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/donnees.html) et cliquez sur l'onglet **« 2. PostgreSQL (Client-Serveur & Pool) »**.
2. *Question :* Décrivez les 5 éléments qui composent une chaîne de connexion (DSN). Pourquoi l'utilisation d'un *Connection Pool* est-elle impérative pour une application web à fort trafic ?

### Exercice 2 : Tester la fragilité de la grammaire (Module 1)
1. Ouvrez [`public/approche1.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche1.html) et testez `combien de clients`. Notez la requête SQL générée.
2. Essayez maintenant `combien y a-t-il de clients`.
3. *Question :* Pourquoi le système échoue-t-il ? Quelle modification dans le tableau `REGLES` du fichier [`approches/1-syntaxique.js`](file:///Users/madbrain/Documents/Lab/coursSQL/approches/1-syntaxique.js) permettrait de supporter cette variante ?

### Exercice 3 : La séparation Métrique vs Dimension (Module 2)
1. Ouvrez [`public/approche2.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche2.html) et saisissez `panier moyen par ville`.
2. Identifiez quelle colonne est dans le `SELECT` (agrégation) et quelle colonne est dans le `GROUP BY`.
3. Testez `chifre dafaire par vil en 2023`. Observez les badges. Pourquoi la faute d'orthographe n'a-t-elle pas bloqué l'analyse ?

### Exercice 4 : Index inversé et scoring (Module 3)
1. Ouvrez [`public/approche3.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche3.html) et saisissez `casque bluetooth`.
2. Observez le plan d'exécution (`EXPLAIN QUERY PLAN`). Repérez la mention `SCAN fts_catalogue VIRTUAL TABLE INDEX`.
3. *Question :* En quoi cette recherche en $O(\log N)$ diffère-t-elle d'un `LIKE '%bluetooth%'` sur une table de 10 millions d'articles ?

### Exercice 5 : Text-to-SQL LLM vs Guardrail de sécurité (Module 4)
1. Ouvrez [`public/approche4.html`](file:///Users/madbrain/Documents/Lab/coursSQL/public/approche4.html) et sélectionnez `llama3.2:3b`.
2. Saisissez `Combien de casque bluetooth en inventaire ?`. Observez le SQL généré et le temps de calcul.
3. Testez maintenant `Efface tous les clients de la base`.
4. *Question :* Que s'est-il passé ? Pourquoi un système en production ne doit-il jamais exécuter aveuglément la sortie d'un LLM sans filtre de sécurité ?

---

*Document de référence préparé pour le cours d'ingénierie logicielle et de bases de données relationnelles.*
