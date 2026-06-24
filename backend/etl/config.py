from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
PROCESSED_DIR = BASE_DIR / "data" / "processed"
UPLOAD_DIR = BASE_DIR / "data" / "uploads"

load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

FINANCIAL_KEYWORDS = [
    "primes",
    "sinistres",
    "résultat",
    "resultat",
    "bilan",
    "fonds propres",
    "vie",
    "non vie",
    "non-vie",
    "provisions",
    "état financier",
    "etat financier",
    "compte de résultat",
    "compte de resultat",
    "assurance",
    "réassurance",
    "reassurance",
    "actuariel",
    "technique",
]

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".json"}
