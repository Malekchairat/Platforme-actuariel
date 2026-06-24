from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

from table_mapping_rules import (
    MappedRow,
    classify_metric,
    extract_label,
    extract_numeric_tokens,
    extract_statement_code,
    normalize_text,
)


BASE = Path(__file__).resolve().parents[2]
EXTRACTED_DIR = BASE / "data" / "extracted" / "tables"
PROCESSED_DIR = BASE / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_CSV = PROCESSED_DIR / "canonical_statement_rows.csv"
OUTPUT_REPORT = PROCESSED_DIR / "statement_catalog_validation.md"
OUTPUT_JSON = PROCESSED_DIR / "statement_catalog_validation.json"

NOISE_PATTERNS = [
    r"^annexe\s+n",
    r"^notes?\s+",
    r"^au\s+31/",
    r"^chiffres?\s+en",
    r"^etat\s+de\s+",
    r"^actif\s+du\s+bilan",
    r"^passif\s+du\s+bilan",
    r"^opérations?",
    r"^cessions?$",
    r"^brutes?$",
    r"^nettes?$",
]


def row_confidence(metric_code: str | None, label: str, values: list[float]) -> float:
    score = 0.2
    if metric_code:
        score += 0.45
    if len(label) >= 4:
        score += 0.2
    if values:
        score += min(len(values) * 0.05, 0.15)
    return round(min(score, 1.0), 3)


def iter_rows() -> list[MappedRow]:
    mapped: list[MappedRow] = []
    for csv_file in sorted(EXTRACTED_DIR.glob("*_tables.csv")):
        if csv_file.name.upper() == "ALL_SOCIETES_KPIS.CSV":
            continue
        with csv_file.open(encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            header_societe = _infer_societe_from_filename(csv_file.name)
            header_row = {f"header_{idx}": value for idx, value in enumerate(reader.fieldnames or [])}
            mapped.extend(_map_candidate_texts(csv_file, header_row, header_societe, None, None))
            for raw_row in reader:
                societe = (raw_row.get("societe") or "INCONNU").strip().upper()
                page = _to_int(raw_row.get("page"))
                table_num = _to_int(raw_row.get("table_num"))
                mapped.extend(_map_candidate_texts(csv_file, raw_row, societe, page, table_num))
    return mapped


def _map_candidate_texts(
    csv_file: Path,
    raw_row: dict[str, str],
    societe: str,
    page: int | None,
    table_num: int | None,
) -> list[MappedRow]:
    rows: list[MappedRow] = []
    for source_text in _candidate_texts(raw_row, societe):
        label = _pick_label([source_text], societe)
        metric_code = classify_metric(f"{label} | {source_text}")
        values = _statement_values(source_text)
        confidence = row_confidence(metric_code, label, values)
        rows.append(
            MappedRow(
                societe=societe,
                date_document=_infer_date_from_filename(csv_file.name),
                source_fichier=csv_file.name,
                page=page,
                table_num=table_num,
                metric_code=metric_code,
                row_label=label,
                numeric_values=values[:8],
                confidence=confidence,
                source_text=normalize_text(source_text)[:500],
            )
        )
    return rows


def write_outputs(rows: list[MappedRow]) -> None:
    if not rows:
        return

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "societe",
                "date_document",
                "source_fichier",
                "page",
                "table_num",
                "metric_code",
                "row_label",
                "numeric_values",
                "confidence",
                "source_text",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "societe": row.societe,
                    "date_document": row.date_document,
                    "source_fichier": row.source_fichier,
                    "page": row.page,
                    "table_num": row.table_num,
                    "metric_code": row.metric_code,
                    "row_label": row.row_label,
                    "numeric_values": json.dumps(row.numeric_values, ensure_ascii=False),
                    "confidence": row.confidence,
                    "source_text": row.source_text,
                }
            )


def write_report(rows: list[MappedRow]) -> None:
    metric_counts = Counter(r.metric_code or "unmapped" for r in rows)
    confident_rows = sum(1 for r in rows if r.confidence >= 0.7)
    report = {
        "total_rows": len(rows),
        "confident_rows": confident_rows,
        "mapping_rate": round(confident_rows / max(len(rows), 1), 3),
        "metric_counts": dict(sorted(metric_counts.items())),
        "output_csv": str(OUTPUT_CSV),
    }
    OUTPUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Statement Catalog Validation",
        "",
        f"- Total table rows scanned: {len(rows)}",
        f"- Rows with confidence >= 0.7: {confident_rows}",
        f"- Estimated mapping rate: {round(confident_rows / max(len(rows), 1), 3)}",
        "",
        "## Metric coverage",
    ]
    for metric, count in sorted(metric_counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- {metric}: {count}")
    lines.extend([
        "",
        "## Notes",
        "- This catalog is for dashboard mapping and drill-down, not final financial consolidation.",
        "- Low-confidence rows should be reviewed before being promoted to KPI dashboards.",
        f"- Canonical CSV: {OUTPUT_CSV}",
    ])
    OUTPUT_REPORT.write_text("\n".join(lines), encoding="utf-8")


def _infer_date_from_filename(filename: str) -> str | None:
    stem = Path(filename).stem
    tokens = stem.split("_")
    if not tokens:
        return None
    for token in reversed(tokens):
        if any(ch.isdigit() for ch in token):
            return token
    return None


def _infer_societe_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    for suffix in ("_tables", "_kpis"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
    parts = stem.split("_")
    while parts and any(ch.isdigit() for ch in parts[-1]):
        parts.pop()
    return "_".join(parts).strip().upper() or "INCONNU"


def _pick_label(cells: list[str], societe: str) -> str:
    candidates = []
    for cell in cells:
        cleaned = _strip_leading_statement_code(normalize_text(cell))
        if not cleaned:
            continue
        if cleaned == societe.lower():
            continue
        if cleaned.isdigit():
            continue
        if len(cleaned) < 3:
            continue
        if sum(ch.isalpha() for ch in cleaned) < 2:
            continue
        candidates.append(cleaned)

    if not candidates:
        return extract_label(" | ".join(cells))

    # Prefer the longest informative cell; it is usually the actual row label.
    return sorted(candidates, key=lambda item: (len(item), item), reverse=True)[0][:180]


def _candidate_texts(raw_row: dict[str, str], societe: str) -> list[str]:
    data_cells = [
        str(value).strip()
        for key, value in raw_row.items()
        if key not in {"societe", "page", "table_num"} and value and str(value).strip()
    ]
    candidates: list[str] = []

    for cell in data_cells:
        lines = [line.strip() for line in re.split(r"[\r\n]+", cell) if line.strip()]
        if len(lines) >= 4:
            candidates.extend(line for line in lines if _looks_like_statement_line(line))
        elif _looks_like_statement_line(cell):
            candidates.append(cell)

    if not candidates:
        joined = " | ".join(data_cells)
        if _looks_like_statement_line(joined):
            candidates.append(joined)

    unique: list[str] = []
    seen = set()
    for candidate in candidates:
        normalized = normalize_text(candidate)
        if normalized == societe.lower() or normalized in seen or _is_noise_line(normalized):
            continue
        seen.add(normalized)
        unique.append(candidate)
    return unique


def _looks_like_statement_line(text: str) -> bool:
    normalized = normalize_text(text)
    if _is_noise_line(normalized):
        return False
    if extract_statement_code(normalized):
        return bool(extract_numeric_tokens(normalized))
    return bool(classify_metric(normalized) and len(extract_numeric_tokens(normalized)) >= 1)


def _is_noise_line(normalized: str) -> bool:
    if len(normalized) < 4:
        return True
    return any(re.search(pattern, normalized) for pattern in NOISE_PATTERNS)


def _strip_leading_statement_code(text: str) -> str:
    return re.sub(r"^(?:pr|ch|rt|rn|ta|pa)[a-z]*\d+[a-z0-9]*\s*", "", text, flags=re.IGNORECASE).strip()


def _statement_values(text: str) -> list[float]:
    values = extract_numeric_tokens(text)
    # Ignore note references and years; keep statement-scale amounts and ratios.
    filtered = [value for value in values if abs(value) >= 1000 or (0 <= value <= 1000 and "ratio" in normalize_text(text))]
    return filtered or values


def _to_int(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def main() -> None:
    rows = iter_rows()
    write_outputs(rows)
    write_report(rows)
    print(f"Mapped rows written: {len(rows)}")
    print(f"CSV: {OUTPUT_CSV}")
    print(f"Report: {OUTPUT_REPORT}")


if __name__ == "__main__":
    main()
