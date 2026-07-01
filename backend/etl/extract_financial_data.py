from __future__ import annotations

import json
import re
import psycopg2
from psycopg2.extras import Json as PostgresJson
from pathlib import Path
from typing import Any

from .config import (
    PROCESSED_DIR,
    DB_HOST,
    DB_PORT,
    DB_NAME,
    DB_USER,
    DB_PASSWORD
)
from .financial_schema import (
    OUTPUT_SCHEMA,
    empty_schema,
    is_valid_financial_result,
    merge_results,
)
from .gemini_service import generate_json
from .pdf_utils import build_chunks, extract_document_pages, filter_relevant_pages


def build_extraction_prompt(chunk_text: str, filename: str) -> str:
    """Génère le prompt d'audit contenant les directives métiers strictes pour l'assurance."""
    return f"""
You are an expert actuarial financial auditor processing official insurance financial state documents.
Extract the values accurately matching the provided schema template.

CRITICAL DISCIPLINE RULES:
1. TECHNICAL RESULT VS NET RESULT:
   - "resultat_technique": This is the pure insurance Underwriting Account result Balance ("Solde du compte technique" or "Résultat Technique") before investment income outside core underwriting and before taxes.
   - "resultat_net": This is the corporate bottom-line final net income after taxes ("Résultat Net de l'exercice").
2. REINSURANCE PERFORMANCE VALUES:
   - "primes_cedees": Gross written premiums ceded to reinsurers ("Primes cédées aux réassureurs").
   - "part_reassureurs_sinistres": Reinsurers share in claims paid ("Part des réassureurs dans les sinistres payés").
3. GENERAL EXPENSES SUBDIVISIONS:
   - "frais_d_acquisition": Commissions paid to brokers and agents ("Frais d'acquisition" or "Commissions").
   - "frais_d_administration": Internal business corporate operations management overhead ("Frais d'administration").
4. SMART PROPERTY AUDITING:
   - Locate current exercise and map to "val_n". Locate prior year column (N-1 or Retraité) and map to "val_n_1".
   - Read embedded structural text headers like "===== PAGE 4 =====" to parse out the real document page integer into "page_n" and "page_n_1".
   - Extract the complete exact original row or sentence string where the data was located into "snippet_n" and "snippet_n_1".
5. NEVER run calculations, growth rates, or percentage divisions yourself. Leave missing properties as null.

Target JSON Schema Layout:
{json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}

Document Target Context: {filename}
TEXT BLOCK TO AUDIT:
---
{chunk_text}
---
"""


def run_gemini_chunk(chunk_text: str, filename: str) -> dict[str, Any]:
    """Exécute l'analyse d'un morceau de document via l'API Gemini."""
    prompt = build_extraction_prompt(chunk_text, filename)
    return generate_json(prompt)


def standardize_financial_signs(result: dict[str, Any]) -> dict[str, Any]:
    """
    Parcourt le dictionnaire extrait et s'assure que toutes les charges 
    financières et cessions de réassurance sont enregistrées sous forme négative,
    en utilisant une détection souple par mots-clés pour éviter les variations structurelles.
    """
    # Mots-clés universels identifiant qu'un poste comptable est une charge/sortie
    expense_keywords = [
        "sinistre", 
        "cedees", 
        "acquisition", 
        "administration", 
        "impot", 
        "charge"
    ]
    
    # Parcourir les trois compartiments du schéma d'assurance
    for section in ["vie", "non_vie", "global"]:
        if section in result and isinstance(result[section], dict):
            # Copie des clés pour se prémunir des mutations concurrentes
            keys = list(result[section].keys())
            for key in keys:
                val = result[section][key]
                if val is not None:
                    # Normalisation textuelle pour une correspondance souple
                    normalized_key = key.lower().replace("_", " ").strip()
                    
                    # Vérifier si la clé contient un des marqueurs de coûts
                    is_expense = any(kw in normalized_key for kw in expense_keywords)
                    
                    # RÈGLE D'EXCEPTION ACTUARIELLE : 
                    # La "part des réassureurs" dans les sinistres ou provisions est un recouvrement (flux entrant positif).
                    # On annule la catégorisation en charge sauf s'il s'agit explicitement de cessions de primes.
                    if "part" in normalized_key or "reassureur" in normalized_key:
                        if "cedees" not in normalized_key:
                            is_expense = False
                    
                    if is_expense:
                        try:
                            # Cas 1 : Structure d'audit enrichie avec historique de suivi {"val_n": ..., "val_n_1": ...}
                            if isinstance(val, dict):
                                for val_key in ["val_n", "val_n_1"]:
                                    if val_key in val and val[val_key] is not None:
                                        numeric_val = float(val[val_key])
                                        if numeric_val > 0:
                                            result[section][key][val_key] = -numeric_val
                            # Cas 2 : Valeur numérique directe brute
                            else:
                                numeric_val = float(val)
                                if numeric_val > 0:
                                    result[section][key] = -numeric_val
                        except (ValueError, TypeError):
                            continue
                        
    return result


def extract_financial_data(file_path: str | Path) -> dict[str, Any]:
    """Exécute l'extraction de bout en bout avec protection du budget de jetons."""
    path = Path(file_path)
    filename = path.name

    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if is_valid_financial_result(payload):
            return standardize_financial_signs(payload) # Protection et correction sur import JSON direct

    # 1. Extraction brute des pages par script de mise en page
    pages = extract_document_pages(path)
    
    # 2. Filtrage des pages non-financières par mot-clés
    pages = filter_relevant_pages(pages)
    chunks = build_chunks(pages)

    final_result = empty_schema()

    # 3. Traitement parallélisé par morceau via l'LLM
    for chunk in chunks:
        result = run_gemini_chunk(chunk, filename)
        final_result = merge_results(final_result, result)

    # --- CORRECTION ET HARMONISATION SYNTAXIQUE DES SIGNES COMPTABLES ---
    final_result = standardize_financial_signs(final_result)
    return final_result


def slugify_company(company: str | None, fallback: str) -> str:
    """Normalise le nom de l'entreprise pour générer un nom de fichier propre."""
    source = company or fallback
    slug = re.sub(r"[^A-Za-z0-9]+", "_", source.upper()).strip("_")
    return slug[:30] or "COMPANY"


def infer_year(filename: str, result: dict[str, Any]) -> str:
    """Déduit l'année de l'exercice comptable à partir des métadonnées."""
    for source in (filename, str(result.get("company", ""))):
        match = re.search(r"(20\d{2})", source)
        if match:
            return match.group(1)
    return "unknown"


def infer_company_slug(company: str | None, filename: str) -> str:
    """Déduit le trigramme réglementaire abrégé de la compagnie tunisienne d'assurance."""
    stem = Path(filename).stem

    if re.match(r"^[A-Za-z0-9_]+_20\d{2}$", stem):
        return stem.rsplit("_", 1)[0]

    for source in (stem, company or ""):
        known = re.search(
            r"\b(STAR|BIAT|GAT|BNA|COMAR|MAGHREBIA|ASTREE|HAYETT|CARTE|ZITOUNA|AMANA|ATIJARI|TAKAFULIA|MAGHREBIA)\b",
            source,
            re.IGNORECASE,
        )
        if known:
            return known.group(1).upper()

    if company:
        acronym = re.search(r"[‐\-–]\s*([A-Z]{2,10})\s*$", company)
        if acronym:
            return acronym.group(1).upper()

    return slugify_company(company, stem)


def build_output_path(result: dict[str, Any], original_filename: str) -> Path:
    """Génère le chemin d'enregistrement du rapport final structuré."""
    stem = Path(original_filename).stem
    if re.match(r"^[A-Za-z0-9_]+_20\d{2}$", stem):
        return PROCESSED_DIR / f"{stem}.json"

    company_slug = infer_company_slug(result.get("company"), original_filename)
    year = infer_year(original_filename, result)
    return PROCESSED_DIR / f"{company_slug}_{year}.json"


def save_result(result: dict[str, Any], output_path: str | Path) -> Path:
    """
    Sauvegarde hybride : Persiste les données financières au format fichier JSON local
    ET injecte de manière synchrone les données d'audit dans la base PostgreSQL.
    """
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    
    # --- TÂCHE 1 : Continuer de sauvegarder le fichier JSON d'origine ---
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    
    # --- TÂCHE 2 : Insertion / Mise à jour automatique dans PostgreSQL ---
    try:
        company_slug = infer_company_slug(result.get("company"), output.name)
        year = infer_year(output.name, result)
        company_name = result.get("company") or "Compagnie Inconnue"

        # Connexion à PostgreSQL en utilisant les variables sécurisées du .env
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cur = conn.cursor()

        # Requête SQL avec détection de doublons (ON CONFLICT) pour écraser proprement si ré-importé
        query = """
        INSERT INTO insurance_reports (company_slug, exercise_year, company_name, extracted_data, pdf_file_path)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (company_slug, exercise_year) 
        DO UPDATE SET 
            company_name = EXCLUDED.company_name,
            extracted_data = EXCLUDED.extracted_data,
            pdf_file_path = EXCLUDED.pdf_file_path;
        """

        cur.execute(query, (company_slug, year, company_name, PostgresJson(result), str(output)))
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅ [PostgreSQL] Données de {company_name} ({year}) synchronisées avec succès.")
        
    except Exception as db_error:
        # En cas d'erreur avec la base de données, l'application ne plante pas (le fichier JSON reste valide)
        print(f"⚠️ [PostgreSQL Error] Échec de la synchronisation SQL mais fichier JSON enregistré : {db_error}")

    return output