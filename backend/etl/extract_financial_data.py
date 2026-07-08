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
    """Génère le prompt d'audit contenant les directives métiers strictes et sectorielles."""
    return f"""
You are an expert actuarial financial auditor processing official insurance financial state documents.
Extract the values accurately matching the provided schema template.

CRITICAL DISCIPLINE AND VALIDATION RULES:
1. NO PAGE ASSUMPTIONS:
   - Insurance annual reports do NOT have fixed page numbers. Identify sections and tables solely using semantic match of section titles.
2. TECHNICAL BRANCH AUDITING:
   - Identify tables or notes containing concepts like: "Ventilation des primes", "Nature de risque", "Compte technique par branche", "Résultat technique par branche", "Provisions techniques par nature de risque", "Mouvements".
   - "automobile": Map data ONLY from official rows/columns referring explicitly to "Automobile" or "Assurance Auto".
   - "sante": Map data ONLY from "Maladie", "Assurance Groupe", "Groupe Médical", or "Santé".
   - "risques_divers": Combine Fire, Liability, and Transport segments ("Incendie", "Responsabilité Civile", "Risques Divers", "IRD", "Transport") ONLY if explicitly summarized together in a generic table by the insurer.
3. ABSOLUTE PROHIBITION OF INFERENCE & ESTIMATION:
   - NEVER calculate profitability percentages or profit margins yourself. Leave them as null if not directly readable.
   - NEVER distribute total claims or total premiums proportionally among branches using percentages.
   - If a branch value or column is missing or not explicitly provided in the tables or notes, leave its sub-properties as null.
4. METRIC MAPPING RULES:
   - Map current exercise value to "val_n" and prior year to "val_n_1".
   - Extract the complete exact original row text where the numbers were located into "snippet_n" and "snippet_n_1".

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
    Parcourt l'extraction et s'assure que toutes les charges 
    financières et sectorielles sont enregistrées sous forme négative.
    """
    expense_keywords = ["sinistre", "cedees", "acquisition", "administration", "impot", "charge", "personnel"]
    
    for section in ["vie", "non_vie", "automobile", "sante", "risques_divers", "global"]:
        if section in result and isinstance(result[section], dict):
            keys = list(result[section].keys())
            for key in keys:
                val = result[section][key]
                if val is not None:
                    normalized_key = key.lower().replace("_", " ").strip()
                    is_expense = any(kw in normalized_key for kw in expense_keywords)
                    
                    if "part" in normalized_key or "reassureur" in normalized_key:
                        if "cedees" not in normalized_key:
                            is_expense = False
                    
                    if is_expense:
                        try:
                            if isinstance(val, dict):
                                for val_key in ["val_n", "val_n_1"]:
                                    if val_key in val and val[val_key] is not None:
                                        numeric_val = float(val[val_key])
                                        if numeric_val > 0:
                                            result[section][key][val_key] = -numeric_val
                            else:
                                numeric_val = float(val)
                                if numeric_val > 0:
                                    result[section][key] = -numeric_val
                        except (ValueError, TypeError):
                            continue
                        
    return result


def extract_financial_data(file_path: str | Path) -> dict[str, Any]:
    """Exécute l'extraction sémantique de bout en bout avec filtrage thématique ciblé."""
    path = Path(file_path)
    filename = path.name

    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if is_valid_financial_result(payload):
            return standardize_financial_signs(payload)

    pages = extract_document_pages(path)
    
    full_raw_text = "".join([p.get("text", "") for p in pages]).lower()
    if "états financiers consolidés" in full_raw_text or "comptes consolidés" in full_raw_text:
        raise ValueError(
            "Rapport Rejeté : Le document importé contient des états financiers CONSOLIDÉS. "
            "L'analyse prudentielle CGA requiert l'utilisation exclusive des états financiers INDIVIDUELS."
        )
    
    # Stratégie d'identification sémantique : Ciblage des concepts comptables critiques
    semantic_keywords = [
        "ventilation", "nature de risque", "compte technique", 
        "résultat technique", "provisions techniques", "primes émises",
        "répartition", "mouvements", "masse salariale", "effectif"
    ]
    
    filtered_pages = []
    for p in pages:
        text_lower = p.get("text", "").lower()
        if any(kw in text_lower for kw in semantic_keywords):
            filtered_pages.append(p)
            
    if not filtered_pages:
        filtered_pages = filter_relevant_pages(pages)

    chunks = build_chunks(filtered_pages)
    final_result = empty_schema()

    for chunk in chunks:
        result = run_gemini_chunk(chunk, filename)
        final_result = merge_results(final_result, result)

    final_result = standardize_financial_signs(final_result)
    return final_result


def slugify_company(company: str | None, fallback: str) -> str:
    source = company or fallback
    slug = re.sub(r"[^A-Za-z0-9]+", "_", source.upper()).strip("_")
    return slug[:30] or "COMPANY"


def infer_year(filename: str, result: dict[str, Any]) -> str:
    for source in (filename, str(result.get("company", ""))):
        match = re.search(r"(20\d{2})", source)
        if match:
            return match.group(1)
    return "unknown"


def infer_company_slug(company: str | None, filename: str) -> str:
    stem = Path(filename).stem
    if re.match(r"^[A-Za-z0-9_]+_20\d{2}$", stem):
        return stem.rsplit("_", 1)[0]
    for source in (stem, company or ""):
        known = re.search(r"\b(STAR|BIAT|GAT|BNA|COMAR|MAGHREBIA|ASTREE|HAYETT|CARTE|ZITOUNA|AMANA|TAKAFULIA)\b", source, re.IGNORECASE)
        if known:
            return known.group(1).upper()
    return slugify_company(company, stem)


def build_output_path(result: dict[str, Any], original_filename: str) -> Path:
    stem = Path(original_filename).stem
    if re.match(r"^[A-Za-z0-9_]+_20\d{2}$", stem):
        return PROCESSED_DIR / f"{stem}.json"
    company_slug = infer_company_slug(result.get("company"), original_filename)
    year = infer_year(original_filename, result)
    return PROCESSED_DIR / f"{company_slug}_{year}.json"


def save_result(result: dict[str, Any], output_path: str | Path) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    
    try:
        company_slug = infer_company_slug(result.get("company"), output.name)
        year = infer_year(output.name, result)
        company_name = result.get("company") or "Compagnie Inconnue"

        conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASSWORD)
        cur = conn.cursor()
        query = """
        INSERT INTO insurance_reports (company_slug, exercise_year, company_name, extracted_data, pdf_file_path)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (company_slug, exercise_year) 
        DO UPDATE SET company_name = EXCLUDED.company_name, extracted_data = EXCLUDED.extracted_data, pdf_file_path = EXCLUDED.pdf_file_path;
        """
        cur.execute(query, (company_slug, year, company_name, PostgresJson(result), str(output)))
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅ [PostgreSQL] Synchronisation réussie pour {company_name} ({year}).")
    except Exception as db_error:
        print(f"⚠️ [PostgreSQL Error] Erreur SQL : {db_error}")

    return output