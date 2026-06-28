from __future__ import annotations

import asyncio
import json
import shutil
import uuid
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.etl.classify_and_extract import process_uploaded_document
from backend.etl.config import ALLOWED_EXTENSIONS, PROCESSED_DIR
from backend.etl.gemini_service import GeminiQuotaError, GeminiServiceError
from backend.api.db import query_scalar
from backend.etl.db_loader_psql import load_json_to_insurance_reports

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


@router.delete("/processed/{file_id}")
def delete_processed(file_id: str) -> dict[str, Any]:
    """
    Supprime définitivement un rapport financier du disque et de la table PostgreSQL.
    """
    print(f"🔥 Requête DELETE reçue pour le fichier : {file_id}")
    path = PROCESSED_DIR / f"{file_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Fichier JSON introuvable sur le disque : {file_id}")

    try:
        # 1. Lire le fichier pour extraire dynamiquement le nom de la compagnie
        payload = json.loads(path.read_text(encoding="utf-8"))
        company_name = payload.get("company", "").strip()
        
        # Recréer le slug exact correspondant à la base de données
        text_lower = company_name.lower().strip()
        text_clean = re.sub(r"[^a-z0-9\s_-]", "", text_lower)
        company_slug = re.sub(r"[\s_-]+", "_", text_clean)
        
        # Extraire l'année à partir du file_id (ex: ASTREE_2025 -> 2025)
        year_match = re.search(r"\d{4}", file_id)
        exercise_year = year_match.group(0) if year_match else "2025"

        # 2. Exécuter la purge dans PostgreSQL via le schéma flexible
        sql_delete = f"""
        DELETE FROM insurance_reports 
        WHERE company_slug = '{company_slug}' AND exercise_year = '{exercise_year}';
        SELECT 'ok';
        """
        query_scalar(sql_delete)

        # 3. Supprimer le fichier JSON physique du disque
        path.unlink()

        return {
            "success": True,
            "message": f"Le portefeuille de {company_name} ({exercise_year}) a été supprimé de la DB et du disque."
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne lors de la suppression : {str(exc)}"
        )


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
        
        if result.get("success") is True or result.get("status") == "processed":
            output_file = result.get("output_file")
            if output_file and Path(output_file).exists():
                await asyncio.to_thread(load_json_to_insurance_reports, Path(output_file))
                result["database_indexed"] = True

        return result
    except GeminiQuotaError as exc:
        return {"success": False, "status": "quota_exceeded", "message": str(exc)}
    except GeminiServiceError as exc:
        return {"success": False, "status": "gemini_error", "message": str(exc)}
    except Exception as exc:
        return {"success": False, "status": "error", "message": f"Erreur lors du traitement : {exc}"}
    finally:
        if temp_path.exists():
            temp_path.unlink()