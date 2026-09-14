# Laboratoire SQL : Traitement de requêtes & Connexion aux bases de données

Projet pédagogique complet pour l'enseignement de deux piliers fondamentaux du génie logiciel :
1. **L'architecture de connexion aux bases de données** (SQLite in-process vs PostgreSQL client-serveur, sockets TCP/IP, connection pooling, chaînes de connexion DSN et portabilité multi-SGBD).
2. **La traduction d'intentions en requêtes relationnelles** (4 modules : grammaires formelles, couche sémantique BI & fuzzy matching, index inversé FTS5 & scoring BM25, et LLM local Text-to-SQL avec Ollama).

Développé avec **Node.js 22 LTS**, **SQLite natif** (`node:sqlite`), **Express**, **Fuse.js**, et **Ollama**.

---

## Démarrage rapide

### 1. Prérequis
* **Node.js v22+** (utilise le module natif `node:sqlite`, aucun compilateur C++ requis).
* *(Optionnel pour le Module 4)* **[Ollama](https://ollama.com/)** installé localement avec un modèle (ex: `ollama run llama3.2:3b`).

### 2. Installation & Lancement
```bash
# 1. Cloner le dépôt
git clone https://github.com/martindufresne/LabSQL.git
cd LabSQL

# 2. Installer les dépendances légères (Express, Fuse.js)
npm install

# 3. Lancer l'application (initialise et remplit automatiquement la base SQLite)
npm start
```

Ouvrez ensuite votre navigateur sur : **[http://localhost:3000](http://localhost:3000)**

---

## Interfaces et démonstrations

* 📊 **[Vue d'ensemble](http://localhost:3000)** : Comparatif synthétique des architectures et banc d'essai.
* 📖 **[Notes de cours (HTML)](http://localhost:3000/cours.html)** : Manuel complet de cours, diagrammes d'architecture vectoriels, fondements théoriques et 5 travaux pratiques avec questions d'évaluation (exportable en PDF).
* 🗄️ **[Explorateur de données](http://localhost:3000/donnees.html)** : Visualisation des tables relationnelles, de la vue analytique, de l'index FTS5 et panneau explicatif sur la plomberie de connexion réseau vs in-process.
* 🧩 **[Module 1 : Grammaire formelle](http://localhost:3000/approche1.html)** : Analyse syntaxique par expressions régulières et dérivation de règles.
* 📈 **[Module 2 : Couche sémantique BI](http://localhost:3000/approche2.html)** : Décomposition en métriques, dimensions et filtres avec tolérance aux fautes (Levenshtein via Fuse.js).
* 🔍 **[Module 3 : Index inversé & FTS5](http://localhost:3000/approche3.html)** : Moteur plein texte en $O(\log N)$, filtrage des stop-words, scoring BM25 et surlignage.
* 🤖 **[Module 4 : LLM Text-to-SQL](http://localhost:3000/approche4.html)** : Génération zero-shot via Ollama local et guardrail de sécurité strict anti-injection.

---

## Structure du projet

```
LabSQL/
├── COURS.html                     # Notes de cours complètes en HTML (avec diagrammes vectoriels)
├── COURS.md                       # Support de cours source en Markdown
├── README.md                      # Documentation du projet
├── server.js                      # Serveur Web Express & routes API
├── database/
│   ├── db.js                      # Connexion SQLite native (node:sqlite)
│   ├── init.js                    # Schéma relationnel, vue_ventes, table virtuelle FTS5 et seed
│   ├── data.db                    # Base de données SQLite locale pré-peuplée
│   └── exemples-connexions.js     # Script pédagogique comparant SQLite, PostgreSQL et Knex.js
├── approches/
│   ├── 1-syntaxique.js            # Module 1 : Analyse syntaxique et grammaire formelle
│   ├── 2-bi-dictionnaire.js       # Module 2 : Couche sémantique BI & Fuse.js
│   ├── 3-moteur-recherche.js      # Module 3 : Index inversé SQLite FTS5 & scoring BM25
│   └── 4-ollama-llm.js            # Module 4 : Text-to-SQL avec LLM local Ollama & Guardrail
└── public/
    ├── css/style.css              # Feuille de style épurée type laboratoire d'ingénierie
    ├── js/mermaid.min.js          # Rendu hors-ligne des diagrammes d'architecture
    ├── cours.html                 # Version web des notes de cours (avec sidebar sticky et mode print)
    ├── index.html                 # Page d'accueil & tableau comparatif
    ├── donnees.html               # Explorateur de tables & panneau d'architecture réseau
    ├── approche1.html             # Console interactive Module 1
    ├── approche2.html             # Console interactive Module 2
    ├── approche3.html             # Console interactive Module 3
    └── approche4.html             # Console interactive Module 4
```

---

## Licence

Projet conçu pour un usage pédagogique et académique.
