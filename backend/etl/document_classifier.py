from __future__ import annotations

import json
from typing import Any

from .config import FINANCIAL_KEYWORDS
from .gemini_service import generate_json
from .pdf_utils import build_document_sample, extract_document_pages, filter_relevant_pages

# Lightweight RAG context: domain knowledge injected into the classifier prompt.
RAG_REFERENCE_CONTEXT = """
Documents acceptés sur la plateforme Copilot Actuariel:
- États financiers annuels / semestriels d'assureurs et réassureurs
- Bilans, comptes de résultat techniques vie et non-vie
- Rapports actuariels avec primes, sinistres, provisions, fonds propres
- Fichiers JSON déjà structurés avec indicateurs d'assurance

Documents NON acceptés:
- Factures, CV, contrats commerciaux génériques
- Documents médicaux, juridiques sans données financières d'assurance
- Marketing, présentations sans chiffres financiers d'assurance
- Code source, documentation technique IT
"""


def keyword_relevance_score(text: str) -> float:
    text_lower = text.lower()
    hits = sum(1 for keyword in FINANCIAL_KEYWORDS if keyword in text_lower)
    return min(hits / 4, 1.0)


def classify_document(file_path: str, filename: str) -> dict[str, Any]:
    pages = extract_document_pages(file_path)
    if not pages:
        return {
            "related": False,
            "confidence": 1.0,
            "document_type": "empty",
            "reason": "Le fichier ne contient aucun texte exploitable.",
            "method": "empty-document",
        }

    relevant_pages = filter_relevant_pages(pages)
    sample = build_document_sample(relevant_pages)
    keyword_score = keyword_relevance_score(sample)
    filename_lower = filename.lower()

    financial_filename = any(
        token in filename_lower
        for token in ("financier", "assurance", "assurances", "bilan", "etat", "état")
    )

    # Fast path: skip Gemini call to save quota when signals are strong
    if keyword_score >= 0.5 and financial_filename:
        return {
            "related": True,
            "confidence": max(keyword_score, 0.85),
            "document_type": "insurance_financial_statement",
            "reason": "Document identifié comme état financier d'assurance (analyse par mots-clés).",
            "method": "keyword-fast-path",
            "keyword_score": keyword_score,
        }

    if keyword_score >= 0.75:
        return {
            "related": True,
            "confidence": keyword_score,
            "document_type": "insurance_financial_statement",
            "reason": "Contenu fortement aligné avec la terminologie actuarielle.",
            "method": "keyword-fast-path",
            "keyword_score": keyword_score,
        }

    if keyword_score < 0.25 and not financial_filename:
        return {
            "related": False,
            "confidence": 1.0 - keyword_score,
            "document_type": "unknown",
            "reason": "Ce document ne contient pas de vocabulaire financier d'assurance reconnu.",
            "method": "keyword-reject",
            "keyword_score": keyword_score,
        }

    prompt = f"""
You are a document classifier for an actuarial insurance analytics platform.

Use this domain reference (RAG context):
{RAG_REFERENCE_CONTEXT}

Analyze the document excerpt below and decide if it should be processed by the financial extraction pipeline.

Return ONLY valid JSON with this schema:
{{
  "related": true,
  "confidence": 0.0,
  "document_type": "insurance_financial_statement",
  "reason": "short explanation in French"
}}

Rules:
- related=true only if the document contains insurance/financial statement data usable for extraction
- confidence between 0 and 1
- reason in French, one sentence
- Output JSON only, no markdown

Filename: {filename}

DOCUMENT EXCERPT:
{sample}
"""

    try:
        llm_result = generate_json(prompt)
        related = bool(llm_result.get("related"))
        confidence = float(llm_result.get("confidence", 0))
        reason = str(llm_result.get("reason", ""))
        document_type = str(llm_result.get("document_type", "unknown"))

        if not related and keyword_score >= 0.75:
            related = True
            confidence = max(confidence, keyword_score)
            reason = (
                "Document classé comme pertinent via analyse de mots-clés actuariels "
                "(complément au modèle)."
            )
            document_type = "insurance_financial_statement"

        return {
            "related": related,
            "confidence": confidence,
            "document_type": document_type,
            "reason": reason,
            "method": "rag-gemini",
            "keyword_score": keyword_score,
        }
    except Exception as exc:
        related = keyword_score >= 0.5
        return {
            "related": related,
            "confidence": keyword_score,
            "document_type": "insurance_financial_statement" if related else "unknown",
            "reason": (
                "Analyse RAG indisponible, décision basée sur les mots-clés financiers."
                if related
                else "Ce document ne semble pas contenir de données financières d'assurance."
            ),
            "method": "keyword-fallback",
            "keyword_score": keyword_score,
            "error": str(exc),
        }
