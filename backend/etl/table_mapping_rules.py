from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# Ajout des clusters stricts pour le mapping des branches de l'Annexe 13
BRANCH_KEYWORDS = {
    "automobile": [r"\bauto\b", r"automobile", r"flottes?"],
    "sante": [r"santé", r"sante", r"maladie", r"groupe", r"accidents? corporels?"],
    "risques_divers": [
        r"incendie", r"transport", r"risques? divers", 
        r"risques? sp[eé]ciaux", r"rc", r"responsabilit[eé] civile", r"assistance"
    ]
}

METRIC_PATTERNS = {
    "primes_emises": [
        r"primes?\s+(?:acquises|emises|émises|Ã©mises|et acceptées|et acceptÃ©es)",
        r"\bprv1\b",
        r"\bprnv1\b",
        r"\bprv11\b",
        r"\bprnv11\b",
    ],
    "charge_sinistres": [
        r"charges?\s+de\s+sinistres?",
        r"charge\s+de\s+sinistres?",
        r"\bchnv1\b",
        r"\bchv1\b",
    ],
    "provisions_techniques": [
        r"provision[s]?\s+techniques?",
        r"variation\s+des?\s+autres\s+provisions\s+techniques?",
        r"\bchv2\b",
        r"\bchnv2\b",
    ],
    "resultat_net": [r"résultat\s+net", r"rÃ©sultat\s+net", r"resultat\s+net"],
    "total_bilan": [r"total\s+bilan", r"total\s+de\s+bilan"],
    "fonds_propres": [r"fonds\s+propres?"],
    "ratio_sp": [r"ratio\s+s/?p", r"s/?p"],
}

NUMERIC_TOKEN = re.compile(
    r"<\s*[-+]?(?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d+(?:[,.]\d+)?)\s*>"
    r"|[-+]?(?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d+[,.]\d+|\d+)"
)
STATEMENT_CODE = re.compile(r"\b(?:pr|ch|rt|rn|ta|pa)[a-z]*\d+[a-z0-9]*\b", re.IGNORECASE)


def normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\ufeff", " ")
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def extract_numeric_tokens(text: str) -> list[float]:
    values: list[float] = []
    for match in NUMERIC_TOKEN.finditer(text):
        raw = match.group(0).strip()
        negative = raw.startswith("<") and raw.endswith(">")
        cleaned = raw.strip("<>").replace("%", "")
        cleaned = re.sub(r"[\s\u00a0]+", "", cleaned).replace(",", ".")
        try:
            value = float(cleaned)
            values.append(-value if negative else value)
        except ValueError:
            continue
    return values


def extract_statement_code(text: str) -> str | None:
    match = STATEMENT_CODE.search(normalize_text(text))
    return match.group(0).upper() if match else None


def classify_metric(text: str) -> str | None:
    normalized = normalize_text(text)
    for metric, patterns in METRIC_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, normalized):
                return metric
    return None

def classify_branch_column(header_text: str) -> str | None:
    """Classifie un en-tête de colonne vers sa branche de destination exacte."""
    normalized = normalize_text(header_text)
    for branch, patterns in BRANCH_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, normalized):
                return branch
    return None


def extract_label(text: str) -> str:
    normalized = normalize_text(text)
    split_match = NUMERIC_TOKEN.search(normalized)
    if split_match:
        prefix = normalized[: split_match.start()].strip(" |,;:-")
        if prefix:
            return prefix[:180]
    return normalized[:180]


@dataclass
class MappedRow:
    societe: str
    date_document: str | None
    source_fichier: str
    page: int | None
    table_num: int | None
    metric_code: str | None
    row_label: str
    numeric_values: list[float]
    confidence: float
    source_text: str