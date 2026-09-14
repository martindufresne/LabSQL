// approches/1-syntaxique.js
// APPROCHE 1 : Analyseur syntaxique et grammaires formelles (NL2SQL classique)
//
// Principe : Le moteur applique des règles déterministes strictes (grammaires ou motifs regex).
// Chaque règle extrait des variables ("slots") et les injecte dans un template de requête SQL.
// Si la phrase ne respecte aucun motif connu, le système échoue immédiatement.

const db = require('../database/db');

// Dictionnaire des correspondances d'entités (tables autorisées)
const ENTITES = {
  'clients': { table: 'clients', label: 'Clients' },
  'client': { table: 'clients', label: 'Clients' },
  'produits': { table: 'produits', label: 'Produits' },
  'produit': { table: 'produits', label: 'Produits' },
  'commandes': { table: 'commandes', label: 'Commandes' },
  'commande': { table: 'commandes', label: 'Commandes' }
};

// Dictionnaire des colonnes autorisées pour le filtrage
const COLONNES = {
  'prix': 'prix',
  'stock': 'stock',
  'ville': 'ville',
  'pays': 'pays',
  'statut': 'statut',
  'categorie': 'categorie'
};

// Liste ordonnée de règles grammaticales (Patterns)
const REGLES = [
  {
    id: 'COMPTAGE_TOTAL',
    description: "Comptage simple : 'combien de [entité]'",
    pattern: /^combien\s+de\s+([a-zéèêëàâîïôöûüç]+)$/i,
    compiler: (match) => {
      const entiteCle = match[1].toLowerCase();
      const entite = ENTITES[entiteCle];
      if (!entite) {
        throw new Error(`Entité inconnue : "${entiteCle}". Entités valides : ${Object.keys(ENTITES).join(', ')}`);
      }
      return {
        sql: `SELECT COUNT(*) AS total FROM ${entite.table};`,
        params: [],
        descriptionExplication: `Comptage direct de toutes les lignes dans la table "${entite.table}".`
      };
    }
  },
  {
    id: 'COMPTAGE_AVEC_STATUT',
    description: "Comptage avec filtre : 'combien de commandes [statut]'",
    pattern: /^combien\s+de\s+commandes\s+(livrees?|en attente|annulees?)$/i,
    compiler: (match) => {
      let statut = match[1].toLowerCase();
      if (statut.endsWith('s')) statut = statut.slice(0, -1); // normalisation pluriel/singulier
      return {
        sql: `SELECT COUNT(*) AS total FROM commandes WHERE statut = ?;`,
        params: [statut],
        descriptionExplication: `Comptage des commandes filtrées sur la valeur statut = "${statut}".`
      };
    }
  },
  {
    id: 'LISTE_PAR_LIEU',
    description: "Filtrage géographique : 'liste des clients de [ville/pays]'",
    pattern: /^(?:liste\s+des\s+)?clients\s+de\s+([a-zéèêëàâîïôöûüç\s-]+)$/i,
    compiler: (match) => {
      const lieu = match[1].trim();
      return {
        sql: `SELECT id, nom, email, ville, pays FROM clients WHERE LOWER(ville) = LOWER(?) OR LOWER(pays) = LOWER(?);`,
        params: [lieu, lieu],
        descriptionExplication: `Sélection des clients avec clause WHERE sur ville ou pays = "${lieu}".`
      };
    }
  },
  {
    id: 'COMPARAISON_NUMERIQUE',
    description: "Filtre numérique : '[entité] avec [attribut] [< > =] [nombre]'",
    pattern: /^(produits|commandes)\s+avec\s+([a-z]+)\s*(>|<|>=|<=|=)\s*([0-9]+(?:\.[0-9]+)?)$/i,
    compiler: (match) => {
      const entiteCle = match[1].toLowerCase();
      const colonneCle = match[2].toLowerCase();
      const operateur = match[3];
      const valeur = parseFloat(match[4]);

      const entite = ENTITES[entiteCle];
      const colonne = COLONNES[colonneCle];

      if (!entite) throw new Error(`Entité "${entiteCle}" non supportée.`);
      if (!colonne) throw new Error(`Colonne "${colonneCle}" non autorisée pour cette règle.`);

      return {
        sql: `SELECT * FROM ${entite.table} WHERE ${colonne} ${operateur} ?;`,
        params: [valeur],
        descriptionExplication: `Filtrage de la table "${entite.table}" avec l'opérateur "${operateur}" sur la colonne "${colonne}".`
      };
    }
  },
  {
    id: 'COMMANDES_APRES_DATE',
    description: "Filtre temporel : 'commandes apres le [AAAA-MM-JJ]'",
    pattern: /^commandes\s+apr[eè]s\s+le\s+([0-9]{4}-[0-9]{2}-[0-9]{2})$/i,
    compiler: (match) => {
      const date = match[1];
      return {
        sql: `SELECT * FROM commandes WHERE date_commande > ? ORDER BY date_commande ASC;`,
        params: [date],
        descriptionExplication: `Extraction des commandes avec une date strictement supérieure à "${date}".`
      };
    }
  }
];

/**
 * Analyse une phrase en langage naturel à l'aide de grammaires/règles formelles
 * @param {string} question - Question posée par l'utilisateur
 * @returns {object} Détails de l'analyse, SQL généré et résultats de la requête
 */
function executerApproche1(question) {
  const qClean = question.trim();
  const etapes = [];

  etapes.push({
    etape: '1. Normalisation du texte',
    detail: `Entrée nettoyée : "${qClean}"`
  });

  // Tester successivement chaque règle grammaticale
  for (const regle of REGLES) {
    const match = qClean.match(regle.pattern);
    if (match) {
      etapes.push({
        etape: '2. Correspondance de règle trouvée',
        detail: `Règle ID : "${regle.id}" (${regle.description})`
      });

      try {
        const compilation = regle.compiler(match);
        etapes.push({
          etape: '3. Compilation du modèle SQL',
          detail: compilation.descriptionExplication
        });

        // Exécution sécurisée avec requête préparée
        const stmt = db.prepare(compilation.sql);
        const resultats = stmt.all(...compilation.params);

        // Récupérer le plan d'exécution SQLite pour la valeur pédagogique
        const planStmt = db.prepare(`EXPLAIN QUERY PLAN ${compilation.sql}`);
        const plan = planStmt.all(...compilation.params);

        return {
          succes: true,
          question: qClean,
          regleUtilisee: regle.id,
          sql: compilation.sql,
          params: compilation.params,
          planExecution: plan,
          etapes,
          resultats,
          totalLignes: resultats.length
        };
      } catch (err) {
        return {
          succes: false,
          question: qClean,
          erreur: err.message,
          etapes
        };
      }
    }
  }

  // Si aucune règle n'a correspondu : échec typique de l'approche par grammaire rigide
  return {
    succes: false,
    question: qClean,
    erreur: `Aucune règle grammaticale ne correspond à votre phrase. 
Dans un système à grammaires formelles, la formulation doit respecter exactement l'une des structures prévues.`,
    reglesDisponibles: REGLES.map(r => r.description),
    etapes
  };
}

module.exports = { executerApproche1, REGLES };
