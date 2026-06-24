from __future__ import annotations

import json
import re
from typing import Any

# Re-architected schema: Stores raw metrics for N & N-1 along with audit trail metadata
# This prevents the LLM from executing math or overwriting data across document chunks.
METRIC_TEMPLATE = {
    "val_n": None,       # Raw value for current year (Exercise N)
    "val_n_1": None,     # Raw value for previous year (Exercise N-1)
    "page_n": None,      # Exact PDF page number where val_n was discovered
    "page_n_1": None,    # Exact PDF page number where val_n_1 was discovered
    "snippet_n": None,   # Raw textual sentence/row context for val_n verification
    "snippet_n_1": None, # Raw textual sentence/row context for val_n_1 verification
    "pct_change": None   # Programmatically calculated in Python (Not by the LLM!)
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "company": None,
    "non_vie": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "resultat_net": dict(METRIC_TEMPLATE),
        "provisions_techniques": dict(METRIC_TEMPLATE),
        "charges_exploitation": dict(METRIC_TEMPLATE),
        "autres_charges": dict(METRIC_TEMPLATE),
    },
    "vie": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "resultat_net": dict(METRIC_TEMPLATE),
        "provisions_mathématiques": dict(METRIC_TEMPLATE),
    },
    "global": {
        "fonds_propres": dict(METRIC_TEMPLATE),
        "total_bilan": dict(METRIC_TEMPLATE),
        "produits_financiers": dict(METRIC_TEMPLATE),
    },
}


def empty_schema() -> dict[str, Any]:
    """Generates a deep copy of the structured output template."""
    return json.loads(json.dumps(OUTPUT_SCHEMA, ensure_ascii=False))


def safe_json_parse(text: str) -> dict[str, Any]:
    """Safely extracts and parses JSON formatting structures from the API response."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return empty_schema()


def merge_results(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """
    Intelligently coalesces metrics extracted from different document chunks.
    Ensures that empty null chunks never overwrite valid metrics found in other pages.
    """
    if incoming.get("company") and not base.get("company"):
        base["company"] = incoming["company"]

    for section in ("non_vie", "vie", "global"):
        if section not in incoming or not isinstance(incoming[section], dict):
            continue
            
        for key in base[section]:
            if key not in incoming[section]:
                continue
                
            incoming_metric = incoming[section][key]
            if not isinstance(incoming_metric, dict):
                continue
                
            # Safely merge each specific field property individually
            for prop in ("val_n", "val_n_1", "page_n", "page_n_1", "snippet_n", "snippet_n_1"):
                if base[section][key][prop] is None and incoming_metric.get(prop) is not None:
                    base[section][key][prop] = incoming_metric[prop]

    # After merging all chunk extractions, run the safe programmatic math calculations
    return calculate_all_variations(base)


def calculate_all_variations(data: dict[str, Any]) -> dict[str, Any]:
    """
    Computes exact percentage shifts programmatically using deterministic Python calculations.
    """
    for section in ("non_vie", "vie", "global"):
        for key in data.get(section, {}):
            metric = data[section][key]
            val_n = metric.get("val_n")
            val_n_1 = metric.get("val_n_1")
            
            if val_n is not None and val_n_1 is not None and val_n_1 != 0:
                try:
                    # Normalizes variations mathematically
                    change = ((float(val_n) - float(val_n_1)) / float(val_n_1)) * 100
                    metric["pct_change"] = round(change, 2)
                except (ValueError, TypeError):
                    metric["pct_change"] = None
            else:
                metric["pct_change"] = None
                
    return data


def is_valid_financial_result(result: dict[str, Any]) -> bool:
    """Verifies compliance against minimum document extraction criteria."""
    if not result.get("company"):
        return False

    filled = 0
    for section in ("non_vie", "vie", "global"):
        if section not in result or not isinstance(result[section], dict):
            continue
        for metric in result[section].values():
            if isinstance(metric, dict) and (metric.get("val_n") is not None or metric.get("val_n_1") is not None):
                filled += 1

    return filled >= 2