# 📊 Copilot Actuariel — Extraction KPI & RAG Financier

> **Une architecture d'IA Générative (RAG) et un pipeline ETL robuste appliqués à l'analyse quantitative et à la conformité du secteur de l'assurance.**

Ce projet est une plateforme financière et actuarielle full-stack alimentée par l'Intelligence Artificielle. Elle automatise l'extraction, le nettoyage, la structuration et l'interrogation intelligente (RAG) des états financiers de compagnies d'assurance et institutions financières majeures, en stricte conformité avec les normes comptables sectorielles (NC 26-31).

---

## 🏗️ Architecture du Système & Fonctionnalités

Le projet s'articule autour de trois composants clés :

### 1. Le Moteur ETL Actuariel (`backend/etl/`)
* **Ingestion & Parsing :** Extraction brute des données textuelles et tabulaires depuis des rapports PDF financiers complexes.
* **Classification de Documents (`document_classifier.py`) :** Identification automatique de la nature des états financiers (Bilans, Comptes de résultat, Annexes).
* **Pipeline de Nettoyage (`data_cleaner.py` & `cleaning_rules.py`) :** Normalisation des structures de données, gestion des valeurs manquantes et application des règles métiers comptables.
* **Calcul des KPIs Actuariels (`build_canonical_kpis.py`) :** Extraction automatisée des indicateurs clés de performance : primes émises brutes, charges de sinistres, marge technique et provisions.

### 2. Le Moteur RAG & IA Générative (`backend/rag/` & `gemini_service.py`)
* **Architecture RAG (Retrieval-Augmented Generation) :** Implémentation complète d'un système de recherche sémantique.
* **Embedding & Retrieval (`embedder.py`, `retriever.py`) :** Vectorisation des rapports financiers et recherche contextuelle pour garantir des réponses sans hallucination.
* **Interconnexion LLM :** Intégration avancée de l'API Gemini pour générer des analyses de conformité, des benchmarks concurrentiels et des résumés exécutifs à destination des actuaires et risk managers.

### 3. L'API REST Exécutive (`backend/api/`)
* **FastAPI Backend :** Déploiement d'endpoints performants, asynchrones et entièrement documentés pour exposer les KPIs extraits et le moteur de chat IA.
* **Persistance PostgreSQL (`db_loader_psql.py`) :** Stockage relationnel structuré des indicateurs financiers normalisés pour permettre le requêtage analytique historique et le benchmarking.

---

## 🛠️ Stack Technique

* **Langage Principal :** Python (3.13)
* **Framework API :** FastAPI
* **IA & LLM :** API Google Gemini / Vertex AI, LangChain / LlamaIndex (logique d'orchestration RAG)
* **Data Engineering & Analytics :** Pandas, NumPy, Pydantic (validation de schéma financier)
* **Base de Données :** PostgreSQL (Infrastructures des KPIs canoniaux)

---

## 📂 Structure du Code Source

```text
backend/
├── api/                  # Routes FastAPI, gestion de la base de données et des artefacts
│   ├── db.py             # Configuration de la connexion DB
│   ├── financial_routes.py # Endpoints d'accès aux KPIs et états financiers
│   └── main.py           # Point d'entrée de l'application API
├── etl/                  # Pipeline d'Extraction, Transformation et Chargement
│   ├── data_cleaner.py   # Algorithmes de nettoyage des données brutes
│   ├── document_classifier.py # Classification intelligente des sections financières
│   ├── gemini_service.py # Appels LLM pour l'extraction structurée de KPIs
│   └── db_loader_psql.py # Scripts de chargement dans PostgreSQL
├── rag/                  # Moteur d'IA conversationnelle augmentée (RAG)
│   ├── embedder.py       # Vectorisation du texte financier
│   └── retriever.py      # Recherche de contexte pertinent dans les rapports
data/                     # Entrepôt de données (PDFs bruts, CSVs normalisés, KPIs JSON)
```

---

## 🚀 Installation & Utilisation

### 1. Prérequis
Avant de commencer, assurez-vous de disposer des éléments suivants :
* **Python 3.13** installé sur votre machine
* Une instance **PostgreSQL** active (locale ou cloud)
* Une clé API valide pour le service LLM (ex: **Gemini API Key**)

### 2. Configuration de l'environnement
Clonez le projet, accédez au dossier du backend, puis créez votre fichier de configuration `.env` à partir du modèle fourni :

```bash
git clone [https://github.com/Malekchairat/Platforme-actuariel.git](https://github.com/Malekchairat/Platforme-actuariel.git)
cd Platforme-actuariel/backend
cp .env.example .env
```

Ouvrez le fichier `.env` nouvellement créé et ajustez vos variables d'environnement (Clés d'API des LLMs, URL de connexion à votre base PostgreSQL, etc.).

### 3. Installation des dépendances & Lancement
Installez les packages requis à l'aide de `pip`, puis lancez le serveur de développement via `uvicorn` :

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload
```

L'API sera instantanément disponible sur `http://localhost:8000`. Vous pouvez accéder à la documentation interactive et tester les différents endpoints directement sur `http://localhost:8000/docs`.

---

## 📈 Cas d'Usage Métier (Value Proposition)

* **Automatisation de l'Audit Interne :** Réduction drastique du temps passé par les équipes actuarielles à éplucher manuellement des rapports financiers au format PDF (parfois supérieurs à 100 pages) pour en extraire les annexes techniques.
* **Benchmark Concurrentiel Instantané :** Grâce au stockage unifié de tous les indicateurs extraits au format canonique (`ALL_SOCIETES_kpis.csv`), la plateforme permet une comparaison immédiate des ratios de sinistralité et des parts de marché des différents acteurs du secteur (ASTREE, STAR, GAT, etc.).
* **Analyse de Risque Augmentée :** Requêtage en langage naturel des données historiques et textuelles des rapports via le moteur RAG intégré (ex: *"Quelle est l'évolution des provisions mathématiques d'ASTREE entre 2024 et 2025 ?"*).

---

## 👤 Développeur

* **Malek Chairat** - Élève Ingénieure en Data Science (ESPRIT) & Double Diplôme M2 Actuariat (Université du Mans)

```
