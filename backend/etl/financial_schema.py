from __future__ import annotations

import json
import copy
import re
from typing import Any

# Structure de stockage d'un indicateur avec sa propre piste d'audit pour le survol
METRIC_TEMPLATE: dict[str, Any] = {
    "val_n": None,       # Chiffre brut de l'année en cours (Exercice N)
    "val_n_1": None,     # Chiffre brut de l'année précédente (Exercice N-1)
    "page_n": None,      # Numéro de page d'extraction de l'année N
    "page_n_1": None,    # Numéro de page d'extraction de l'année N-1
    "snippet_n": None,   # Extrait textuel de ligne d'origine (Année N)
    "snippet_n_1": None, # Extrait textuel de ligne d'origine (Année N-1)
    "pct_change": None   # Calculé programmatiquement en Python pur
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "company": None,
    "non_vie": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_cedees": dict(METRIC_TEMPLATE),          
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "part_reassureurs_sinistres": dict(METRIC_TEMPLATE), 
        "frais_d_acquisition": dict(METRIC_TEMPLATE),     
        "frais_d_administration": dict(METRIC_TEMPLATE),    
        "charges_exploitation": dict(METRIC_TEMPLATE),
        "provisions_primes_non_acquises": dict(METRIC_TEMPLATE), 
        "provisions_sinistres_a_payer": dict(METRIC_TEMPLATE),   
        "provisions_techniques": dict(METRIC_TEMPLATE),
        "resultat_technique": dict(METRIC_TEMPLATE),      
        "resultat_net": dict(METRIC_TEMPLATE),
        "autres_charges": dict(METRIC_TEMPLATE),
    },
    "vie": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_cedees": dict(METRIC_TEMPLATE),          
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "provisions_mathématiques": dict(METRIC_TEMPLATE),
        "resultat_technique": dict(METRIC_TEMPLATE),      
        "resultat_net": dict(METRIC_TEMPLATE),
    },
    "automobile": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "resultat_technique": dict(METRIC_TEMPLATE),
    },
    "sante": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "resultat_technique": dict(METRIC_TEMPLATE),
    },
    "risques_divers": {
        "primes_emises": dict(METRIC_TEMPLATE),
        "primes_acquises": dict(METRIC_TEMPLATE),
        "charges_sinistres": dict(METRIC_TEMPLATE),
        "resultat_technique": dict(METRIC_TEMPLATE),
    },
    "global": {
        "fonds_propres": dict(METRIC_TEMPLATE),
        "total_bilan": dict(METRIC_TEMPLATE),
        "produits_financiers": dict(METRIC_TEMPLATE),
        "impot_sur_les_benefices": dict(METRIC_TEMPLATE), 
        "charges_personnel": dict(METRIC_TEMPLATE),        # Nouvelle demande RH
        "effectif": dict(METRIC_TEMPLATE),                 # Nouvelle demande RH
    },
}


def empty_schema() -> dict[str, Any]:
    """Génère une copie profonde propre du schéma d'indicateurs."""
    return copy.deepcopy(OUTPUT_SCHEMA)


def safe_json_parse(text: str) -> dict[str, Any]:
    """Extrait et valide de façon robuste les objets JSON retournés par l'API."""
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
    Fusionne de manière itérative les extractions de chaque bloc de pages.
    Empêche les blocs vides ou incomplets d'effacer les données déjà extraites.
    """
    if incoming.get("company") and not base.get("company"):
        base["company"] = incoming["company"]

    sections = ("non_vie", "vie", "automobile", "sante", "risques_divers", "global")
    for section in sections:
        if section not in incoming or not isinstance(incoming[section], dict):
            continue
            
        for key in base[section]:
            if key not in incoming[section]:
                continue
                
            incoming_metric = incoming[section][key]
            if not isinstance(incoming_metric, dict):
                continue
                
            for prop in ("val_n", "val_n_1", "page_n", "page_n_1", "snippet_n", "snippet_n_1"):
                if base[section][key][prop] is None and incoming_metric.get(prop) is not None:
                    base[section][key][prop] = incoming_metric[prop]

    return calculate_all_variations(base)


def calculate_all_variations(data: dict[str, Any]) -> dict[str, Any]:
    """Calcule de façon déterministe en Python les variations d'une année sur l'autre."""
    sections = ("non_vie", "vie", "automobile", "sante", "risques_divers", "global")
    for section in sections:
        for key in data.get(section, {}):
            metric = data[section][key]
            val_n = metric.get("val_n")
            val_n_1 = metric.get("val_n_1")
            
            if val_n is not None and val_n_1 is not None and val_n_1 != 0:
                try:
                    change = ((float(val_n) - float(val_n_1)) / float(val_n_1)) * 100
                    metric["pct_change"] = round(change, 2)
                except (ValueError, TypeError):
                    metric["pct_change"] = None
            else:
                metric["pct_change"] = None
                
    return data


def is_valid_financial_result(result: dict[str, Any]) -> bool:
    """Valide la conformité structurelle minimale du résultat."""
    if not result.get("company"):
        return False

    filled = 0
    sections = ("non_vie", "vie", "automobile", "sante", "risques_divers", "global")
    for section in sections:
        if section not in result or not isinstance(result[section], dict):
            continue
        for metric in result[section].values():
            if isinstance(metric, dict) and (metric.get("val_n") is not None or metric.get("val_n_1") is not None):
                filled += 1

    return filled >= 2