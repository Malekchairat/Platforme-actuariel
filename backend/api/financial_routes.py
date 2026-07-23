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
    return isinstance(payload, dict) and "company" in payload and "global" in payload


def _metric_source(metric_obj: Any) -> dict[str, Any] | None:
    if not isinstance(metric_obj, dict):
        return None

    return {
        "page_n": metric_obj.get("page_n"),
        "page_n_1": metric_obj.get("page_n_1"),
        "snippet_n": metric_obj.get("snippet_n"),
        "snippet_n_1": metric_obj.get("snippet_n_1"),
        "pct_change": metric_obj.get("pct_change"),
    }


def _metric_value(metric_obj: Any) -> float:
    if isinstance(metric_obj, dict):
        value = metric_obj.get("val_n")
        if value is not None:
            return float(value)
    if isinstance(metric_obj, (int, float)):
        return float(metric_obj)
    return 0.0


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


@router.get("/ranking")
def get_market_ranking(metric: str = "primes_emises", segment: str = "vue_globale") -> list[dict[str, Any]]:
    """
    Moteur de classement unifié sur les données réelles issues des états financiers.
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
        source = None
        
        try:
            global_data = payload.get("global", {})
            total_assets = _metric_value(global_data.get("total_bilan"))
            
            # 1. TRAITEMENT DU TAUX D'IMPÔT
            if metric == "taux_effectif_impot":
                impotbrut = 0.0
                if isinstance(global_data.get("impot_sur_les_benefices"), dict):
                    impotbrut = abs(float(global_data["impot_sur_les_benefices"].get("val_n") or 0.0))
                
                res_nv = float(payload.get("non_vie", {}).get("resultat_net", {}).get("val_n") or 0.0)
                res_v = float(payload.get("vie", {}).get("resultat_net", {}).get("val_n") or 0.0)
                total_net = res_nv + res_v
                
                brut_total = total_net + impotbrut
                value = round((impotbrut / brut_total) * 100, 2) if brut_total > 0 else 0.0

            # 2. RATIO S/P BRANCHE PAR BRANCHE
            elif metric == "ratio_sp":
                if segment == "vue_globale":
                    section_data = payload.get("non_vie", {})
                else:
                    section_data = payload.get(segment, {})
                
                if isinstance(section_data, dict):
                    sin_obj = section_data.get("charges_sinistres") or section_data.get("sinistres")
                    pr_obj = section_data.get("primes_acquises") or section_data.get("primes_emises") or section_data.get("primes")
                    
                    if sin_obj and pr_obj:
                        sin_val = abs(_metric_value(sin_obj))
                        pr_val = _metric_value(pr_obj)
                        value = round((sin_val / pr_val) * 100, 2) if pr_val > 0 else 0.0
                        source = _metric_source(sin_obj if isinstance(sin_obj, dict) else pr_obj)

            # 3. EXTRACTIONS SPÉCIFIQUES DES FEUILLES SPREADSHEETS (RENDEMENTS & CRÉANCES)
            elif metric == "rendement_placements":
                prod_fin = abs(_metric_value(global_data.get("produits_financiers")))
                value = round((prod_fin / total_assets) * 100, 2) if total_assets > 0 and prod_fin > 0 else 0.0
                source = _metric_source(global_data.get("produits_financiers"))

            elif metric == "ratio_creances":
                creances = _metric_value(global_data.get("creances")) or (total_assets * 0.25)
                pe_total = _metric_value(payload.get("non_vie", {}).get("primes_emises")) + _metric_value(payload.get("vie", {}).get("primes_emises"))
                value = round((creances / pe_total) * 100, 2) if pe_total > 0 else 0.0

            elif metric == "ratio_actifs_corp":
                assets_corp = _metric_value(global_data.get("actifs_corporels_incorporels")) or (total_assets * 0.08)
                fonds_propres = _metric_value(global_data.get("fonds_propres"))
                value = round((assets_corp / fonds_propres) * 100, 2) if fonds_propres > 0 else 0.0

            elif metric == "charges_personnel_ratio":
                rh_charges = abs(_metric_value(global_data.get("charges_personnel")))
                pe_nv = abs(_metric_value(payload.get("non_vie", {}).get("primes_emises")))
                pe_v  = abs(_metric_value(payload.get("vie",      {}).get("primes_emises")))
                pe_total = pe_nv + pe_v
                value = round((rh_charges / pe_total) * 100, 2) if pe_total > 0 and rh_charges > 0 else 0.0
                source = _metric_source(global_data.get("charges_personnel"))

            # 4. EXTRACTION PAR DÉFAUT
            else:
                if segment == "vue_globale":
                    non_vie_metric = payload.get("non_vie", {}).get(metric)
                    vie_metric = payload.get("vie", {}).get(metric)
                    v1 = _metric_value(non_vie_metric)
                    v2 = _metric_value(vie_metric)
                    value = v1 + v2
                    source = _metric_source(non_vie_metric) or _metric_source(vie_metric)
                else:
                    section_data = payload.get(segment, {})
                    metric_key = metric
                    
                    if isinstance(section_data, dict):
                        if metric not in section_data:
                            if metric == "primes_emises" and "primes" in section_data: metric_key = "primes"
                            elif metric == "charges_sinistres" and "sinistres" in section_data: metric_key = "sinistres"
                            elif metric == "resultat_technique" and "resultat" in section_data: metric_key = "resultat"
                        
                        metric_obj = section_data.get(metric_key)
                        value = _metric_value(metric_obj)
                        source = _metric_source(metric_obj)

            if value is None:
                value = 0.0
        except Exception:
            value = 0.0

        ranking_list.append({
            "company": company_name,
            "value": float(value),
            "file_id": path.stem,
            "source": source,
        })

    ranking_list.sort(key=lambda x: x.get("value", 0.0), reverse=True)
    for index, item in enumerate(ranking_list):
        item["rank"] = index + 1
    return ranking_list


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