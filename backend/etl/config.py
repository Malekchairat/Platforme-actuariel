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


# À rajouter tout en bas de backend/etl/config.py
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "actuariel_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "12345678")