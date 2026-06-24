"""
extract_financial_data_llm.py
─────────────────────────────
Smart PDF → JSON extractor for Tunisian insurance financial statements.
Handles: mixed Vie/Non-Vie docs, tables, French text, local Ollama LLM.

Usage:
    python extract_financial_data_llm.py --pdf "path/to/file.pdf" --output "output.json"
    python extract_financial_data_llm.py --pdf "path/to/file.pdf" --output "output.json" --load-pg

Requirements:
    pip install pdfplumber ollama psycopg2-binary python-dotenv
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

import pdfplumber
import ollama

# ── CONFIG ────────────────────────────────────────────────────────────────────

# qwen2.5:14b-instruct is already on your machine and FAR better at JSON
# extraction than qwen3:8b. Switch to qwen2.5:7b-instruct if 14b is too slow.
MODEL_NAME = "qwen2.5:14b-instruct"

# How many chars of raw PDF text to feed the LLM (fits ~5k tokens comfortably)
MAX_PROMPT_CHARS = 14_000

# Ollama generation settings
OLLAMA_OPTIONS = {
    "temperature": 0,
    "num_ctx": 8192,       # was 4096 — too small, caused truncation/nulls
    "num_predict": 1024,   # was 700 — not enough for complex docs
    "top_p": 1,
    "repeat_penalty": 1.0,
}

# ── OUTPUT SCHEMA ─────────────────────────────────────────────────────────────

EMPTY_SCHEMA: dict[str, Any] = {
    "company": None,
    "non_vie": {
        "primes_emises": None,
        "primes_acquises": None,
        "charges_sinistres": None,
        "resultat_net": None,
        "provisions_techniques": None,
        "charges_exploitation": None,
        "autres_charges": None,
    },
    "vie": {
        "primes_emises": None,
        "primes_acquises": None,
        "charges_sinistres": None,
        "resultat_net": None,
        "provisions_mathématiques": None,
    },
    "global": {
        "fonds_propres": None,
        "total_bilan": None,
        "produits_financiers": None,
    },
}

# Keywords that mark a line/table as financially relevant
FINANCIAL_KEYWORDS = (
    "actif", "assurance vie", "assurance non vie", "bilan",
    "capitaux propres", "charges", "charges de sinistres", "commissions",
    "compte de resultat", "compte technique", "cotisations",
    "etat de resultat", "fonds propres", "non vie", "passif",
    "primes", "primes acquises", "primes emises", "produits financiers",
    "provisions", "provisions mathematiques", "provisions techniques",
    "resultat", "sinistres", "total bilan", "vie",
)

# ── PDF EXTRACTION ────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Lowercase + strip French diacritics for keyword matching."""
    mapping = str.maketrans(
        "àâäçéèêëîïôöùûü",
        "aaaceeeeiioouuu"
    )
    return text.lower().translate(mapping)


def extract_tables_as_text(pdf_path: Path) -> str:
    """
    Extract tables from every page using pdfplumber.
    Tables are converted to pipe-separated rows so the LLM can read them
    as structured data rather than garbled text fragments.
    """
    parts: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                rows = []
                for row in table:
                    # Replace None cells with empty string
                    cleaned = [str(cell).strip() if cell else "" for cell in row]
                    # Skip rows that are entirely empty
                    if any(cleaned):
                        rows.append(" | ".join(cleaned))
                if rows:
                    parts.append(f"[Page {page_num} - Table]\n" + "\n".join(rows))

    return "\n\n".join(parts)


def extract_body_text(pdf_path: Path) -> str:
    """Extract plain text from each page (non-table content)."""
    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            txt = page.extract_text()
            if txt and txt.strip():
                parts.append(f"[Page {page_num}]\n{txt.strip()}")
    return "\n\n".join(parts)


def select_relevant_lines(text: str, max_chars: int) -> str:
    """
    Window-based relevance filter.
    Keeps lines near financial keywords + a ±3 line context window.
    Preserves table rows (pipe-separated) completely.
    """
    lines = text.splitlines()
    keep: set[int] = set()

    for i, line in enumerate(lines):
        norm = normalize(line)
        if any(kw in norm for kw in FINANCIAL_KEYWORDS):
            # Wider window for table rows so we don't break them mid-row
            window = 4 if "|" in line else 3
            for j in range(max(0, i - window), min(len(lines), i + window + 1)):
                keep.add(j)

    selected = "\n".join(lines[i] for i in sorted(keep))

    if not selected.strip():
        selected = text  # fallback: return everything

    return selected[:max_chars]


def resolve_pdf(pdf_path: str) -> Path:
    p = Path(pdf_path)
    if p.exists():
        return p
    candidate = p.with_suffix(".pdf")
    if candidate.exists():
        return candidate
    raise FileNotFoundError(f"PDF not found: {pdf_path}")


# ── PROMPT BUILDING ───────────────────────────────────────────────────────────

def build_prompt(text: str, filename: str) -> str:
    schema_str = json.dumps(EMPTY_SCHEMA, ensure_ascii=False, indent=2)
    return f"""You are an expert at extracting financial data from Tunisian insurance reports.

Extract data from the document below and return ONLY a JSON object matching this schema:

{schema_str}

Rules:
- Output ONLY the JSON object. No markdown, no explanation, no extra keys.
- Separate life insurance (vie) from non-life (non_vie). Some documents have both, some only one.
- Use null for any value not found in the document.
- Numbers should be plain numbers (no spaces, no currency symbols). Example: 1250000 not "1 250 000 DT"
- "company" is the name of the insurance company (e.g. "STAR", "GAT", "Comar").
- "total_bilan" = total assets (total actif) from the balance sheet.
- "fonds_propres" = equity / capitaux propres / fonds propres.
- "produits_financiers" = financial income / produits financiers.

Document filename: {filename}

Document content:
{text}"""


# ── LLM CALL ─────────────────────────────────────────────────────────────────

def call_llm(prompt: str) -> str:
    response = ollama.chat(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": (
                    "You output ONLY valid JSON. "
                    "Never add markdown fences, explanations, or extra keys. "
                    "Numbers are plain integers or floats, never strings with spaces."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        format="json",
        options=OLLAMA_OPTIONS,
    )
    return response["message"]["content"]


# ── JSON PARSING & NORMALISATION ──────────────────────────────────────────────

def safe_parse(text: str) -> dict:
    """Try JSON parse; fallback to regex extraction of first {...} block."""
    text = text.strip()
    # Strip markdown fences if model ignores instructions
    text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()

    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}


def clean_number(value: Any) -> Any:
    """Convert '1 250 000' or '1,250,000' strings to floats. Keep None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        cleaned = value.replace(" ", "").replace(",", "").replace("\xa0", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


ALIASES: dict[str, tuple[str, ...]] = {
    "provisions_mathématiques": (
        "provisions_mathématiques",
        "provisions_mathematiques",
        "provisions_math",
    ),
}


def normalize_output(raw: dict) -> dict:
    """Map raw LLM output onto the canonical schema, cleaning values."""
    out: dict[str, Any] = json.loads(json.dumps(EMPTY_SCHEMA, ensure_ascii=False))

    if not isinstance(raw, dict):
        return out

    out["company"] = raw.get("company")

    for section in ("non_vie", "vie", "global"):
        src = raw.get(section)
        if not isinstance(src, dict):
            continue
        for key in out[section]:
            candidates = ALIASES.get(key, (key,))
            for c in candidates:
                if c in src:
                    out[section][key] = clean_number(src[c])
                    break

    return out


# ── EXTRACTION PIPELINE ───────────────────────────────────────────────────────

def extract(pdf_path: str, max_chars: int = MAX_PROMPT_CHARS) -> dict:
    path = resolve_pdf(pdf_path)
    print(f"📄  PDF: {path.name}")

    # Step 1: Extract tables (structured) + body text separately
    print("    → Extracting tables...")
    table_text = extract_tables_as_text(path)

    print("    → Extracting body text...")
    body_text = extract_body_text(path)

    print(f"    Raw table chars : {len(table_text):,}")
    print(f"    Raw body chars  : {len(body_text):,}")

    # Step 2: Prefer table content (more structured), pad with body text
    # Tables get priority because they contain the actual numbers
    combined = table_text
    remaining = max_chars - len(combined)
    if remaining > 500:
        body_relevant = select_relevant_lines(body_text, remaining)
        combined = combined + "\n\n" + body_relevant

    llm_text = combined[:max_chars]
    print(f"    LLM input chars : {len(llm_text):,}")

    # Step 3: Build prompt & call LLM
    prompt = build_prompt(llm_text, path.name)
    print(f"\n🤖  Calling {MODEL_NAME}...")
    t0 = time.time()

    raw_response = call_llm(prompt)
    elapsed = time.time() - t0
    print(f"    Done in {elapsed:.1f}s")

    # Step 4: Parse & normalize
    parsed = safe_parse(raw_response)

    # Step 5: Retry if all financial fields are null (extraction likely failed)
    if _all_null(parsed):
        print("⚠️   All values null — retrying with body-text-only fallback...")
        body_relevant = select_relevant_lines(body_text, max_chars)
        prompt2 = build_prompt(body_relevant, path.name)
        raw2 = call_llm(prompt2)
        parsed2 = safe_parse(raw2)
        if not _all_null(parsed2):
            parsed = parsed2
            print("    Retry succeeded.")
        else:
            print("    Retry also returned nulls. Check PDF quality.")

    return normalize_output(parsed)


def _all_null(d: dict) -> bool:
    """Return True if every leaf value in the dict is None."""
    if not isinstance(d, dict):
        return True
    for v in d.values():
        if isinstance(v, dict):
            if not _all_null(v):
                return False
        elif v is not None:
            return False
    return True


# ── POSTGRESQL LOADER ─────────────────────────────────────────────────────────

PG_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS insurance_financials (
    id              SERIAL PRIMARY KEY,
    company         TEXT,
    source_file     TEXT,
    extracted_at    TIMESTAMP DEFAULT NOW(),

    -- Non-vie
    nv_primes_emises        NUMERIC,
    nv_primes_acquises      NUMERIC,
    nv_charges_sinistres    NUMERIC,
    nv_resultat_net         NUMERIC,
    nv_provisions_techniques NUMERIC,
    nv_charges_exploitation NUMERIC,
    nv_autres_charges       NUMERIC,

    -- Vie
    v_primes_emises         NUMERIC,
    v_primes_acquises       NUMERIC,
    v_charges_sinistres     NUMERIC,
    v_resultat_net          NUMERIC,
    v_provisions_math       NUMERIC,

    -- Global
    fonds_propres           NUMERIC,
    total_bilan             NUMERIC,
    produits_financiers     NUMERIC
);
"""

PG_INSERT = """
INSERT INTO insurance_financials (
    company, source_file,
    nv_primes_emises, nv_primes_acquises, nv_charges_sinistres,
    nv_resultat_net, nv_provisions_techniques, nv_charges_exploitation, nv_autres_charges,
    v_primes_emises, v_primes_acquises, v_charges_sinistres,
    v_resultat_net, v_provisions_math,
    fonds_propres, total_bilan, produits_financiers
) VALUES (
    %(company)s, %(source_file)s,
    %(nv_primes_emises)s, %(nv_primes_acquises)s, %(nv_charges_sinistres)s,
    %(nv_resultat_net)s, %(nv_provisions_techniques)s, %(nv_charges_exploitation)s, %(nv_autres_charges)s,
    %(v_primes_emises)s, %(v_primes_acquises)s, %(v_charges_sinistres)s,
    %(v_resultat_net)s, %(v_provisions_math)s,
    %(fonds_propres)s, %(total_bilan)s, %(produits_financiers)s
);
"""


def load_to_postgres(result: dict, source_file: str):
    """Insert extracted data into PostgreSQL. Reads connection from env vars."""
    try:
        import psycopg2
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        print("❌  psycopg2 or python-dotenv not installed. Run: pip install psycopg2-binary python-dotenv")
        return

    conn_params = {
        "host":     os.getenv("PG_HOST", "localhost"),
        "port":     int(os.getenv("PG_PORT", "5432")),
        "dbname":   os.getenv("PG_DB", "actuariel"),
        "user":     os.getenv("PG_USER", "postgres"),
        "password": os.getenv("PG_PASSWORD", ""),
    }

    nv = result.get("non_vie", {}) or {}
    v  = result.get("vie", {}) or {}
    g  = result.get("global", {}) or {}

    row = {
        "company":      result.get("company"),
        "source_file":  source_file,

        "nv_primes_emises":         nv.get("primes_emises"),
        "nv_primes_acquises":       nv.get("primes_acquises"),
        "nv_charges_sinistres":     nv.get("charges_sinistres"),
        "nv_resultat_net":          nv.get("resultat_net"),
        "nv_provisions_techniques": nv.get("provisions_techniques"),
        "nv_charges_exploitation":  nv.get("charges_exploitation"),
        "nv_autres_charges":        nv.get("autres_charges"),

        "v_primes_emises":          v.get("primes_emises"),
        "v_primes_acquises":        v.get("primes_acquises"),
        "v_charges_sinistres":      v.get("charges_sinistres"),
        "v_resultat_net":           v.get("resultat_net"),
        "v_provisions_math":        v.get("provisions_mathématiques"),

        "fonds_propres":            g.get("fonds_propres"),
        "total_bilan":              g.get("total_bilan"),
        "produits_financiers":      g.get("produits_financiers"),
    }

    try:
        with psycopg2.connect(**conn_params) as conn:
            with conn.cursor() as cur:
                cur.execute(PG_CREATE_TABLE)
                cur.execute(PG_INSERT, row)
            conn.commit()
        print("✅  Loaded into PostgreSQL.")
    except Exception as e:
        print(f"❌  PostgreSQL error: {e}")


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

def process(pdf_path: str, output_path: str, load_pg: bool = False,
            max_chars: int = MAX_PROMPT_CHARS):

    result = extract(pdf_path, max_chars)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n💾  Saved → {out}")
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if load_pg:
        load_to_postgres(result, str(Path(pdf_path).name))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Extract financial data from insurance PDF → JSON (+ optional PostgreSQL load)"
    )
    parser.add_argument("--pdf",      required=True,  help="Path to PDF file")
    parser.add_argument("--output",   default="output.json", help="Output JSON path")
    parser.add_argument("--load-pg",  action="store_true",   help="Load result into PostgreSQL")
    parser.add_argument("--max-chars", type=int, default=MAX_PROMPT_CHARS,
                        help=f"Max chars fed to LLM (default: {MAX_PROMPT_CHARS})")
    parser.add_argument("--model",    default=MODEL_NAME,
                        help=f"Ollama model name (default: {MODEL_NAME})")

    args = parser.parse_args()
    MODEL_NAME = args.model  # allow override at runtime

    process(args.pdf, args.output, args.load_pg, args.max_chars)