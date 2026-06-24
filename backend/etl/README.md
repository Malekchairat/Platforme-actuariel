# ETL Cleaning Layer

This layer turns noisy PDF extraction outputs into dashboard-ready canonical datasets.

## What it does

- Reads `data/extracted/tables/*_kpis.json`
- Normalizes company names and dates
- Rejects suspect numeric values using conservative thresholds
- Writes a canonical KPI CSV to `data/processed/canonical_kpis.csv`
- Produces a KPI validation report in `data/processed/canonical_kpis_validation.md`
- Scans `data/extracted/tables/*_tables.csv`
- Builds a canonical statement-row catalog at `data/processed/canonical_statement_rows.csv`
- Produces a statement-mapping report in `data/processed/statement_catalog_validation.md`

## Run

```powershell
Set-Location "c:\Users\msi\Desktop\Copilot actuariel\copilot_actuariel"
python backend\etl\build_canonical_kpis.py
python backend\etl\build_statement_catalog.py
```

## Why this matters

The dashboard should read curated KPI rows, not raw PDF text or noisy table exports.
