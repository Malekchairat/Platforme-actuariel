from __future__ import annotations

import os
import sys
import json
from typing import Any
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import psycopg2
from psycopg2.extras import RealDictCursor

# 1. Importer ta configuration centralisée (.env chargé par config.py)
from backend.etl import config

# 2. Injecter les variables lues par l'outil psql en arrière-plan
os.environ["PGHOST"] = str(config.DB_HOST)
os.environ["PGPORT"] = str(config.DB_PORT)
os.environ["PGUSER"] = str(config.DB_USER)
os.environ["PGPASSWORD"] = str(config.DB_PASSWORD)
os.environ["PGDATABASE"] = str(config.DB_NAME)

from .artifacts import load_csv_artifact, load_json_artifact
from .db import query_csv, query_scalar
from .financial_routes import router as financial_router
import backend.api.financial_routes  # Import explicite pour le diagnostic

app = FastAPI(title="Copilot Actuariel API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # À restreindre en production
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(financial_router)


# --- NOUVEAU COMPOSANT : STRUCTURE DE REQUÊTE & ROUTE POUR LE CHAT COPILOT VIA POSTGRESQL ---
class CopilotQuery(BaseModel):
    company_id: str
    question: str


@app.post("/api/copilot/chat")
async def ask_actuarial_copilot(payload: CopilotQuery):
    """
    Moteur de raisonnement du Copilot Actuariel connecté en priorité à PostgreSQL,
    avec un repli automatique (Fallback) sur les fichiers JSON locaux en cas d'absence.
    """
    from backend.etl.config import PROCESSED_DIR
    
    data_dict = None
    company_name = "Compagnie Inconnue"
    source_info = ""
    
    # Extraction propre du trigramme (ex: STAR, GAT, BNA, COMAR)
    company_slug = payload.company_id.split('_')[0].strip().upper()

    # --- ÉTAPE 1 : TENTATIVE DE RECHERCHE DANS POSTGRESQL (INSENSIBLE À LA CASSE) ---
    conn = None
    try:
        conn = psycopg2.connect(
            host=os.environ.get("PGHOST"),
            port=os.environ.get("PGPORT"),
            database=os.environ.get("PGDATABASE"),
            user=os.environ.get("PGUSER"),
            password=os.environ.get("PGPASSWORD")
        )
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Utilisation de LOWER() pour matcher bna_assurances ou GAT sans distinction de casse
        query = """
        SELECT company_name, extracted_data 
        FROM insurance_reports 
        WHERE LOWER(company_slug) LIKE LOWER(%s) || '%%'
        ORDER BY exercise_year DESC LIMIT 1;
        """
        cur.execute(query, (company_slug,))
        row = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if row and row.get("extracted_data"):
            company_name = row["company_name"]
            data_dict = row["extracted_data"]
            source_info = "PostgreSQL DB"
            print(f"ℹ️ [Copilot] Données chargées avec succès depuis PostgreSQL pour {company_slug}")
            
    except Exception as db_error:
        if conn and not conn.closed:
            conn.close()
        print(f"⚠️ [PostgreSQL Fallback] Erreur SQL : {db_error}. Tentative de repli sur le fichier local JSON...")

    # --- ÉTAPE 2 : REPLI DE SÉCURITÉ SUR LE STOCKAGE LOCAL JSON ---
    if data_dict is None:
        json_path = PROCESSED_DIR / f"{payload.company_id}.json"
        if not json_path.exists():
            json_path = PROCESSED_DIR / f"{company_slug}_2025.json"
            
        if json_path.exists():
            try:
                financial_json_content = json_path.read_text(encoding="utf-8")
                data_dict = json.loads(financial_json_content)
                company_name = data_dict.get("company", company_slug)
                source_info = f"Fichier local ({json_path.name})"
                print(f"ℹ️ [Copilot] Rebond réussi sur le fichier local pour {company_slug}")
            except Exception as json_err:
                print(f"❌ [JSON Error] Impossible de décoder le fichier de secours : {json_err}")
                
    # Si les deux mondes échouent, on lève une 404 propre pour l'interface utilisateur
    if data_dict is None:
        raise HTTPException(
            status_code=404,
            detail=f"Données introuvables pour {company_slug} (Échec PostgreSQL et Fichier JSON)."
        )

    # --- ÉTAPE 3 : AGREGATION DU CONTEXTE TEXTUEL ---
    try:
        financial_json = json.dumps(data_dict, ensure_ascii=False, indent=2)
        
        text_snippets = ""
        for branch in ["non_vie", "vie", "global"]:
            if branch in data_dict and isinstance(data_dict[branch], dict):
                for metric_key, metric_val in data_dict[branch].items():
                    if isinstance(metric_val, dict) and metric_val.get("snippet_n"):
                        text_snippets += f"- [{branch.upper()}] {metric_key}: {metric_val['snippet_n']}\n"

        # Prompt de raisonnement actuariel destiné à Llama 3.1
        prompt = f"""
Tu es l'assistant IA "Copilot Actuariel", un expert senior en audit et gestion des risques d'assurance tunisienne (normes FTUSA/CGA).
Analyse la question de l'analyste en te basant sur la balance comptable et les justifications textuelles fournies ci-dessous.

COMPAGNIE SOUS AUDIT : {company_name}

DONNÉES COMPTABLES STRUCTURÉES (JSON) :
{financial_json}

CONTEXTE TEXTUEL (EXTRAITS OFFICIELS DU RAPPORT) :
{text_snippets}

QUESTION DE L'ANALYSTE :
{payload.question}

DIRECTIVES :
- Réponds en français de manière concise, hautement technique, comptable et professionnelle.
- Croise les lignes pour expliquer le "pourquoi" (ex: associer la dégradation des charges de sinistres à l'évolution des provisions à payer ou des primes acquises nettes).
- Si l'explication explicite manque, formule des hypothèses actuarielles logiques propres au marché tunisien.
"""

        # --- ÉTAPE 4 : APPEL SECURISÉ À L'API GROQ CLOUD ---
        groq_key = os.getenv("GROQ_API_KEY", "").strip()
        if not groq_key or groq_key.startswith("gsk...") or len(groq_key) < 10:
            return {
                "answer": "⚠️ **Configuration incomplète :** La clé d'API `GROQ_API_KEY` est introuvable ou mal configurée dans votre fichier `.env`. Veuillez insérer votre vraie clé générée sur console.groq.com.",
                "explanation": "Erreur d'environnement locale (Clé absente ou corrompue)."
            }
            
        try:
            client = Groq(api_key=groq_key)
            
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1200
            )
            
            return {
                "answer": completion.choices[0].message.content,
                "explanation": f"Analyse contextuelle générée en temps réel. Source : {source_info}."
            }
        except Exception as groq_exc:
            print(f"❌ [Groq API Error] L'appel a échoué : {groq_exc}")
            return {
                "answer": f"❌ **Échec de l'appel API Groq :** Le serveur distant a refusé l'authentification.\n\n*Détail technique :* `{str(groq_exc)}`.\n\nVérifiez que le texte de votre clé dans `.env` ne contient aucun espace ou guillemet superflu.",
                "explanation": "Erreur d'authentification auprès de l'infrastructure Groq Cloud."
            }
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Échec de traitement par le modèle Groq : {str(exc)}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/debug-paths")
def debug_paths() -> dict[str, Any]:
    """
    Endpoint de diagnostic critique : affiche les chemins réels 
    des fichiers que Python charge en mémoire vive.
    """
    return {
        "message": "Vérification des dossiers actifs",
        "main_file_path": __file__,
        "financial_routes_path": backend.api.financial_routes.__file__,
        "executable_python": sys.executable,
    }


@app.get("/health/db")
def health_db() -> dict[str, str]:
    try:
        db_status = query_scalar("SELECT 'ok'")
    except Exception as exc:
        return {"status": "degraded", "db": str(exc)}
    return {"status": "ok", "db": db_status}


@app.get("/companies")
def companies() -> list[dict[str, str]]:
    return query_csv(
        "SELECT DISTINCT societe FROM actuariel.kpis ORDER BY societe"
    )


@app.get("/kpis/latest")
def latest_kpis(company: str | None = None) -> list[dict[str, str]]:
    sql = "SELECT * FROM actuariel.v_latest_kpis"
    if company:
        sql += f" WHERE societe = '{company.replace("'", "''")}'"
    sql += " ORDER BY societe"
    return query_csv(sql)


@app.get("/kpis/summary")
def kpis_summary() -> list[dict[str, str]]:
    return query_csv(
        """
        SELECT
            societe,
            COUNT(*) AS periods,
            MAX(date_document) AS latest_period,
            MAX(primes_emises) AS max_primes_emises,
            MAX(resultat_net) AS max_resultat_net,
            MAX(ratio_sp) AS max_ratio_sp
        FROM actuariel.kpis
        GROUP BY societe
        ORDER BY societe
        """
    )


@app.get("/kpis/timeseries")
def kpis_timeseries(
    company: str = Query(..., description="Company name"),
    kpi: str = Query(..., pattern="^(primes_emises|charge_sinistres|provisions_techniques|resultat_net|total_bilan|fonds_propres|ratio_sp)$"),
) -> list[dict[str, str]]:
    safe_company = company.replace("'", "''")
    safe_kpi = kpi.replace("'", "''")
    return query_csv(
        f"""
        SELECT date_document, {safe_kpi} AS value
        FROM actuariel.kpis
        WHERE societe = '{safe_company}'
          AND {safe_kpi} IS NOT NULL
        ORDER BY date_document
        """
    )


@app.get("/tables/sample")
def tables_sample(
    company: str | None = None,
    limit: int = 20,
) -> list[dict[str, str]]:
    sql = "SELECT societe, source_fichier, page, table_num, row_data FROM actuariel.extracted_table_rows"
    if company:
        sql += f" WHERE societe = '{company.replace("'", "''")}'"
    sql += f" ORDER BY id DESC LIMIT {int(limit)}"
    return query_csv(sql)


@app.get("/quality/kpis")
def quality_kpis() -> dict:
    return load_json_artifact("canonical_kpis_validation.json")


@app.get("/quality/statements")
def quality_statements() -> dict:
    return load_json_artifact("statement_catalog_validation.json")


@app.get("/catalog/statements/sample")
def statements_sample(limit: int = 25) -> list[dict[str, str]]:
    return load_csv_artifact("canonical_statement_rows.csv", limit=limit)


if __name__ == "__main__":
    import uvicorn
    # Exécution unifiée sur votre port opérationnel 8055
    uvicorn.run("backend.api.main:app", host="127.0.0.1", port=8055, reload=False)