from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .artifacts import load_csv_artifact, load_json_artifact
from .db import query_csv, query_scalar
from .financial_routes import router as financial_router


app = FastAPI(title="Copilot Actuariel API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(financial_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    try:
        db_status = query_scalar("SELECT 'ok'")
    except Exception as exc:
        return {"status": "degraded", "db": str(exc)}
    return {"status": "ok", "db": db_status}


@app.get("/companies")
def companies() -> list[dict[str, str]]:
    return query_csv(
        "SELECT DISTINCT societe FROM actuariel.kpis ORDER BY societe"
    )


@app.get("/kpis/latest")
def latest_kpis(company: str | None = None) -> list[dict[str, str]]:
    sql = "SELECT * FROM actuariel.v_latest_kpis"
    if company:
        sql += f" WHERE societe = '{company.replace("'", "''")}'"
    sql += " ORDER BY societe"
    return query_csv(sql)


@app.get("/kpis/summary")
def kpis_summary() -> list[dict[str, str]]:
    return query_csv(
        """
        SELECT
            societe,
            COUNT(*) AS periods,
            MAX(date_document) AS latest_period,
            MAX(primes_emises) AS max_primes_emises,
            MAX(resultat_net) AS max_resultat_net,
            MAX(ratio_sp) AS max_ratio_sp
        FROM actuariel.kpis
        GROUP BY societe
        ORDER BY societe
        """
    )


@app.get("/kpis/timeseries")
def kpis_timeseries(
    company: str = Query(..., description="Company name"),
    kpi: str = Query(..., pattern="^(primes_emises|charge_sinistres|provisions_techniques|resultat_net|total_bilan|fonds_propres|ratio_sp)$"),
) -> list[dict[str, str]]:
    safe_company = company.replace("'", "''")
    safe_kpi = kpi.replace("'", "''")
    return query_csv(
        f"""
        SELECT date_document, {safe_kpi} AS value
        FROM actuariel.kpis
        WHERE societe = '{safe_company}'
          AND {safe_kpi} IS NOT NULL
        ORDER BY date_document
        """
    )


@app.get("/tables/sample")
def tables_sample(
    company: str | None = None,
    limit: int = 20,
) -> list[dict[str, str]]:
    sql = "SELECT societe, source_fichier, page, table_num, row_data FROM actuariel.extracted_table_rows"
    if company:
        sql += f" WHERE societe = '{company.replace("'", "''")}'"
    sql += f" ORDER BY id DESC LIMIT {int(limit)}"
    return query_csv(sql)


@app.get("/quality/kpis")
def quality_kpis() -> dict:
    return load_json_artifact("canonical_kpis_validation.json")


@app.get("/quality/statements")
def quality_statements() -> dict:
    return load_json_artifact("statement_catalog_validation.json")


@app.get("/catalog/statements/sample")
def statements_sample(limit: int = 25) -> list[dict[str, str]]:
    return load_csv_artifact("canonical_statement_rows.csv", limit=limit)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.api.main:app", host="127.0.0.1", port=8000, reload=False)
