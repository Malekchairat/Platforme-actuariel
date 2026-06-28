"""
Lightweight DB loader that uses the `psql` CLI to apply schema and load extracted files.

Usage: set env vars (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) then:
  python backend/etl/db_loader_psql.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

BASE = Path(__file__).parent.parent.parent
EXTRACTED_DIR = BASE / "data" / "extracted" / "tables"
PROCESSED_DIR = BASE / "data" / "processed"
RAW_PDF_DIR = BASE / "data" / "raw" / "etats_financiers"
SCHEMA_SQL = BASE / "db" / "schema_actuariel_bh.sql"
CANONICAL_KPIS_CSV = PROCESSED_DIR / "canonical_kpis.csv"
STATEMENT_ROWS_CSV = PROCESSED_DIR / "canonical_statement_rows.csv"


def run_psql(sql: str) -> None:
    cmd = [
        "psql",
        "-h",
        os.getenv("PGHOST", "localhost"),
        "-p",
        os.getenv("PGPORT", "5432"),
        "-U",
        os.getenv("PGUSER", "postgres"),
        "-d",
        os.getenv("PGDATABASE", "copilot_actuariel"),
    ]
    env = os.environ.copy()
    proc = subprocess.run(cmd, input=sql, text=True, encoding='utf-8', env=env, capture_output=True)
    if proc.returncode != 0:
        print(proc.stdout)
        print(proc.stderr)
        raise RuntimeError(f"psql failed (exit {proc.returncode})")


def apply_schema() -> None:
    if not SCHEMA_SQL.exists():
        raise FileNotFoundError(SCHEMA_SQL)
    sql = SCHEMA_SQL.read_text(encoding="utf-8")
    print("Applying schema...")
    run_psql(sql)
    print("Schema applied")


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    text = str(value).strip()
    if not text:
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


def sql_number(value: Any) -> str:
    if value is None:
        return "NULL"
    text = str(value).strip()
    if not text:
        return "NULL"
    try:
        return str(float(text))
    except ValueError:
        return "NULL"


def slugify(text: str) -> str:
    """Génère un slug propre pour la colonne company_slug (ex: 'bna_assurances')"""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s_-]", "", text)
    text = re.sub(r"[\s_-]+", "_", text)
    return text


def delete_by_source_file(filename: str) -> None:
    """
    Purge toutes les entrées liées à un fichier source spécifique dans PostgreSQL.
    """
    print(f"Purging data for source file: {filename} from PostgreSQL...")
    sql = f"""
    DELETE FROM actuariel.kpis WHERE source_fichier = {sql_literal(filename)};
    DELETE FROM actuariel.extracted_table_rows WHERE source_fichier = {sql_literal(filename)};
    DELETE FROM actuariel.statement_rows WHERE source_fichier = {sql_literal(filename)};
    """
    run_psql(sql)
    print(f"Purge complete for {filename}.")


def load_json_to_insurance_reports(file_path: Path) -> bool:
    """
    Lit un fichier JSON processed hiérarchisé et l'insère directement 
    dans la table flexible 'insurance_reports' sous forme de jsonb.
    """
    try:
        raw_content = file_path.read_text(encoding="utf-8")
        data = json.loads(raw_content)
    except Exception as e:
        print(f"   ❌ Erreur de lecture du fichier {file_path.name}: {e}")
        return False

    company_name = data.get("company", file_path.stem.split('_')[0]).strip()
    company_slug = slugify(company_name)
    
    year_match = re.search(r"\d{4}", file_path.name)
    exercise_year = year_match.group(0) if year_match else "2025"
    
    json_data_sql = raw_content.replace("'", "''")

    pdf_filename = f"Etat financier {company_name} {exercise_year}.pdf"
    pdf_path = RAW_PDF_DIR / pdf_filename
    if not pdf_path.exists():
        pdf_filename = file_path.stem + ".pdf"
        
    pdf_file_path_val = f"data/raw/etats_financiers/{pdf_filename}"

    print(f"   -> Mapping : {company_name} ({exercise_year}) [Slug: {company_slug}]")

    sql = f"""
    DELETE FROM insurance_reports WHERE company_slug = {sql_literal(company_slug)} AND exercise_year = {sql_literal(exercise_year)};
    
    INSERT INTO insurance_reports (
        company_slug, exercise_year, company_name, extracted_data, pdf_file_path, created_at
    ) VALUES (
        {sql_literal(company_slug)}, 
        {sql_literal(exercise_year)}, 
        {sql_literal(company_name)}, 
        '{json_data_sql}'::jsonb, 
        {sql_literal(pdf_file_path_val)}, 
        NOW()
    );
    """
    try:
        run_psql(sql)
        return True
    except Exception as e:
        print(f"   ❌ Erreur lors de l'insertion dans insurance_reports : {e}")
        return False


def load_canonical_kpis() -> tuple[int, int]:
    if not CANONICAL_KPIS_CSV.exists():
        return load_kpis()

    import csv

    with CANONICAL_KPIS_CSV.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    loaded = 0
    for row in rows:
        sql = f"""
        INSERT INTO actuariel.kpis (
            societe, date_document, date_document_raw, source_fichier, source_type,
            confidence, issue_count, issues, primes_emises, charge_sinistres,
            provisions_techniques, resultat_net, total_bilan, fonds_propres, ratio_sp, updated_at
        ) VALUES (
            {sql_literal(row.get('societe'))}, {sql_literal(row.get('date_document'))}::date,
            {sql_literal(row.get('date_document'))}, {sql_literal(row.get('source_fichier'))},
            {sql_literal(row.get('source_type'))}, {sql_number(row.get('confidence'))},
            COALESCE({sql_number(row.get('issue_count'))}::integer, 0), {sql_literal(row.get('issues'))},
            {sql_number(row.get('primes_emises'))}, {sql_number(row.get('charge_sinistres'))},
            {sql_number(row.get('provisions_techniques'))}, {sql_number(row.get('resultat_net'))},
            {sql_number(row.get('total_bilan'))}, {sql_number(row.get('fonds_propres'))},
            {sql_number(row.get('ratio_sp'))}, NOW()
        ) ON CONFLICT (societe, date_document_raw, source_fichier)
        DO UPDATE SET
            date_document = EXCLUDED.date_document,
            source_type = EXCLUDED.source_type,
            confidence = EXCLUDED.confidence,
            issue_count = EXCLUDED.issue_count,
            issues = EXCLUDED.issues,
            primes_emises = EXCLUDED.primes_emises,
            charge_sinistres = EXCLUDED.charge_sinistres,
            provisions_techniques = EXCLUDED.provisions_techniques,
            resultat_net = EXCLUDED.resultat_net,
            total_bilan = EXCLUDED.total_bilan,
            fonds_propres = EXCLUDED.fonds_propres,
            ratio_sp = EXCLUDED.ratio_sp,
            updated_at = NOW();
        """
        run_psql(sql)
        loaded += 1
    return len(rows), loaded


def load_kpis() -> tuple[int, int]:
    files = sorted(EXTRACTED_DIR.glob("*_kpis.json"))
    loaded = 0
    for p in files:
        data = json.loads(p.read_text(encoding="utf-8"))
        societe = data.get("societe") or "INCONNU"
        date_raw = data.get("date_document")
        src = data.get("source_fichier") or p.name

        def fval(k):
            v = data.get(k)
            return "NULL" if v is None else str(v)

        sql = f"""
        INSERT INTO actuariel.kpis (
            societe, date_document_raw, source_fichier, primes_emises,
            charge_sinistres, provisions_techniques, resultat_net,
            total_bilan, fonds_propres, ratio_sp, updated_at
        ) VALUES (
            {sql_literal(societe)}, {sql_literal(date_raw)}, {sql_literal(src)}, {fval('primes_emises')},
            {fval('charge_sinistres')}, {fval('provisions_techniques')}, {fval('resultat_net')},
            {fval('total_bilan')}, {fval('fonds_propres')}, {fval('ratio_sp')}, NOW()
        ) ON CONFLICT (societe, date_document_raw, source_fichier)
        DO UPDATE SET
            date_document = EXCLUDED.date_document,
            primes_emises = EXCLUDED.primes_emises,
            charge_sinistres = EXCLUDED.charge_sinistres,
            provisions_techniques = EXCLUDED.provisions_techniques,
            resultat_net = EXCLUDED.resultat_net,
            total_bilan = EXCLUDED.total_bilan,
            fonds_propres = EXCLUDED.fonds_propres,
            ratio_sp = EXCLUDED.ratio_sp,
            updated_at = NOW();
        """
        run_psql(sql)
        loaded += 1
    return len(files), loaded


def jsonize_row(row: dict[str, Any]) -> str:
    clean = {k: v for k, v in row.items() if v is not None and str(v).strip() != ""}
    return json.dumps(clean, ensure_ascii=False).replace("'", "''")


def load_table_rows() -> tuple[int, int]:
    files = sorted(EXTRACTED_DIR.glob("*_tables.csv"))
    total_files = 0
    total_rows = 0
    import csv

    for p in files:
        if p.name.upper() == "ALL_SOCIETES_KPIS.CSV":
            continue
        with p.open(encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            rows = list(reader)
        
        sql_buffer = []
        for row in rows:
            societe = row.get('societe') or 'INCONNU'
            page = row.get('page') or 'NULL'
            table_num = row.get('table_num') or 'NULL'
            row_json = jsonize_row(row)
            sql = f"""
            INSERT INTO actuariel.extracted_table_rows (
                societe, date_document_raw, source_fichier, page, table_num, row_hash, row_data, updated_at
            ) VALUES (
                {sql_literal(societe)}, {sql_literal(p.stem.split('_')[-2]) if '_' in p.stem else 'NULL'}, {sql_literal(p.name)}, {page}, {table_num}, md5('{row_json}'), '{row_json}'::jsonb, NOW()
            ) ON CONFLICT (source_fichier, page, table_num, row_hash)
            DO UPDATE SET row_data = EXCLUDED.row_data, updated_at = NOW();
            """
            sql_buffer.append(sql)
            total_rows += 1
            if len(sql_buffer) >= 200:
                run_psql("\n".join(sql_buffer))
                sql_buffer = []
        if sql_buffer:
            run_psql("\n".join(sql_buffer))
        total_files += 1
    return total_files, total_rows


def load_statement_rows() -> tuple[int, int]:
    if not STATEMENT_ROWS_CSV.exists():
        return 0, 0

    import csv

    with STATEMENT_ROWS_CSV.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    loaded = 0
    sql_buffer = []
    for row in rows:
        row_hash_payload = json.dumps(
            {
                "metric_code": row.get("metric_code"),
                "row_label": row.get("row_label"),
                "numeric_values": row.get("numeric_values"),
                "source_text": row.get("source_text"),
            },
            ensure_ascii=False,
            sort_keys=True,
        ).replace("'", "''")
        numeric_values = row.get("numeric_values") or "[]"
        numeric_values_sql = numeric_values.replace("'", "''")
        sql = f"""
        INSERT INTO actuariel.statement_rows (
            societe, date_document, date_document_raw, source_fichier, page, table_num,
            metric_code, row_label, numeric_values, confidence, source_text, row_hash, updated_at
        ) VALUES (
            {sql_literal(row.get('societe'))}, {sql_literal(row.get('date_document'))}::date,
            {sql_literal(row.get('date_document'))}, {sql_literal(row.get('source_fichier'))},
            {sql_number(row.get('page'))}::integer, {sql_number(row.get('table_num'))}::integer,
            {sql_literal(row.get('metric_code'))}, {sql_literal(row.get('row_label'))},
            '{numeric_values_sql}'::jsonb, {sql_number(row.get('confidence'))},
            {sql_literal(row.get('source_text'))}, md5('{row_hash_payload}'), NOW()
        ) ON CONFLICT (source_fichier, page, table_num, row_hash)
        DO UPDATE SET
            metric_code = EXCLUDED.metric_code,
            row_label = EXCLUDED.row_label,
            numeric_values = EXCLUDED.numeric_values,
            confidence = EXCLUDED.confidence,
            source_text = EXCLUDED.source_text,
            updated_at = NOW();
        """
        sql_buffer.append(sql)
        loaded += 1
        if len(sql_buffer) >= 200:
            run_psql("\n".join(sql_buffer))
            sql_buffer = []
    if sql_buffer:
        run_psql("\n".join(sql_buffer))
    return 1, loaded


def main() -> None:
    apply_schema()
    kf, kr = load_canonical_kpis()
    tf, tr = load_table_rows()
    sf, sr = load_statement_rows()
    print(f"KPI files: {kf}, KPI rows: {kr}")
    print(f"Table files: {tf}, Table rows: {tr}")
    print(f"Statement files: {sf}, Statement rows: {sr}")


if __name__ == '__main__':
    main()