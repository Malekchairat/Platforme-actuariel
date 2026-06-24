from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

from cleaning_rules import (
    CANONICAL_KPI_FIELDS,
    CanonicalKpiRecord,
    confidence_score,
    is_plausible,
    load_json,
    normalize_societe,
    parse_document_date,
    parse_number,
)


BASE = Path(__file__).resolve().parents[2]
EXTRACTED_DIR = BASE / "data" / "extracted" / "tables"
PROCESSED_DIR = BASE / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

CANONICAL_CSV = PROCESSED_DIR / "canonical_kpis.csv"
CANONICAL_STATEMENT_CSV = PROCESSED_DIR / "canonical_statement_rows.csv"
REPORT_MD = PROCESSED_DIR / "canonical_kpis_validation.md"
REPORT_JSON = PROCESSED_DIR / "canonical_kpis_validation.json"


def build_records() -> list[CanonicalKpiRecord]:
    records: list[CanonicalKpiRecord] = []
    statement_rows = load_statement_rows()
    for json_file in sorted(EXTRACTED_DIR.glob("*_kpis.json")):
        payload = load_json(json_file)
        societe = normalize_societe(payload.get("societe"))
        date_document = parse_document_date(str(payload.get("date_document") or ""))
        issues: list[str] = []
        cleaned_values: dict[str, float | None] = {}
        fallback_values = derive_kpis_from_statement_rows(
            statement_rows,
            societe,
            date_document.isoformat() if date_document else str(payload.get("date_document") or ""),
        )

        for kpi_name in CANONICAL_KPI_FIELDS:
            raw_value = parse_number(payload.get(kpi_name))
            if raw_value is not None and is_plausible(kpi_name, raw_value):
                cleaned_values[kpi_name] = raw_value
                continue

            fallback_value = fallback_values.get(kpi_name)
            if fallback_value is not None and is_plausible(kpi_name, fallback_value):
                cleaned_values[kpi_name] = fallback_value
                issue_type = "suspect" if raw_value is not None else "missing"
                issues.append(f"{issue_type}:{kpi_name}->catalog_fallback")
                continue

            cleaned_values[kpi_name] = None
            if raw_value is None:
                issues.append(f"missing:{kpi_name}")
            else:
                issues.append(f"suspect:{kpi_name}={raw_value}")

        unresolved_issues = [issue for issue in issues if not issue.endswith("->catalog_fallback")]
        confidence = confidence_score(cleaned_values, unresolved_issues)
        records.append(
            CanonicalKpiRecord(
                societe=societe,
                date_document=date_document.isoformat() if date_document else None,
                source_fichier=str(payload.get("source_fichier") or json_file.name),
                source_type="financial_statement" if "Etat financier" in str(payload.get("source_fichier") or "") else "activity_report",
                confidence=confidence,
                issue_count=len(issues),
                issues=";".join(issues[:20]),
                **cleaned_values,
            )
        )

    return records


def load_statement_rows() -> list[dict[str, str]]:
    if not CANONICAL_STATEMENT_CSV.exists():
        return []
    with CANONICAL_STATEMENT_CSV.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def derive_kpis_from_statement_rows(
    rows: list[dict[str, str]],
    societe: str,
    date_document: str | None,
) -> dict[str, float | None]:
    matched = [
        row
        for row in rows
        if normalize_societe(row.get("societe")) == societe
        and _date_matches(row.get("date_document"), date_document)
        and parse_number(row.get("confidence")) is not None
        and float(row.get("confidence") or 0) >= 0.65
    ]
    return {kpi_name: _select_kpi_value(kpi_name, matched) for kpi_name in CANONICAL_KPI_FIELDS}


def _date_matches(row_date: str | None, wanted_date: str | None) -> bool:
    if not wanted_date:
        return True
    if not row_date:
        return False
    row_raw = str(row_date).strip()
    wanted_raw = str(wanted_date).strip()
    parsed_row = parse_document_date(row_raw)
    parsed_wanted = parse_document_date(wanted_raw)
    if parsed_row and parsed_wanted:
        return parsed_row == parsed_wanted
    return row_raw in {wanted_raw, wanted_raw[:4]}


def _select_kpi_value(kpi_name: str, rows: list[dict[str, str]]) -> float | None:
    candidates = [row for row in rows if row.get("metric_code") == kpi_name]
    if not candidates:
        return None

    aggregate_codes = {
        "primes_emises": [r"\bprnv11\b", r"\bprv11\b"],
        "charge_sinistres": [r"\bchnv1\b", r"\bchv1\b"],
        "provisions_techniques": [r"\bchnv2\b", r"\bchv2\b"],
    }
    if kpi_name in aggregate_codes:
        selected = []
        for pattern in aggregate_codes[kpi_name]:
            matching_rows = [
                row
                for row in candidates
                if re.search(pattern, row.get("source_text") or "", re.IGNORECASE)
                and _aggregate_row_is_usable(kpi_name, row)
            ]
            for row in sorted(matching_rows, key=lambda item: _row_rank(kpi_name, item), reverse=True):
                value = _first_plausible_value(kpi_name, row)
                if value is not None:
                    selected.append(value)
                    break
        if selected:
            return round(sum(selected), 3)

    ranked = sorted(candidates, key=lambda row: _row_rank(kpi_name, row), reverse=True)
    for row in ranked:
        value = _first_plausible_value(kpi_name, row)
        if value is not None:
            return value
    return None


def _row_rank(kpi_name: str, row: dict[str, str]) -> float:
    text = (row.get("row_label") or "") + " " + (row.get("source_text") or "")
    normalized = text.lower()
    score = float(row.get("confidence") or 0)
    if "societe | page | table_num" in normalized:
        score -= 1.0
    if kpi_name == "primes_emises" and ("emises" in normalized or "émises" in normalized):
        score += 0.25
    if kpi_name == "primes_emises" and "accept" in normalized:
        score += 0.25
    if kpi_name == "resultat_net" and "net" in normalized:
        score += 0.2
    if kpi_name == "resultat_net" and "% ca" in normalized:
        score -= 0.5
    if kpi_name == "resultat_net" and any(token in normalized for token in ["clients", "actifs courants", "actifs non courants"]):
        score -= 0.6
    if kpi_name == "resultat_net" and re.search(r"^\s*[\d\s.,]+\s*\|\s*r[ée]sultat net", normalized):
        score += 0.35
    if "total" in normalized:
        score += 0.1
    return score


def _aggregate_row_is_usable(kpi_name: str, row: dict[str, str]) -> bool:
    text = ((row.get("row_label") or "") + " " + (row.get("source_text") or "")).lower()
    if kpi_name == "primes_emises":
        return "accept" in text
    if kpi_name == "charge_sinistres":
        return "montants pay" not in text and "régl" not in text and "regl" not in text
    return True


def _first_plausible_value(kpi_name: str, row: dict[str, str]) -> float | None:
    try:
        values = json.loads(row.get("numeric_values") or "[]")
    except json.JSONDecodeError:
        return None
    for raw_value in values:
        value = parse_number(raw_value)
        if value is None:
            continue
        if kpi_name != "ratio_sp" and abs(value) < 1000:
            continue
        if 1900 <= abs(value) <= 2100:
            continue
        if kpi_name in {"charge_sinistres", "provisions_techniques"}:
            value = abs(value)
        if is_plausible(kpi_name, value):
            return value
    return None


def write_csv(records: list[CanonicalKpiRecord]) -> None:
    if not records:
        return
    with CANONICAL_CSV.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(records[0].as_dict().keys()))
        writer.writeheader()
        for record in records:
            writer.writerow(record.as_dict())


def write_report(records: list[CanonicalKpiRecord]) -> None:
    total = len(records)
    by_company = Counter(r.societe for r in records)
    low_confidence = [r for r in records if r.confidence < 0.5]
    missing_full = [r for r in records if r.confidence == 0.0]

    report_json = {
        "total_records": total,
        "companies": dict(sorted(by_company.items())),
        "low_confidence_records": len(low_confidence),
        "missing_full_records": len(missing_full),
        "output_csv": str(CANONICAL_CSV),
    }
    REPORT_JSON.write_text(json.dumps(report_json, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Canonical KPI Validation Report",
        "",
        f"- Total extracted KPI files: {total}",
        f"- Low confidence rows (< 0.5): {len(low_confidence)}",
        f"- Zero-confidence rows: {len(missing_full)}",
        "",
        "## Companies",
    ]
    for company, count in sorted(by_company.items()):
        lines.append(f"- {company}: {count}")
    lines.extend([
        "",
        "## Notes",
        "- Suspect numeric values are excluded from the canonical dashboard dataset.",
        "- Raw JSON outputs remain untouched for later forensic review.",
        f"- Canonical CSV: {CANONICAL_CSV}",
    ])
    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    records = build_records()
    write_csv(records)
    write_report(records)
    print(f"Canonical records written: {len(records)}")
    print(f"CSV: {CANONICAL_CSV}")
    print(f"Report: {REPORT_MD}")


if __name__ == "__main__":
    main()
