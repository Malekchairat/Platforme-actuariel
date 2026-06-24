
import json
import re
import os
import time
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

# Force REST transport to avoid gRPC networking issues on Windows/VPNs
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables.")

genai.configure(api_key=API_KEY, transport='rest')

MODEL_NAME = "gemini-1.5-flash"

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

def build_prompt() -> str:
    return f"""
    Extract financial data from the attached PDF insurance report.
    Fill EXACTLY this JSON structure:
    {json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, indent=2)}

    RULES:
    - Output ONLY valid JSON.
    - If a value is missing, use null.
    - Convert "Milliers de Dinars" to Dinars (multiply by 1000).
    - Carefully separate Life (Vie) and Non-Life (Non-Vie) based on the tables.
    - The 'global' section refers to the consolidated/total company figures.
    """.strip()

def run_gemini_extraction(pdf_path: str) -> dict[str, Any]:
    model = genai.GenerativeModel(MODEL_NAME)
    
    try:
        print(f"☁️ Uploading {Path(pdf_path).name} to Google File API...")
        # Upload using the File API (more stable for large files)
        uploaded_file = genai.upload_file(path=pdf_path, mime_type="application/pdf")
        
        # Wait for processing if necessary (usually instant for PDFs)
        while uploaded_file.state.name == "PROCESSING":
            time.sleep(2)
            uploaded_file = genai.get_file(uploaded_file.name)

        print("🤖 Analyzing document with Gemini...")
        response = model.generate_content(
            [uploaded_file, build_prompt()],
            generation_config=genai.GenerationConfig(
                temperature=0,
                response_mime_type="application/json",
            )
        )
        
        # Cleanup: delete the file from Google Cloud after processing
        genai.delete_file(uploaded_file.name)
        
        return json.loads(response.text)

    except Exception as e:
        print(f"❌ Error: {e}")
        return OUTPUT_SCHEMA

def process_pdf(pdf_path: str, output_path: str):
    if not Path(pdf_path).exists():
        print(f"File not found: {pdf_path}")
        return

    print("📄 Starting extraction process...")
    result = run_gemini_extraction(pdf_path)

    print(f"💾 Saving results to {output_path}...")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("✅ Done!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--output", default="output.json")
    args = parser.parse_args()
    process_pdf(args.pdf, args.output)
