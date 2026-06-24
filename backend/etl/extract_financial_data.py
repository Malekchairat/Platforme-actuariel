from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .config import PROCESSED_DIR
from .financial_schema import (
    OUTPUT_SCHEMA,
    empty_schema,
    is_valid_financial_result,
    merge_results,
)
from .gemini_service import generate_json
from .pdf_utils import build_chunks, extract_document_pages, filter_relevant_pages


def build_extraction_prompt(chunk_text: str, filename: str) -> str:
    # This prompt instructs Gemini exactly how to find current/previous values
    # and link them to the page headers (===== PAGE X =====) embedded in the text.
    return f"""
You are a meticulous actuarial auditor extracting insurance metrics from financial statements.

Extract direct numbers, page positions, and verifiable text row context snippets matching the target JSON schema keys.

CRITICAL INSTRUCTIONS:
1. Look for the current exercise year (e.g., 2025 or N) and fill "val_n". Look for the prior year (e.g., 2024, N-1, or Retraité 2024) and fill "val_n_1".
2. Read the page headers in the text (e.g., "===== PAGE 4 =====") to identify the true document page number. Populate "page_n" and "page_n_1" with the integer value of that page.
3. For "snippet_n" and "snippet_n_1", extract the exact row text line or row cells string where you found the numbers. This is for hover tooltip validation.
4. Strictly separate Non-Life Insurance ("non_vie") values from Life Insurance ("vie") values.
5. NEVER perform inline math or calculate trends yourself. Just extract raw numbers.
6. If a specific metric value cannot be found anywhere in the text block below, leave its properties as null.

Target JSON Schema Format:
{json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}

Context Filename: {filename}
TEXT BLOCK TO AUDIT:
---
{chunk_text}
---
"""


def run_gemini_chunk(chunk_text: str, filename: str) -> dict[str, Any]:
    prompt = build_extraction_prompt(chunk_text, filename)
    return generate_json(prompt)


def extract_financial_data(file_path: str | Path) -> dict[str, Any]:
    path = Path(file_path)
    filename = path.name

    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if is_valid_financial_result(payload):
            return payload

    # 1. Simple text method (Extract plain layout data)
    pages = extract_document_pages(path)
    
    # 2. Page screening (Keeps only key pages to protect token budget)
    pages = filter_relevant_pages(pages)
    chunks = build_chunks(pages)

    final_result = empty_schema()

    # 3. Target LLM Processing
    for chunk in chunks:
        result = run_gemini_chunk(chunk, filename)
        final_result = merge_results(final_result, result)

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
    stem = Path(original_filename).stem
    if re.match(r"^[A-Za-z0-9_]+_20\d{2}$", stem):
        return PROCESSED_DIR / f"{stem}.json"

    company_slug = infer_company_slug(result.get("company"), original_filename)
    year = infer_year(original_filename, result)
    return PROCESSED_DIR / f"{company_slug}_{year}.json"


def save_result(result: dict[str, Any], output_path: str | Path) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output