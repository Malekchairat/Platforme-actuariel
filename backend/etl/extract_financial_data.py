from __future__ import annotations

import json
import re
import unicodedata
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
    empty_schema,
    is_valid_financial_result,
    merge_results,
)
from .gemini_service import generate_json
from .pdf_utils import build_chunks, extract_document_pages, filter_relevant_pages


def _normalize_title_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", stripped).casefold().strip()


def _extract_title_block(pages: list[dict[str, Any]], max_lines: int = 12) -> str:
    if not pages:
        return ""

    first_page_text = str(pages[0].get("text", ""))
    lines = [line.strip() for line in first_page_text.splitlines() if line.strip()]
    title_lines: list[str] = []

    for line in lines[:max_lines]:
        title_lines.append(line)
        if any(marker in _normalize_title_text(line) for marker in ("siege social", "adresse", "tel", "fax")):
            break

    return " ".join(title_lines)


def _is_consolidated_title(pages: list[dict[str, Any]]) -> bool:
    title_block = _normalize_title_text(_extract_title_block(pages))
    if not title_block:
        return False

    consolidated_patterns = [
        r"\betats? financiers consolide?s?\b",
        r"\bcomptes? consolide?s?\b",
        r"\bconsolidated financial statements\b",
        r"\bconsolidated balance sheet\b",
    ]

    return any(re.search(pattern, title_block) for pattern in consolidated_patterns)


def _detect_annex_context(pages: list[dict[str, Any]]) -> dict[str, str]:
    text_sample = ""
    for p in pages[:5]: 
        text_sample += str(p.get("text", "")) + " "
    
    text_sample = _normalize_title_text(text_sample)

    if re.search(r"annexe\s*n?°?\s*13|resultat technique non[- ]vie par categorie d'assurance", text_sample):
        return {"annex": "13", "focus": "non_vie"}
    if re.search(r"annexe\s*n?°?\s*15|tableau de raccordement du resultat technique vie", text_sample):
        return {"annex": "15", "focus": "vie"}
    
    return {"annex": "unknown", "focus": "unknown"}


def build_extraction_prompt(chunk_text: str, filename: str, title_block: str, annex_context: dict[str, str]) -> str:
    annex_13_rules = ""
    if annex_context.get("annex") == "13":
        annex_13_rules = """
    *** STRICT ANNEXE 13 COLUMN MAPPING RULES ***
    - Column 'Automobile': Map strictly to the "automobile" JSON object.
    - Column 'Groupe', 'Maladie', or 'Santé': Map strictly to the "sante" JSON object.
    - Column 'Incendie': Map strictly to the "incendie" JSON object.
    - Column 'Transport' or 'Facultés': Map strictly to the "transport" JSON object.
    - Columns 'Risq. Divers', 'RC', 'Engineering', 'Risques Spéciaux', 'Risq. Spx', 'ARD': SUM THESE VALUES TOGETHER and map the total to the "risques_divers" JSON object.
    - DO NOT map the "Total" column into any individual branch.
    - NEVER duplicate a value from one branch into another. If a column is missing, leave the branch null.
        """

    return f"""
You are an expert actuarial financial auditor processing official insurance financial state documents from Tunisia.
Extract the values accurately matching the provided schema template.

CRITICAL DISCIPLINE AND VALIDATION RULES:
1. NO PAGE ASSUMPTIONS:
   - Identify sections and tables solely using semantic match of section titles.

2. TECHNICAL BRANCH AUDITING:
   - "automobile": Map data ONLY from official rows/columns referring explicitly to "Automobile", "Assurance Auto", or "Flottes".
   - "sante": Map data ONLY from "Maladie", "Assurance Groupe", "Groupe Médical", "Santé", or "Accidents Corporels".
   - "incendie": Map data ONLY from "Incendie".
   - "transport": Map data ONLY from "Transport".
   - "risques_divers": Combine remaining miscellaneous risks (Liability, Engineering, ARD, Special Risks).
   - For the key 'primes_emises', always prioritize NET issued premiums. If the line 'Primes Émises' does not exist in Annexes 13/15, use the 'Primes Acquises' line corresponding to the branch.
   - NEVER copy one branch column into another branch. Each branch key must be filled only from its own explicit column/header.
   {annex_13_rules}

3. NEW KPIs FOR BENCHMARKING (RAW VALUES ONLY, ABSOLUTE PROHIBITION OF INFERENCE & RATIO CALCULATION):
   - Under the "global" object, extract exact amounts for:
     * "creances": Total Créances (often AC6).
     * "actifs_corporels_incorporels": Valeur Brute of Actifs Incorporels & Corporels combined.
     * "placements_bruts": Valeur Brute of Placements.
     * "placements_nets": Valeur Nette of Placements.
     * "impot_sur_les_benefices": Impôts sur les bénéfices / Impôts exigibles.
     * "effectif": Total number of employees (headcount).
     * "charges_personnel": Masse salariale / Frais de personnel.
   - NEVER calculate profitability percentages, profit margins, or yield ratios yourself. Leave them as null if not directly readable.
   - NEVER distribute total claims or total premiums proportionally among branches.

4. METRIC MAPPING RULES:
   - Map current exercise value to "val_n" and prior year to "val_n_1".
   - Extract the complete exact original row text where the numbers were located into "snippet_n".

Document title block:
{title_block or "N/A"}

Detected annex context:
- annexe: {annex_context.get("annex", "unknown")}
- focus: {annex_context.get("focus", "unknown")}

Target JSON Schema Layout:
{json.dumps(empty_schema(), ensure_ascii=False, indent=2)}

Document Target Context: {filename}
TEXT BLOCK TO AUDIT:
---
{chunk_text}
---
"""


def run_gemini_chunk(
    chunk_text: str,
    filename: str,
    title_block: str = "",
    annex_context: dict[str, str] | None = None,
) -> dict[str, Any]:
    prompt = build_extraction_prompt(
        chunk_text,
        filename,
        title_block,
        annex_context or {"annex": "unknown", "focus": "unknown"},
    )
    return generate_json(prompt)


def standardize_financial_signs(result: dict[str, Any]) -> dict[str, Any]:
    expense_keywords = ["sinistre", "cedees", "acquisition", "administration", "impot", "charge", "personnel", "prestation"]
    
    # Ajout de incendie et transport à la standardisation des signes
    for section in ["vie", "non_vie", "automobile", "sante", "incendie", "transport", "risques_divers", "global"]:
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

def validate_branch_extraction(result: dict[str, Any], filename: str) -> None:
    auto_primes = result.get("automobile", {}).get("primes_emises", {}).get("val_n")
    sante_primes = result.get("sante", {}).get("primes_emises", {}).get("val_n")
    rd_primes = result.get("risques_divers", {}).get("primes_emises", {}).get("val_n")

    if auto_primes and auto_primes == sante_primes and auto_primes == rd_primes and float(auto_primes) != 0:
        print(f"⚠️ [Validation Alert] Hallucination potentielle dans {filename}: "
              f"Auto, Santé, et RD ont des valeurs identiques ({auto_primes}).")


def extract_financial_data(file_path: str | Path) -> dict[str, Any]:
    path = Path(file_path)
    filename = path.name

    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if is_valid_financial_result(payload):
            return standardize_financial_signs(payload)

    pages = extract_document_pages(path)
    title_block = _extract_title_block(pages)
    annex_context = _detect_annex_context(pages)
    
    if _is_consolidated_title(pages):
        raise ValueError(
            "Rapport Rejeté : Le document importé contient des états financiers CONSOLIDÉS. "
            "L'analyse prudentielle CGA requiert l'utilisation exclusive des états financiers INDIVIDUELS."
        )
    
    semantic_keywords = [
        "ventilation", "nature de risque", "compte technique", 
        "résultat technique", "provisions techniques", "primes émises",
        "répartition", "mouvements", "masse salariale", "effectif", "etat g", "annexe"
    ]
    
    filtered_pages = []
    for p in pages:
        text_lower = str(p.get("text", "")).lower()
        if any(kw in text_lower for kw in semantic_keywords):
            filtered_pages.append(p)
            
    if not filtered_pages:
        filtered_pages = filter_relevant_pages(pages)

    chunks = build_chunks(filtered_pages)
    final_result = empty_schema()

    # 1. EXTRACTION SÉMANTIQUE NORMALE (Gère le bilan et le global parfaitement)
    for chunk in chunks:
        result = run_gemini_chunk(chunk, filename, title_block, annex_context)
        final_result = merge_results(final_result, result)

    # 2. INTERVENTION DU SNIPER VISION POUR L'ANNEXE 13 / 15
    portfolio_page_num = None
    for p in pages:
        text_lower = str(p.get("text", "")).lower()
        if any(kw in text_lower for kw in ["résultat technique non-vie par catégorie", "annexe 13", "annexe n°13", "annexe n° 13"]):
            portfolio_page_num = p.get("page_number")
            break
            
    if portfolio_page_num:
        print(f"👁️ [Vision] Tableau de portefeuille détecté à la page {portfolio_page_num}. Activation de l'extraction par image...")
        from .vision_extractor import extract_portfolio_with_vision
        vision_result = extract_portfolio_with_vision(str(path), portfolio_page_num)
        
        # Le modèle Vision devient la seule source de vérité pour le portefeuille. 
        # On écrase silencieusement les données textuelles faussées de ces branches spécifiques (incluant Incendie et Transport)
        for branch in ["automobile", "sante", "incendie", "transport", "risques_divers"]:
            if branch in vision_result and isinstance(vision_result[branch], dict):
                for metric_key, metric_data in vision_result[branch].items():
                    # Mappage flexible Primes acquises -> Primes émises si nécessaire
                    target_key = "primes_emises" if metric_key == "primes_acquises" else metric_key
                    
                    if isinstance(metric_data, dict) and metric_data.get("val_n") is not None:
                        if target_key in final_result[branch]:
                            final_result[branch][target_key]["val_n"] = metric_data["val_n"]
                            final_result[branch][target_key]["page_n"] = portfolio_page_num
                            # NETTOYAGE ET OVERRIDE DU SNIPPET POUR L'INFOBULLE FRONTEND
                            final_result[branch][target_key]["snippet_n"] = f"📸 Valeur extraite par IA Multimodale (Lecture visuelle de la Page {portfolio_page_num})"
    else:
        print("ℹ️ [Vision] Page de portefeuille non trouvée. Utilisation exclusive du texte.")

    final_result = standardize_financial_signs(final_result)
    validate_branch_extraction(final_result, filename)
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