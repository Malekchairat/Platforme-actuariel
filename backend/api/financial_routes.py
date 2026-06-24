from __future__ import annotations

import asyncio
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.etl.classify_and_extract import process_uploaded_document
from backend.etl.config import ALLOWED_EXTENSIONS, PROCESSED_DIR
from backend.etl.gemini_service import GeminiQuotaError, GeminiServiceError

router = APIRouter(prefix="/financial", tags=["financial"])


def _is_financial_json(payload: dict[str, Any]) -> bool:
    return all(key in payload for key in ("company", "non_vie", "vie", "global"))


def _list_processed_files() -> list[dict[str, str]]:
    files: list[dict[str, str]] = []

    if not PROCESSED_DIR.exists():
        return files

    for path in sorted(PROCESSED_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue

        if not _is_financial_json(payload):
            continue

        company = str(payload.get("company", path.stem))
        files.append(
            {
                "id": path.stem,
                "filename": path.name,
                "company": company,
            }
        )

    return files


@router.get("/processed")
def list_processed() -> list[dict[str, str]]:
    return _list_processed_files()


@router.get("/processed/{file_id}")
def get_processed(file_id: str) -> dict[str, Any]:
    path = PROCESSED_DIR / f"{file_id}.json"
    if not path.exists():
        path = PROCESSED_DIR / file_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not _is_financial_json(payload):
        raise HTTPException(status_code=400, detail="Format financier invalide")

    return payload


@router.post("/import")
async def import_financial_document(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Type de fichier non supporté. Extensions acceptées: "
                f"{', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )

    upload_dir = PROCESSED_DIR.parent / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    temp_name = f"{uuid.uuid4().hex}{suffix}"
    temp_path = upload_dir / temp_name

    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = await asyncio.to_thread(
            process_uploaded_document,
            str(temp_path),
            file.filename,
        )
        return result
    except GeminiQuotaError as exc:
        return {
            "success": False,
            "status": "quota_exceeded",
            "message": str(exc),
        }
    except GeminiServiceError as exc:
        return {
            "success": False,
            "status": "gemini_error",
            "message": str(exc),
        }
    except Exception as exc:
        return {
            "success": False,
            "status": "error",
            "message": f"Erreur lors du traitement : {exc}",
        }
    finally:
        if temp_path.exists():
            temp_path.unlink()
