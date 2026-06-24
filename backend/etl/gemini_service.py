from __future__ import annotations

import re
import time
from typing import Any

from google import genai
from google.genai import errors as genai_errors

from .config import GEMINI_API_KEY, GEMINI_MODEL
from .financial_schema import safe_json_parse

_client: genai.Client | None = None


class GeminiQuotaError(RuntimeError):
    """Raised when Gemini free-tier quota is exhausted."""


class GeminiServiceError(RuntimeError):
    """Raised for other Gemini failures."""


def get_client() -> genai.Client:
    global _client
    if not GEMINI_API_KEY:
        raise GeminiServiceError(
            "GEMINI_API_KEY manquante. Ajoutez-la dans le fichier .env à la racine du projet."
        )
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _is_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "quota" in text


def _retry_delay(exc: Exception, attempt: int) -> float:
    match = re.search(r"retry in ([0-9.]+)s", str(exc), re.IGNORECASE)
    if match:
        return float(match.group(1)) + 1.0
    return min(60.0, 2 ** attempt * 5)


def generate_text(prompt: str, *, retries: int = 5) -> str:
    client = get_client()
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
            )
            return response.text or ""
        except genai_errors.ClientError as exc:
            last_error = exc
            if _is_quota_error(exc):
                if attempt == retries - 1:
                    raise GeminiQuotaError(
                        "Quota Gemini API dépassé (limite gratuite ~20 requêtes/jour pour "
                        f"{GEMINI_MODEL}). Réessayez plus tard ou activez la facturation Google AI."
                    ) from exc
                time.sleep(_retry_delay(exc, attempt))
            else:
                if attempt == retries - 1:
                    raise GeminiServiceError(str(exc)) from exc
                time.sleep(2**attempt)
        except Exception as exc:
            last_error = exc
            if _is_quota_error(exc):
                if attempt == retries - 1:
                    raise GeminiQuotaError(
                        "Quota Gemini API dépassé. Réessayez dans quelques minutes ou demain."
                    ) from exc
                time.sleep(_retry_delay(exc, attempt))
            else:
                if attempt == retries - 1:
                    raise GeminiServiceError(str(exc)) from exc
                time.sleep(2**attempt)

    raise GeminiServiceError(str(last_error or "Gemini failed unexpectedly"))


def generate_json(prompt: str, *, retries: int = 5) -> dict[str, Any]:
    return safe_json_parse(generate_text(prompt, retries=retries))
