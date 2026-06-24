from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pdfplumber


BASE = Path(__file__).resolve().parents[2]
PDF_PATH = BASE / "data" / "raw" / "etats_financiers" / "Etat financier AMANA TAKAFUL 2025.pdf"
OUT_DIR = BASE / "data" / "extracted2"
OUT_TABLES = OUT_DIR / "tables"
OUT_JSON = OUT_DIR / "AMANA_TAKAFUL_2025_indicators.json"


def parse_number(value: str) -> int | float:
    cleaned = re.sub(r"\s+", "", value.strip()).replace(".", "").replace(",", ".")
    number = float(cleaned)
    return int(number) if number.is_integer() else number


def numbers_from_cell(value: str | None) -> list[int | float]:
    if not value:
        return []
    values = []
    for match in re.finditer(r"-?\d[\d\s.]*([,]\d+)?", value):
        values.append(parse_number(match.group(0)))
    return values


def cell(row: list[Any], index: int) -> str:
    value = row[index] if index < len(row) else ""
    return "" if value is None else str(value).strip()


def split_lines(value: str | None) -> list[str]:
    if not value:
        return []
    return [line.strip() for line in value.splitlines() if line.strip()]


def add_indicator(
    indicators: list[dict[str, Any]],
    indicator_name: str,
    original_label: str,
    year: int,
    value: int | float,
) -> None:
    indicators.append(
        {
            "indicator_name": indicator_name,
            "original_label": original_label,
            "year": year,
            "value": value,
        }
    )


def extract_raw_tables(pdf: pdfplumber.PDF) -> list[dict[str, Any]]:
    raw_tables: list[dict[str, Any]] = []
    for page_index, page in enumerate(pdf.pages, start=1):
        for table_index, table in enumerate(page.extract_tables(), start=1):
            raw_tables.append(
                {
                    "page": page_index,
                    "table": table_index,
                    "rows": table,
                }
            )
    return raw_tables


def extract_indicators(raw_tables: list[dict[str, Any]]) -> dict[str, Any]:
    by_page_table = {(item["page"], item["table"]): item["rows"] for item in raw_tables}
    indicators: list[dict[str, Any]] = []

    # Page 20, table 3: premium bridge by 2025 net, ceded, and issued premiums.
    premium_table = by_page_table[(20, 3)]
    issued_row = premium_table[2]
    earned_row = premium_table[4]
    add_indicator(indicators, "Primes émises", cell(issued_row, 14), 2025, parse_number(cell(issued_row, 11)))
    add_indicator(indicators, "Primes acquises", cell(earned_row, 14), 2025, parse_number(cell(earned_row, 7)))
    add_indicator(indicators, "Primes acquises", cell(earned_row, 14), 2024, parse_number(cell(earned_row, 4)))

    # Page 29 and 30: life/general technical result bridges.
    life_result_table = by_page_table[(29, 1)]
    general_result_table = by_page_table[(30, 1)]

    life_premium_labels = split_lines(cell(life_result_table[6], 6))
    life_premium_values = numbers_from_cell(cell(life_result_table[6], 3))
    if life_premium_labels and life_premium_values:
        add_indicator(indicators, "Primes émises", life_premium_labels[0], 2025, life_premium_values[0])

    general_earned_row = general_result_table[5]
    add_indicator(indicators, "Primes acquises", cell(general_earned_row, 7), 2025, parse_number(cell(general_earned_row, 4)))

    general_issued_labels = split_lines(cell(general_result_table[6], 6))
    general_issued_values = numbers_from_cell(cell(general_result_table[6], 3))
    if general_issued_labels and general_issued_values:
        add_indicator(indicators, "Primes émises", general_issued_labels[0], 2025, general_issued_values[0])

    life_claim_labels = split_lines(cell(life_result_table[6], 6))
    life_claim_values = numbers_from_cell(cell(life_result_table[6], 3))
    if len(life_claim_labels) > 1 and len(life_claim_values) > 1:
        add_indicator(indicators, "Charges de sinistres", life_claim_labels[1], 2025, life_claim_values[1])

    general_claim_row = general_result_table[8]
    add_indicator(indicators, "Charges de sinistres", cell(general_claim_row, 7), 2025, parse_number(cell(general_claim_row, 4)))

    general_claim_detail_labels = split_lines(cell(general_result_table[9], 6))
    general_claim_detail_values = numbers_from_cell(cell(general_result_table[9], 3))
    if general_claim_detail_labels and general_claim_detail_values:
        add_indicator(indicators, "Indemnités versées", general_claim_detail_labels[0], 2025, general_claim_detail_values[0])

    life_surplus_row = life_result_table[14]
    general_surplus_row = general_result_table[22]
    add_indicator(indicators, "Résultat technique", cell(life_surplus_row, 7), 2025, parse_number(cell(life_surplus_row, 4)))
    add_indicator(indicators, "Résultat technique", cell(general_surplus_row, 7), 2025, parse_number(cell(general_surplus_row, 4)))

    life_provision_labels = split_lines(cell(life_result_table[15], 6))
    life_provision_values = numbers_from_cell(cell(life_result_table[15], 3))
    for label, value in zip(life_provision_labels, life_provision_values):
        if "ةيلامجإ ةينف تارخدم" in label and "لافقلإا" in label:
            add_indicator(indicators, "Provisions techniques", label, 2025, value)

    general_provision_labels = split_lines(cell(general_result_table[23], 6))
    general_provision_values = numbers_from_cell(cell(general_result_table[23], 3))
    for label, value in zip(general_provision_labels, general_provision_values):
        if "ةيلامجإ ةينف تارخدم" in label and "لافقلإا" in label:
            add_indicator(indicators, "Provisions techniques", label, 2025, value)

    # Page 18, table 3: technical reserves table.
    reserve_table = by_page_table[(18, 3)]
    math_reserve_row = reserve_table[2]
    total_reserve_row = reserve_table[7]
    add_indicator(indicators, "Provisions mathématiques", cell(math_reserve_row, 10), 2025, parse_number(cell(math_reserve_row, 7)))
    add_indicator(indicators, "Provisions mathématiques", cell(math_reserve_row, 10), 2024, parse_number(cell(math_reserve_row, 4)))
    add_indicator(indicators, "Provisions techniques", cell(total_reserve_row, 10), 2025, parse_number(cell(total_reserve_row, 7)))
    add_indicator(indicators, "Provisions techniques", cell(total_reserve_row, 10), 2024, parse_number(cell(total_reserve_row, 4)))

    # Page 17 and 18: participant fund result and company equity/result.
    participant_table = by_page_table[(17, 2)]
    participant_result_row = participant_table[3]
    add_indicator(
        indicators,
        "Résultat technique",
        cell(participant_result_row, 8),
        2025,
        parse_number(cell(participant_result_row, 5)),
    )

    equity_table = by_page_table[(17, 3)]
    net_result_row = equity_table[6]
    equity_total_row = equity_table[8]
    add_indicator(indicators, "Résultat net", cell(net_result_row, 8), 2025, parse_number(cell(net_result_row, 5)))
    add_indicator(indicators, "Résultat net", cell(net_result_row, 8), 2024, parse_number(cell(net_result_row, 3)))
    add_indicator(indicators, "Capitaux propres", cell(equity_total_row, 8), 2025, parse_number(cell(equity_total_row, 5)))
    add_indicator(indicators, "Capitaux propres", cell(equity_total_row, 8), 2024, parse_number(cell(equity_total_row, 3)))

    # Page 27: investment income and charges.
    investment_table = by_page_table[(27, 1)]
    investment_income_row = investment_table[8]
    investment_charges_row = investment_table[11]
    add_indicator(indicators, "Produits financiers", cell(investment_income_row, 10), 2025, parse_number(cell(investment_income_row, 1)))
    add_indicator(indicators, "Charges d'exploitation", cell(investment_charges_row, 10), 2025, parse_number(cell(investment_charges_row, 1)))

    # Page 21, table 2: operating charges.
    operating_charges_table = by_page_table[(21, 2)]
    staff_charges_row = operating_charges_table[1]
    total_operating_charges_row = operating_charges_table[5]
    add_indicator(indicators, "Charges d'exploitation", cell(staff_charges_row, 10), 2025, parse_number(cell(staff_charges_row, 7)))
    add_indicator(indicators, "Charges d'exploitation", cell(staff_charges_row, 10), 2024, parse_number(cell(staff_charges_row, 4)))
    add_indicator(indicators, "Charges d'exploitation", cell(total_operating_charges_row, 10), 2025, parse_number(cell(total_operating_charges_row, 7)))
    add_indicator(indicators, "Charges d'exploitation", cell(total_operating_charges_row, 10), 2024, parse_number(cell(total_operating_charges_row, 4)))

    return {"company": "AMANA TAKAFUL", "indicators": indicators}


def main() -> None:
    if not PDF_PATH.exists():
        raise FileNotFoundError(PDF_PATH)

    OUT_TABLES.mkdir(parents=True, exist_ok=True)
    with pdfplumber.open(PDF_PATH) as pdf:
        raw_tables = extract_raw_tables(pdf)

    (OUT_TABLES / "AMANA_TAKAFUL_2025_tables.json").write_text(
        json.dumps(raw_tables, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    OUT_JSON.write_text(
        json.dumps(extract_indicators(raw_tables), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(OUT_JSON)


if __name__ == "__main__":
    main()
