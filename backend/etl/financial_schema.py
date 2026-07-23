from __future__ import annotations

import json
import re
from typing import Any

# --- FACTORY FUNCTIONS FOR MEMORY ISOLATION ---
# By using functions instead of static dictionaries, we prevent the Python 
# shallow-copy bug where multiple branches share the same memory reference.

def create_metric() -> dict[str, Any]:
    """Génère un dictionnaire d'indicateur avec une piste d'audit isolée en mémoire."""
    return {
        "val_n": None,       # Chiffre brut de l'année en cours (Exercice N)
        "val_n_1": None,     # Chiffre brut de l'année précédente (Exercice N-1)
        "page_n": None,      # Numéro de page d'extraction sémantique de l'année N
        "page_n_1": None,    # Numéro de page d'extraction sémantique de l'année N-1
        "snippet_n": None,   # Extrait textuel de la table d'origine (Année N)
        "snippet_n_1": None, # Extrait textuel de la table d'origine (Année N-1)
        "pct_change": None   # Calculé programmatiquement en Python pur
    }

def create_branch() -> dict[str, Any]:
    """Génère une structure de branche technique avec des références mémoire uniques."""
    return {
        "primes_emises": create_metric(),
        "primes_acquises": create_metric(),
        "charges_sinistres": create_metric(),
        "resultat_technique": create_metric(),
        "pna": create_metric(),  # Provisions pour primes non acquises
        "psp": create_metric()   # Provisions pour sinistres à payer
    }

def empty_schema() -> dict[str, Any]:
    """Génère un schéma réglementaire d'indicateurs entièrement vierge et isolé."""
    return {
        "company": None,
        "non_vie": {
            "primes_emises": create_metric(),
            "primes_cedees": create_metric(),          
            "primes_acquises": create_metric(),
            "charges_sinistres": create_metric(),
            "part_reassureurs_sinistres": create_metric(), 
            "frais_d_acquisition": create_metric(),     
            "frais_d_administration": create_metric(),    
            "charges_exploitation": create_metric(),
            "provisions_primes_non_acquises": create_metric(), 
            "provisions_sinistres_a_payer": create_metric(),   
            "provisions_techniques": create_metric(),
            "resultat_technique": create_metric(),      
            "resultat_net": create_metric(),
            "autres_charges": create_metric(),
        },
        "vie": {
            "primes_emises": create_metric(),
            "primes_cedees": create_metric(),          
            "primes_acquises": create_metric(),
            "charges_sinistres": create_metric(),
            "provisions_mathématiques": create_metric(),
            "resultat_technique": create_metric(),      
            "resultat_net": create_metric(),
        },
        # Blocs sectoriels réels extraits - Désormais strictement isolés
        "automobile": create_branch(),
        "sante": create_branch(),
        "incendie": create_branch(),     
        "transport": create_branch(),    
        "risques_divers": create_branch(),
        "global": {
            "fonds_propres": create_metric(),
            "total_bilan": create_metric(),
            "produits_financiers": create_metric(),
            "impot_sur_les_benefices": create_metric(), 
            "charges_personnel": create_metric(),
            "effectif": create_metric(),
        },
    }

OUTPUT_SCHEMA: dict[str, Any] = empty_schema()

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
    Fusionne de manière itérative les extractions sémantiques de chaque bloc de pages.
    Empêche les blocs vides ou incomplets d'effacer les données déjà extraites.
    """
    if incoming.get("company") and not base.get("company"):
        base["company"] = incoming["company"]

    # Updated to include "incendie" and "transport" technical branches
    sections = ("non_vie", "vie", "automobile", "sante", "incendie", "transport", "risques_divers", "global")
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
    # Updated to include "incendie" and "transport" technical branches
    sections = ("non_vie", "vie", "automobile", "sante", "incendie", "transport", "risques_divers", "global")
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
    # Updated to include "incendie" and "transport" technical branches
    sections = ("non_vie", "vie", "automobile", "sante", "incendie", "transport", "risques_divers", "global")
    for section in sections:
        if section not in result or not isinstance(result[section], dict):
            continue
        for metric in result[section].values():
            if isinstance(metric, dict) and (metric.get("val_n") is not None or metric.get("val_n_1") is not None):
                filled += 1

    return filled >= 2