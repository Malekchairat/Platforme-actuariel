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
        files.append({
            "id": path.stem,
            "filename": path.name,
            "company": company,
        })
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
    path = PROCESSED_DIR / f"{file_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Fichier JSON introuvable : {file_id}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        company_name = payload.get("company", "").strip()
        
        text_lower = company_name.lower().strip()
        text_clean = re.sub(r"[^a-z0-9\s_-]", "", text_lower)
        company_slug = re.sub(r"[\s_-]+", "_", text_clean)
        
        year_match = re.search(r"\d{4}", file_id)
        exercise_year = year_match.group(0) if year_match else "2025"

        sql_delete = f"""
        DELETE FROM insurance_reports 
        WHERE company_slug = '{company_slug}' AND exercise_year = '{exercise_year}';
        SELECT 'ok';
        """
        query_scalar(sql_delete)
        path.unlink()

        return {
            "success": True,
            "message": f"Le portefeuille de {company_name} ({exercise_year}) a été purgé."
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression : {str(exc)}")


@router.post("/import")
async def import_financial_document(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Extensions valides : {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    upload_dir = PROCESSED_DIR.parent / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    temp_path = upload_dir / f"{uuid.uuid4().hex}{suffix}"

    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = await asyncio.to_thread(process_uploaded_document, str(temp_path), file.filename)
        
        if result.get("success") is True or result.get("status") == "processed":
            output_file = result.get("output_file")
            if output_file and Path(output_file).exists():
                await asyncio.to_thread(load_json_to_insurance_reports, Path(output_file))
                result["database_indexed"] = True

        return result
    except GeminiQuotaError as exc:
        return {"success": False, "status": "quota_exceeded", "message": str(exc)}
    except GeminiServiceError as exc:
        return {"success": False, "status": "failed", "message": str(exc)}
    finally:
        if temp_path.exists():
            temp_path.unlink()


# 🛠️ REÉCRITURE CRITIQUE : Calcul analytique réel par branche et ratios S/P
@router.get("/ranking")
def get_market_ranking(metric: str = "primes_emises", segment: str = "vue_globale") -> list[dict[str, Any]]:
    """
    Moteur de classement dynamique unifié interconnectant les sous-branches de l'ETL.
    Segments acceptés : vue_globale, automobile, sante, risques_divers, non_vie, vie
    Indicateurs calculés : primes_emises, resultat_technique, resultat_net, ratio_sp, taux_effectif_impot
    """
    ranking_list = []
    if not PROCESSED_DIR.exists():
        return ranking_list

    for path in PROCESSED_DIR.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        if not isinstance(payload, dict) or not _is_financial_json(payload):
            continue

        company_name = payload.get("company", path.stem)
        value = 0.0
        
        try:
            # 1. GESTION DU CRITÈRE COMPTABLE DES PRÉLÈVEMENTS FISCAUX (TAUX EFFECTIF IS)
            if metric == "taux_effectif_impot":
                global_data = payload.get("global", {})
                impotbrut = 0.0
                if isinstance(global_data.get("impot_sur_les_benefices"), dict):
                    impotbrut = abs(float(global_data["impot_sur_les_benefices"].get("val_n") or 0.0))
                
                res_nv = float(payload.get("non_vie", {}).get("resultat_net", {}).get("val_n") or 0.0)
                res_v = float(payload.get("vie", {}).get("resultat_net", {}).get("val_n") or 0.0)
                total_net = res_nv + res_v
                
                brut_total = total_net + impotbrut
                value = round((impotbrut / brut_total) * 100, 2) if brut_total > 0 else 0.0

            # 2. GESTION DU RATIO ACTUARIEL S/P VENTILÉ (SINISTRALITÉ PAR BRANCHE)
            elif metric == "ratio_sp":
                # Si vue globale, on applique le S/P sur le segment Non-Vie principal (moteur I.R.D/Auto)
                target_key = "non_vie" if segment == "vue_globale" else segment
                section_data = payload.get(target_key, {})
                
                if isinstance(section_data, dict):
                    sin_obj = section_data.get("charges_sinistres")
                    # Fallback sur les primes émises si les primes acquises sectorielles manquent
                    pr_obj = section_data.get("primes_acquises") or section_data.get("primes_emises")
                    
                    sin_val = abs(float(sin_obj.get("val_n") or 0.0)) if isinstance(sin_obj, dict) else 0.0
                    pr_val = float(pr_obj.get("val_n") or 0.0) if isinstance(pr_obj, dict) else 0.0
                    
                    value = round((sin_val / pr_val) * 100, 2) if pr_val > 0 else 0.0

            # 3. GESTION DES INDICATEURS DE VOLUMES COMPTABLES STANDARDS (CA, RÉSULTATS)
            else:
                if segment == "vue_globale":
                    # Somme consolidée des deux grands compartiments métiers
                    v1 = 0.0
                    if isinstance(payload.get("non_vie", {}).get(metric), dict):
                        v1 = float(payload["non_vie"][metric].get("val_n") or 0.0)
                    v2 = 0.0
                    if isinstance(payload.get("vie", {}).get(metric), dict):
                        v2 = float(payload["vie"][metric].get("val_n") or 0.0)
                    value = v1 + v2
                else:
                    # Extraction directe depuis le dictionnaire de sous-branche
                    section_data = payload.get(segment, {})
                    if isinstance(section_data, dict) and metric in section_data:
                        metric_obj = section_data.get(metric)
                        if isinstance(metric_obj, dict):
                            value = float(metric_obj.get("val_n") or 0.0)

            value = float(value) if value is not None else 0.0
        except Exception:
            value = 0.0

        ranking_list.append({
            "company": company_name,
            "value": value,
            "file_id": path.stem
        })

    # Tri des assureurs par ordre de performance décroissante
    ranking_list.sort(key=lambda x: x.get("value", 0.0), reverse=True)
    
    for index, item in enumerate(ranking_list):
        item["rank"] = index + 1
    return ranking_list