from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path


BASE = Path(__file__).resolve().parents[2]
PROCESSED_DIR = BASE / "data" / "processed"


def load_json_artifact(filename: str) -> dict:
    path = PROCESSED_DIR / filename
    if not path.exists():
        return {"error": f"missing artifact: {filename}"}
    return json.loads(path.read_text(encoding="utf-8"))


def load_csv_artifact(filename: str, limit: int | None = None) -> list[dict[str, str]]:
    path = PROCESSED_DIR / filename
    if not path.exists():
        return [{"error": f"missing artifact: {filename}"}]
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if limit is not None:
        rows = rows[:limit]
    return rows
