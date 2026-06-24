import json
import re
import time
from pathlib import Path
import os

import pdfplumber
from dotenv import load_dotenv
from google import genai

# =====================================================
# CONFIGURATION
# =====================================================

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env")

client = genai.Client(api_key=API_KEY)

MODEL_NAME = "gemini-3.1-flash-lite"

# =====================================================
# TARGET SCHEMA
# =====================================================

OUTPUT_SCHEMA = {
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


# =====================================================
# HELPERS
# =====================================================

def empty_schema():
    return json.loads(json.dumps(OUTPUT_SCHEMA, ensure_ascii=False))


def safe_json_parse(text):
    """
    Gemini sometimes returns extra text.
    This function tries to recover valid JSON.
    """

    try:
        return json.loads(text)

    except:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)

    if match:
        try:
            return json.loads(match.group(0))
        except:
            pass

    return empty_schema()


def merge_results(base, incoming):
    """
    Keep first non-null value.
    Useful when information is spread across chunks.
    """

    if incoming.get("company"):
        base["company"] = incoming["company"]

    for section in ["non_vie", "vie", "global"]:

        if section not in incoming:
            continue

        for key in base[section]:

            if (
                base[section][key] is None
                and incoming[section].get(key) is not None
            ):
                base[section][key] = incoming[section][key]

    return base


# =====================================================
# STEP 1 : PDF EXTRACTION
# =====================================================

def extract_text_from_pdf(pdf_path):
    """
    Extract text page by page.
    """

    pages = []

    print("\n==============================")
    print("STEP 1 : READING PDF")
    print("==============================")

    with pdfplumber.open(pdf_path) as pdf:

        print(f"Total pages found : {len(pdf.pages)}")

        for i, page in enumerate(pdf.pages):

            text = page.extract_text()

            if text:
                pages.append(
                    {
                        "page_number": i + 1,
                        "text": text
                    }
                )

                print(f"✓ Page {i+1} extracted")

    return pages


# =====================================================
# STEP 2 : FILTER IMPORTANT PAGES
# =====================================================

def filter_relevant_pages(pages):
    """
    Keep pages likely to contain financial statements.
    """

    print("\n==============================")
    print("STEP 2 : FINDING RELEVANT PAGES")
    print("==============================")

    keywords = [
        "primes",
        "sinistres",
        "résultat",
        "resultat",
        "bilan",
        "fonds propres",
        "vie",
        "non vie",
        "provisions",
        "état financier",
        "etat financier",
        "compte de résultat",
        "compte de resultat",
    ]

    selected = []

    for page in pages:

        text_lower = page["text"].lower()

        if any(k in text_lower for k in keywords):

            selected.append(page)

            print(
                f"✓ Keeping page {page['page_number']}"
            )

    print(
        f"\nSelected pages : {len(selected)} / {len(pages)}"
    )

    return selected


# =====================================================
# STEP 3 : CHUNKING
# =====================================================

def build_chunks(pages, max_chars=12000):
    """
    Gemini works better with medium-sized chunks.
    """

    print("\n==============================")
    print("STEP 3 : BUILDING CHUNKS")
    print("==============================")

    chunks = []

    current_chunk = ""

    for page in pages:

        page_text = (
            f"\n\n===== PAGE {page['page_number']} =====\n\n"
            + page["text"]
        )

        if len(current_chunk) + len(page_text) > max_chars:

            chunks.append(current_chunk)
            current_chunk = page_text

        else:
            current_chunk += page_text

    if current_chunk:
        chunks.append(current_chunk)

    print(f"Created {len(chunks)} chunks")

    return chunks


# =====================================================
# STEP 4 : GEMINI PROMPT
# =====================================================

def build_prompt(chunk_text, filename):

    return f"""
You are an expert actuarial financial analyst.

Extract ONLY the information present in the text.

Return ONLY valid JSON.

Schema:

{json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}

Rules:
- Output only JSON
- No markdown
- No explanation
- Missing values = null
- Use only values explicitly found
- Convert amounts into Tunisian Dinars
- Separate life insurance (vie) and non-life (non_vie)

Filename:
{filename}

TEXT:

{chunk_text}
"""


# =====================================================
# STEP 5 : GEMINI EXTRACTION
# =====================================================

def run_gemini_chunk(chunk_text, filename):

    prompt = build_prompt(chunk_text, filename)

    for attempt in range(5):

        try:

            print(
                f"   Gemini attempt {attempt+1}/5..."
            )

            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt
            )

            result = safe_json_parse(response.text)

            print("   ✓ Gemini success")

            return result

        except Exception as e:

            wait_time = 2 ** attempt

            print(
                f"   ⚠ Error: {e}"
            )

            print(
                f"   Waiting {wait_time} sec..."
            )

            time.sleep(wait_time)

    raise RuntimeError(
        "Gemini failed after all retries."
    )


# =====================================================
# STEP 6 : PROCESS ALL CHUNKS
# =====================================================

def extract_financial_data(pdf_path):

    filename = Path(pdf_path).name

    pages = extract_text_from_pdf(pdf_path)

    pages = filter_relevant_pages(pages)

    chunks = build_chunks(pages)

    final_result = empty_schema()

    print("\n==============================")
    print("STEP 4 : ANALYZING CHUNKS")
    print("==============================")

    for idx, chunk in enumerate(chunks):

        print(
            f"\nProcessing chunk {idx+1}/{len(chunks)}"
        )

        result = run_gemini_chunk(
            chunk,
            filename
        )

        final_result = merge_results(
            final_result,
            result
        )

    return final_result


# =====================================================
# STEP 7 : SAVE JSON
# =====================================================

def save_result(result, output_path):

    print("\n==============================")
    print("STEP 5 : SAVING JSON")
    print("==============================")

    output = Path(output_path)

    output.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    output.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    print(f"✓ Saved : {output}")


# =====================================================
# MAIN
# =====================================================

if __name__ == "__main__":

    import argparse

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--pdf",
        required=True
    )

    parser.add_argument(
        "--output",
        default="output.json"
    )

    args = parser.parse_args()

    print("\n===================================")
    print("INSURANCE FINANCIAL DATA EXTRACTION")
    print("===================================")

    result = extract_financial_data(
        args.pdf
    )

    save_result(
        result,
        args.output
    )

    print("\n✅ EXTRACTION FINISHED")