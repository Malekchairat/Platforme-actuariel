from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any


CANONICAL_KPI_FIELDS = [
    "primes_emises",
    "charge_sinistres",
    "provisions_techniques",
    "resultat_net",
    "total_bilan",
    "fonds_propres",
    "ratio_sp",
]


# Conservative thresholds for Tunisian insurer reporting.
# Values outside these ranges are kept in the raw layer but excluded from canonical dashboards.
KPI_MAX_VALUES = {
    "primes_emises": 5_000_000_000,
    "charge_sinistres": 5_000_000_000,
    "provisions_techniques": 20_000_000_000,
    "resultat_net": 2_000_000_000,
    "total_bilan": 50_000_000_000,
    "fonds_propres": 20_000_000_000,
    "ratio_sp": 1000,
}


def normalize_societe(value: str | None) -> str:
    if not value:
        return "INCONNU"
    return re.sub(r"\s+", " ", value.strip().upper())


def parse_document_date(value: str | None) -> date | None:
    if not value:
        return None
    raw = value.strip().replace("_", "-")
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    if re.fullmatch(r"\d{4}", raw):
        return date(int(raw), 12, 31)
    return None


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("%", "")
    text = re.sub(r"\s+", "", text).replace(",", ".")
    if text in {"-", "<", ">"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def is_plausible(kpi_name: str, value: float | None) -> bool:
    if value is None:
        return False
    if value != value:  # NaN
        return False
    if abs(value) > KPI_MAX_VALUES[kpi_name]:
        return False
    if kpi_name == "ratio_sp":
        return 0 <= value <= KPI_MAX_VALUES[kpi_name]
    if kpi_name != "resultat_net" and value < 0:
        return False
    return True


def confidence_score(values: dict[str, float | None], issues: list[str]) -> float:
    present = sum(1 for v in values.values() if v is not None)
    total = max(len(values), 1)
    coverage = present / total
    penalty = min(len(issues) * 0.15, 0.8)
    return round(max(0.0, coverage - penalty), 3)


@dataclass
class CanonicalKpiRecord:
    societe: str
    date_document: str | None
    source_fichier: str
    source_type: str
    confidence: float
    issue_count: int
    issues: str
    primes_emises: float | None
    charge_sinistres: float | None
    provisions_techniques: float | None
    resultat_net: float | None
    total_bilan: float | None
    fonds_propres: float | None
    ratio_sp: float | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "societe": self.societe,
            "date_document": self.date_document,
            "source_fichier": self.source_fichier,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "issue_count": self.issue_count,
            "issues": self.issues,
            "primes_emises": self.primes_emises,
            "charge_sinistres": self.charge_sinistres,
            "provisions_techniques": self.provisions_techniques,
            "resultat_net": self.resultat_net,
            "total_bilan": self.total_bilan,
            "fonds_propres": self.fonds_propres,
            "ratio_sp": self.ratio_sp,
        }


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
