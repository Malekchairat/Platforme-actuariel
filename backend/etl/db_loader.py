"""
Load extracted ETL outputs into PostgreSQL.

Usage:
  python backend/etl/db_loader.py
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg2

from data_cleaner import normalize_societe, parse_document_date, to_float


BASE = Path(__file__).parent.parent.parent
EXTRACTED_TABLES_DIR = BASE / "data" / "extracted" / "tables"
SCHEMA_SQL_PATH = BASE / "db" / "schema_actuariel_bh.sql"


def get_db_config() -> dict[str, Any]:
	database_url = os.getenv("DATABASE_URL")
	if database_url:
		return {"dsn": database_url}

	return {
		"host": os.getenv("PGHOST", "localhost"),
		"port": int(os.getenv("PGPORT", "5432")),
		"dbname": os.getenv("PGDATABASE", "copilot_actuariel"),
		"user": os.getenv("PGUSER", "postgres"),
		"password": os.getenv("PGPASSWORD", "postgres"),
	}


def connect_postgres():
	cfg = get_db_config()
	if "dsn" in cfg:
		return psycopg2.connect(cfg["dsn"])
	return psycopg2.connect(**cfg)


def ensure_schema(conn) -> None:
	sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")
	with conn.cursor() as cur:
		cur.execute(sql)
	conn.commit()


def start_run(conn) -> int:
	with conn.cursor() as cur:
		cur.execute("INSERT INTO actuariel.etl_runs(status) VALUES ('running') RETURNING id;")
		run_id = cur.fetchone()[0]
	conn.commit()
	return run_id


def finish_run(
	conn,
	run_id: int,
	status: str,
	kpi_files_loaded: int,
	table_files_loaded: int,
	kpi_rows_loaded: int,
	table_rows_loaded: int,
	error_message: str | None = None,
) -> None:
	with conn.cursor() as cur:
		cur.execute(
			"""
			UPDATE actuariel.etl_runs
			SET finished_at = NOW(),
				status = %s,
				kpi_files_loaded = %s,
				table_files_loaded = %s,
				kpi_rows_loaded = %s,
				table_rows_loaded = %s,
				error_message = %s
			WHERE id = %s;
			""",
			(
				status,
				kpi_files_loaded,
				table_files_loaded,
				kpi_rows_loaded,
				table_rows_loaded,
				error_message,
				run_id,
			),
		)
	conn.commit()


def iter_kpi_json_files() -> list[Path]:
	return sorted(EXTRACTED_TABLES_DIR.glob("*_kpis.json"))


def iter_table_csv_files() -> list[Path]:
	return sorted(
		p
		for p in EXTRACTED_TABLES_DIR.glob("*_tables.csv")
		if p.name.upper() != "ALL_SOCIETES_KPIS.CSV"
	)


def load_kpis(conn) -> tuple[int, int]:
	files_loaded = 0
	rows_loaded = 0

	for file_path in iter_kpi_json_files():
		payload = json.loads(file_path.read_text(encoding="utf-8"))

		societe = normalize_societe(payload.get("societe"))
		date_raw = payload.get("date_document")
		date_doc = parse_document_date(date_raw)

		with conn.cursor() as cur:
			cur.execute(
				"""
				INSERT INTO actuariel.kpis (
					societe,
					date_document,
					date_document_raw,
					source_fichier,
					primes_emises,
					charge_sinistres,
					provisions_techniques,
					resultat_net,
					total_bilan,
					fonds_propres,
					ratio_sp,
					updated_at
				) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
				ON CONFLICT (societe, date_document_raw, source_fichier)
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
				""",
				(
					societe,
					date_doc,
					date_raw,
					payload.get("source_fichier") or file_path.name,
					to_float(payload.get("primes_emises")),
					to_float(payload.get("charge_sinistres")),
					to_float(payload.get("provisions_techniques")),
					to_float(payload.get("resultat_net")),
					to_float(payload.get("total_bilan")),
					to_float(payload.get("fonds_propres")),
					to_float(payload.get("ratio_sp")),
				),
			)

		files_loaded += 1
		rows_loaded += 1

	conn.commit()
	return files_loaded, rows_loaded


def _row_hash(row_payload: dict[str, Any]) -> str:
	encoded = json.dumps(row_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
	return hashlib.md5(encoded).hexdigest()


def load_table_rows(conn) -> tuple[int, int]:
	files_loaded = 0
	rows_loaded = 0

	for file_path in iter_table_csv_files():
		df = pd.read_csv(file_path, dtype=str, keep_default_na=False)

		for row in df.to_dict(orient="records"):
			societe = normalize_societe(row.get("societe"))
			date_raw = _infer_date_from_filename(file_path.name)
			date_doc = parse_document_date(date_raw)

			page = _to_int(row.get("page"))
			table_num = _to_int(row.get("table_num"))

			row_payload = {
				k: v
				for k, v in row.items()
				if k not in {"societe", "page", "table_num"} and str(v).strip() != ""
			}
			row_hash = _row_hash(row_payload)

			with conn.cursor() as cur:
				cur.execute(
					"""
					INSERT INTO actuariel.extracted_table_rows (
						societe,
						date_document,
						date_document_raw,
						source_fichier,
						page,
						table_num,
						row_hash,
						row_data,
						updated_at
					) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
					ON CONFLICT (source_fichier, page, table_num, row_hash)
					DO UPDATE SET
						societe = EXCLUDED.societe,
						date_document = EXCLUDED.date_document,
						date_document_raw = EXCLUDED.date_document_raw,
						row_data = EXCLUDED.row_data,
						updated_at = NOW();
					""",
					(
						societe,
						date_doc,
						date_raw,
						file_path.name,
						page,
						table_num,
						row_hash,
						json.dumps(row_payload, ensure_ascii=False),
					),
				)

			rows_loaded += 1

		files_loaded += 1

	conn.commit()
	return files_loaded, rows_loaded


def _to_int(value: Any) -> int | None:
	if value is None:
		return None
	text = str(value).strip()
	if not text:
		return None
	try:
		return int(float(text))
	except ValueError:
		return None


def _infer_date_from_filename(filename: str) -> str | None:
	stem = Path(filename).stem
	tokens = stem.split("_")
	if len(tokens) < 2:
		return None
	return tokens[-2] if tokens[-1].lower() == "tables" else tokens[-1]


def main() -> None:
	if not EXTRACTED_TABLES_DIR.exists():
		raise FileNotFoundError(f"Missing folder: {EXTRACTED_TABLES_DIR}")

	conn = connect_postgres()

	run_id = 0
	kpi_files_loaded = table_files_loaded = 0
	kpi_rows_loaded = table_rows_loaded = 0

	try:
		ensure_schema(conn)
		run_id = start_run(conn)

		kpi_files_loaded, kpi_rows_loaded = load_kpis(conn)
		table_files_loaded, table_rows_loaded = load_table_rows(conn)

		finish_run(
			conn,
			run_id=run_id,
			status="success",
			kpi_files_loaded=kpi_files_loaded,
			table_files_loaded=table_files_loaded,
			kpi_rows_loaded=kpi_rows_loaded,
			table_rows_loaded=table_rows_loaded,
			error_message=None,
		)

		print("Load completed")
		print(f"- KPI files   : {kpi_files_loaded}")
		print(f"- KPI rows    : {kpi_rows_loaded}")
		print(f"- Table files : {table_files_loaded}")
		print(f"- Table rows  : {table_rows_loaded}")

	except Exception as exc:
		if run_id:
			finish_run(
				conn,
				run_id=run_id,
				status="failed",
				kpi_files_loaded=kpi_files_loaded,
				table_files_loaded=table_files_loaded,
				kpi_rows_loaded=kpi_rows_loaded,
				table_rows_loaded=table_rows_loaded,
				error_message=str(exc),
			)
		raise
	finally:
		conn.close()


if __name__ == "__main__":
	main()
