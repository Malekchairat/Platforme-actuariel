#!/usr/bin/env python
"""
Script de synchronisation intelligent pour migrer l'historique vers PostgreSQL.
Détecte automatiquement les erreurs de configuration et injecte les secrets de config.py.
"""
from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path

# Ajouter le dossier racine du projet pour permettre les imports absolus
BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(BASE_DIR))

# Importation de vos configurations centralisées et des loaders
from backend.etl import config
from backend.etl.db_loader_psql import load_json_to_insurance_reports

def auto_configure_and_diagnose() -> bool:
    """
    Configure l'environnement requis par psql à partir de config.py
    et réalise un diagnostic de connexion préventif.
    """
    print("🔍 Analyse de la configuration et des variables d'accès...")
    
    # Cartographie automatique : passage de vos variables config.py aux variables lues par psql
    os.environ["PGHOST"] = str(config.DB_HOST)
    os.environ["PGPORT"] = str(config.DB_PORT)
    os.environ["PGUSER"] = str(config.DB_USER)
    os.environ["PGPASSWORD"] = str(config.DB_PASSWORD)
    os.environ["PGDATABASE"] = str(config.DB_NAME) 

    print(f"   -> Hôte : {os.environ['PGHOST']}:{os.environ['PGPORT']}")
    print(f"   -> Utilisateur : {os.environ['PGUSER']}")
    print(f"   -> Base cible : {os.environ['PGDATABASE']}")
    print(f"   -> Mot de passe détecté : {'******' if config.DB_PASSWORD else 'AUCUN'}")

    # Test à blanc (Pre-flight check) via psql
    test_cmd = ["psql", "-c", "SELECT 1;"]
    try:
        proc = subprocess.run(
            test_cmd, 
            text=True, 
            capture_output=True, 
            env=os.environ.copy(), 
            timeout=5
        )
        
        if proc.returncode == 0:
            print("✅ Connexion à PostgreSQL réussie ! Aucune saisie requise.\n")
            return True
        
        # Identification de l'erreur
        error_msg = proc.stderr.lower()
        print("\n❌ CRITICAL : Échec du diagnostic de connexion automatique.")
        
        if "password authentication failed" in error_msg:
            print(f"👉 CAUSE : Le mot de passe ('{config.DB_PASSWORD}') défini pour '{config.DB_USER}' est incorrect.")
            print("👉 ACTION : Corrigez la valeur de 'DB_PASSWORD' dans 'backend/etl/config.py' ou dans votre fichier '.env'.")
        elif "database" in error_msg and "does not exist" in error_msg:
            print(f"👉 CAUSE : La base de données '{config.DB_NAME}' n'existe pas encore sur votre serveur Postgres.")
            print(f"👉 ACTION : Créez-la via pgAdmin ou exécutez : psql -U {config.DB_USER} -c \"CREATE DATABASE {config.DB_NAME};\"")
        elif "could not connect to server" in error_msg or "is the server running" in error_msg:
            print("👉 CAUSE : Le serveur PostgreSQL est éteint ou l'adresse IP / Port est invalide.")
            print("👉 ACTION : Vérifiez que votre service Postgres est démarré localement.")
        else:
            print(f"👉 Détails techniques de l'erreur :\n{proc.stderr}")
            
        return False

    except FileNotFoundError:
        print("\n❌ CRITICAL : L'outil binaire 'psql' est introuvable dans le PATH de votre système.")
        print("👉 ACTION : Assurez-vous que le dossier 'bin' de PostgreSQL est bien ajouté à vos Variables d'Environnement Windows.")
        return False
    except Exception as e:
        print(f"\n❌ Erreur inattendue lors du diagnostic : {e}")
        return False


def sync_history_to_postgres():
    print("=========================================================")
    print("📦 MIGRATION DE L'HISTORIQUE VERS LA TABLE INSURANCE_REPORTS")
    print("=========================================================\n")
    
    # Lancement du diagnostic automatique avant exécution
    if not auto_configure_and_diagnose():
        print("\n🛑 Synchronisation annulée suite à une erreur de configuration ci-dessus.")
        return

    processed_path = Path(config.PROCESSED_DIR)
    json_files = list(processed_path.glob("*.json"))
    
    # Exclure les fichiers systèmes/validation secondaires
    json_files = [f for f in json_files if not f.name.endswith("validation.json")]

    if not json_files:
        print(f"⚠️ Aucun fichier JSON valide trouvé dans : {processed_path.resolve()}")
        return

    print(f"🔍 {len(json_files)} portefeuilles d'assurances identifiés pour l'indexation.\n")
    
    success_count = 0
    for file_path in json_files:
        print(f"⏳ Indexation et structuration de : {file_path.name}...")
        success = load_json_to_insurance_reports(file_path)
        if success:
            print(f"   ✅ Synchronisé avec succès en table 'insurance_reports'.")
            success_count += 1
        else:
            print(f"   ❌ Échec du traitement pour ce fichier.")

    print("\n=========================================================")
    print(f"📊 RAPPORT GLOBAL : {success_count}/{len(json_files)} rapports indexés avec succès.")
    print("=========================================================")


if __name__ == "__main__":
    sync_history_to_postgres()