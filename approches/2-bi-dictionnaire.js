// approches/2-bi-dictionnaire.js
// APPROCHE 2 : Le « Q&A » des outils de Business Intelligence (BI)
//
// Principe : Inspiré de Power BI Q&A et Tableau Ask Data.
// On ne cherche pas une phrase complète avec sujet/verbe. On découpe la saisie et on associe
// chaque mot à une "Couche Sémantique" composée de :
// 1. Métriques (Mesures) : agrégations numériques (SUM, AVG, COUNT...)
// 2. Dimensions : axes d'analyse pour le GROUP BY (client, ville, catégorie, année...)
// 3. Filtres : valeurs connues dans la base (ex: 'Paris', '2023', 'livree')
//
// Une recherche floue (Fuzzy search avec Fuse.js) permet de tolérer les fautes de frappe.

const Fuse = require('fuse.js');
const db = require('../database/db');

// 1. Définition du dictionnaire sémantique (Catalogue de métadonnées)
const METRIQUES = [
  {
    id: 'chiffre_affaires',
    sqlExpr: 'ROUND(SUM(montant_total), 2)',
    label: 'Chiffre d’affaires (€)',
    synonymes: ['ventes', 'vente', 'chiffre daffaires', 'chiffre affaires', 'ca', 'recettes', 'montant total', 'revenu']
  },
  {
    id: 'panier_moyen',
    sqlExpr: 'ROUND(AVG(montant_total), 2)',
    label: 'Panier moyen (€)',
    synonymes: ['panier moyen', 'prix moyen', 'moyenne des commandes', 'depense moyenne']
  },
  {
    id: 'nombre_commandes',
    sqlExpr: 'COUNT(commande_id)',
    label: 'Nombre de commandes',
    synonymes: ['commandes', 'commande', 'nombre de commandes', 'volume', 'achats']
  },
  {
    id: 'quantite_vendue',
    sqlExpr: 'SUM(quantite)',
    label: 'Quantité totale vendue',
    synonymes: ['quantite', 'quantites', 'unites', 'pieces', 'nombre articles']
  },
  {
    id: 'nombre_clients',
    sqlExpr: 'COUNT(DISTINCT client_id)',
    label: 'Nombre de clients distincts',
    synonymes: ['clients', 'nombre de clients', 'acheteurs']
  }
];

const DIMENSIONS = [
  {
    id: 'client_nom',
    colonne: 'client_nom',
    label: 'Client',
    synonymes: ['client', 'clients', 'acheteur', 'acheteurs', 'personne', 'nom']
  },
  {
    id: 'client_ville',
    colonne: 'client_ville',
    label: 'Ville',
    synonymes: ['ville', 'villes', 'commune', 'agglomeration', 'localisation']
  },
  {
    id: 'client_pays',
    colonne: 'client_pays',
    label: 'Pays',
    synonymes: ['pays', 'nation', 'territoire']
  },
  {
    id: 'produit_categorie',
    colonne: 'produit_categorie',
    label: 'Catégorie de produit',
    synonymes: ['categorie', 'categories', 'rayon', 'type de produit']
  },
  {
    id: 'produit_nom',
    colonne: 'produit_nom',
    label: 'Nom du produit',
    synonymes: ['produit', 'produits', 'article', 'articles', 'item']
  },
  {
    id: 'annee',
    colonne: 'annee',
    label: 'Année',
    synonymes: ['annee', 'annees', 'date', 'periode', 'an']
  },
  {
    id: 'statut',
    colonne: 'statut',
    label: 'Statut de commande',
    synonymes: ['statut', 'etat', 'avancement']
  }
];

// 2. Indexation des valeurs réelles distinctes dans la base pour les filtres automatiques
function chargerValeursConnues() {
  const valeurs = [];

  // Années présentes
  const annees = db.prepare(`SELECT DISTINCT strftime('%Y', date_commande) as v FROM commandes;`).all();
  for (const a of annees) {
    valeurs.push({ valeur: a.v, colonne: 'annee', labelCol: 'Année', type: 'annee' });
  }

  // Villes présentes
  const villes = db.prepare(`SELECT DISTINCT ville as v FROM clients;`).all();
  for (const v of villes) {
    valeurs.push({ valeur: v.v, colonne: 'client_ville', labelCol: 'Ville', type: 'texte' });
  }

  // Pays présents
  const pays = db.prepare(`SELECT DISTINCT pays as v FROM clients;`).all();
  for (const p of pays) {
    valeurs.push({ valeur: p.v, colonne: 'client_pays', labelCol: 'Pays', type: 'texte' });
  }

  // Catégories présentes
  const categories = db.prepare(`SELECT DISTINCT categorie as v FROM produits;`).all();
  for (const c of categories) {
    valeurs.push({ valeur: c.v, colonne: 'produit_categorie', labelCol: 'Catégorie', type: 'texte' });
  }

  // Statuts présents
  const statuts = db.prepare(`SELECT DISTINCT statut as v FROM commandes;`).all();
  for (const s of statuts) {
    valeurs.push({ valeur: s.v, colonne: 'statut', labelCol: 'Statut', type: 'texte' });
  }

  return valeurs;
}

const VALEURS_CONNUES = chargerValeursConnues();

// Configuration de Fuse.js pour la recherche floue
// Permet de retrouver des métriques ou dimensions même avec des fautes de frappe
const fuseMetriques = new Fuse(
  METRIQUES.flatMap(m => m.synonymes.map(s => ({ synonyme: s, metrique: m }))),
  { keys: ['synonyme'], includeScore: true, threshold: 0.4 }
);

const fuseDimensions = new Fuse(
  DIMENSIONS.flatMap(d => d.synonymes.map(s => ({ synonyme: s, dimension: d }))),
  { keys: ['synonyme'], includeScore: true, threshold: 0.4 }
);

const fuseValeurs = new Fuse(
  VALEURS_CONNUES,
  { keys: ['valeur'], includeScore: true, threshold: 0.3 }
);

/**
 * Nettoie et normalise une chaîne (retrait ponctuation, minuscules)
 */
function normaliser(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlever accents
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyse une requête Q&A façon Power BI / Tableau
 * @param {string} phrase - Phrase saisie par l'utilisateur
 */
function executerApproche2(phrase) {
  const texteBrut = phrase.trim();
  const texteNorm = normaliser(texteBrut);

  const etapes = [];
  etapes.push({
    etape: '1. Analyse lexicale et normalisation',
    detail: `Texte original : "${texteBrut}" → Normalisé : "${texteNorm}"`
  });

  const mots = texteNorm.split(' ').filter(w => w.length > 1);

  // Mots de liaison à ignorer (Stop words)
  const stopWords = new Set(['par', 'en', 'de', 'du', 'des', 'les', 'le', 'la', 'pour', 'dans', 'avec', 'et', 'quel', 'quelle', 'quels', 'quelles', 'est', 'sont']);
  const motsFiltres = mots.filter(m => !stopWords.has(m));

  const elementsDetectes = {
    metriques: new Map(),
    dimensions: new Map(),
    filtres: []
  };

  // 1. Découpage en n-grams (groupes de 3, 2 et 1 mots)
  // On priorise les expressions longues ("chiffre d'affaires") sur les mots isolés
  const ngrams = [];
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i <= motsFiltres.length - len; i++) {
      const slice = motsFiltres.slice(i, i + len);
      ngrams.push({
        texte: slice.join(' '),
        taille: len,
        indexDebut: i,
        indexFin: i + len
      });
    }
  }

  // Traiter les n-grams par ordre de longueur décroissante
  const indexConsommes = new Set();

  for (const ng of ngrams) {
    // Vérifier si une partie de ce n-gram a déjà été assignée à un concept prioritaire
    let dejaPris = false;
    for (let k = ng.indexDebut; k < ng.indexFin; k++) {
      if (indexConsommes.has(k)) { dejaPris = true; break; }
    }
    if (dejaPris) continue;

    // Comparer les correspondances potentielles (Métrique, Dimension, Valeur)
    // et choisir celle avec le MEILLEUR score (score le plus proche de 0)
    let meilleurMatch = null;

    // 1. Match Valeur Réelle (Filtre WHERE)
    const matchVal = fuseValeurs.search(ng.texte);
    if (matchVal.length > 0 && matchVal[0].score < 0.25) {
      const filtre = matchVal[0].item;
      const ratio = Math.abs(ng.texte.length - filtre.valeur.length) / Math.max(ng.texte.length, filtre.valeur.length);
      if (ratio < 0.45) {
        meilleurMatch = { type: 'VALEUR', score: matchVal[0].score, data: filtre };
      }
    }

    // 2. Match Dimension (GROUP BY)
    const matchDim = fuseDimensions.search(ng.texte);
    if (matchDim.length > 0 && matchDim[0].score < 0.35) {
      const d = matchDim[0].item.dimension;
      const synonyme = matchDim[0].item.synonyme;
      const ratio = Math.abs(ng.texte.length - synonyme.length) / Math.max(ng.texte.length, synonyme.length);
      if (ratio < 0.5) {
        if (!meilleurMatch || matchDim[0].score < meilleurMatch.score) {
          meilleurMatch = { type: 'DIMENSION', score: matchDim[0].score, data: d };
        }
      }
    }

    // 3. Match Métrique (Agrégation)
    const matchMet = fuseMetriques.search(ng.texte);
    if (matchMet.length > 0 && matchMet[0].score < 0.35) {
      const m = matchMet[0].item.metrique;
      const synonyme = matchMet[0].item.synonyme;
      const ratio = Math.abs(ng.texte.length - synonyme.length) / Math.max(ng.texte.length, synonyme.length);
      if (ratio < 0.5) {
        if (!meilleurMatch || matchMet[0].score < meilleurMatch.score) {
          meilleurMatch = { type: 'METRIQUE', score: matchMet[0].score, data: m };
        }
      }
    }

    // Appliquer le meilleur match trouvé pour ce n-gram
    if (meilleurMatch) {
      if (meilleurMatch.type === 'VALEUR') {
        const filtre = meilleurMatch.data;
        if (!elementsDetectes.filtres.some(f => f.colonne === filtre.colonne && f.valeur === filtre.valeur)) {
          elementsDetectes.filtres.push(filtre);
          for (let k = ng.indexDebut; k < ng.indexFin; k++) indexConsommes.add(k);
        }
      } else if (meilleurMatch.type === 'DIMENSION') {
        elementsDetectes.dimensions.set(meilleurMatch.data.id, meilleurMatch.data);
        for (let k = ng.indexDebut; k < ng.indexFin; k++) indexConsommes.add(k);
      } else if (meilleurMatch.type === 'METRIQUE') {
        elementsDetectes.metriques.set(meilleurMatch.data.id, meilleurMatch.data);
        for (let k = ng.indexDebut; k < ng.indexFin; k++) indexConsommes.add(k);
      }
    }
  }

  etapes.push({
    etape: '4. Filtres de valeurs identifiés (WHERE)',
    detail: elementsDetectes.filtres.length > 0
      ? elementsDetectes.filtres.map(f => `${f.labelCol} = "${f.valeur}"`).join(' ET ')
      : 'Aucun filtre'
  });

  // 4. Compilation SQL
  // Source de données : vue dénormalisée 'vue_ventes'
  const selectParts = [];
  const groupByParts = [];
  const whereParts = [];
  const params = [];

  // Dimensions
  for (const dim of elementsDetectes.dimensions.values()) {
    selectParts.push(`${dim.colonne} AS "${dim.label}"`);
    groupByParts.push(dim.colonne);
  }

  // Métriques
  for (const met of elementsDetectes.metriques.values()) {
    selectParts.push(`${met.sqlExpr} AS "${met.label}"`);
  }

  // Filtres
  for (const f of elementsDetectes.filtres) {
    whereParts.push(`${f.colonne} = ?`);
    params.push(f.valeur);
  }

  let sql = `SELECT ${selectParts.join(', ')} FROM vue_ventes`;
  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(' AND ')}`;
  }
  if (groupByParts.length > 0) {
    sql += ` GROUP BY ${groupByParts.join(', ')}`;
    // Trier par la première métrique décroissante par défaut
    sql += ` ORDER BY 2 DESC`;
  }
  sql += ` LIMIT 50;`;

  etapes.push({
    etape: '5. Assemblage SQL (Compilateur sémantique)',
    detail: sql
  });

  // Exécution de la requête
  try {
    const stmt = db.prepare(sql);
    const resultats = stmt.all(...params);

    const planStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    const plan = planStmt.all(...params);

    // Reformulation en langage clair pour rassurer l'utilisateur (façon Power BI)
    const reformulation = {
      afficher: Array.from(elementsDetectes.metriques.values()).map(m => m.label),
      ventilerPar: Array.from(elementsDetectes.dimensions.values()).map(d => d.label),
      filtrerSur: elementsDetectes.filtres.map(f => `${f.labelCol} = ${f.valeur}`)
    };

    return {
      succes: true,
      question: texteBrut,
      reformulation,
      sql,
      params,
      planExecution: plan,
      etapes,
      resultats,
      totalLignes: resultats.length
    };
  } catch (err) {
    return {
      succes: false,
      question: texteBrut,
      erreur: err.message,
      etapes
    };
  }
}

module.exports = {
  executerApproche2,
  METRIQUES,
  DIMENSIONS,
  VALEURS_CONNUES
};
