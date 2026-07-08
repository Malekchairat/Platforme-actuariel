from __future__ import annotations

from typing import Any

from .document_classifier import classify_document
from .extract_financial_data import (
    build_output_path,
    extract_financial_data,
    save_result,
)
from .financial_schema import is_valid_financial_result
from .gemini_service import GeminiQuotaError, GeminiServiceError


def process_uploaded_document(file_path: str, original_filename: str) -> dict[str, Any]:
    # 1. Classification initiale du type de document
    classification = classify_document(file_path, original_filename)

    if not classification.get("related"):
        return {
            "success": False,
            "status": "rejected",
            "message": "Ce document n'est pas lié aux états financiers d'assurance.",
            "classification": classification,
        }

    # 2. Tentative d'extraction avec capture des exceptions métiers et techniques
    try:
        extracted = extract_financial_data(file_path)
    except ValueError as exc:
        # Intercepte la protection métier liée au refus des rapports consolidés
        return {
            "success": False,
            "status": "rejected",
            "message": str(exc),
            "classification": classification,
        }
    except GeminiQuotaError as exc:
        return {
            "success": False,
            "status": "quota_exceeded",
            "message": str(exc),
            "classification": classification,
        }
    except GeminiServiceError as exc:
        return {
            "success": False,
            "status": "gemini_error",
            "message": str(exc),
            "classification": classification,
        }

    # 3. Validation de la conformité du résultat final
    if not is_valid_financial_result(extracted):
        return {
            "success": False,
            "status": "extraction_failed",
            "message": (
                "Le document semble pertinent mais l'extraction n'a pas produit "
                "assez de données financières exploitables."
            ),
            "classification": classification,
            "data": extracted,
        }

    # 4. Sauvegarde locale et indexation de la balance dans PostgreSQL
    output_path = build_output_path(extracted, original_filename)
    save_result(extracted, output_path)

    return {
        "success": True,
        "status": "processed",
        "message": "Document importé et extrait avec succès.",
        "classification": classification,
        "output_file": output_path.name,
        "output_path": str(output_path),
        "company_id": output_path.stem,
        "data": extracted,
    }