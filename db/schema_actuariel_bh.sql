BEGIN;

CREATE SCHEMA IF NOT EXISTS actuariel;

CREATE TABLE IF NOT EXISTS actuariel.etl_runs (
	id BIGSERIAL PRIMARY KEY,
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	finished_at TIMESTAMPTZ,
	status TEXT NOT NULL DEFAULT 'running',
	kpi_files_loaded INTEGER NOT NULL DEFAULT 0,
	table_files_loaded INTEGER NOT NULL DEFAULT 0,
	kpi_rows_loaded INTEGER NOT NULL DEFAULT 0,
	table_rows_loaded INTEGER NOT NULL DEFAULT 0,
	error_message TEXT
);

CREATE TABLE IF NOT EXISTS actuariel.kpis (
	id BIGSERIAL PRIMARY KEY,
	societe TEXT NOT NULL,
	date_document DATE,
	date_document_raw TEXT,
	source_fichier TEXT NOT NULL,
	source_type TEXT,
	confidence DOUBLE PRECISION,
	issue_count INTEGER NOT NULL DEFAULT 0,
	issues TEXT,
	primes_emises DOUBLE PRECISION,
	charge_sinistres DOUBLE PRECISION,
	provisions_techniques DOUBLE PRECISION,
	resultat_net DOUBLE PRECISION,
	total_bilan DOUBLE PRECISION,
	fonds_propres DOUBLE PRECISION,
	ratio_sp DOUBLE PRECISION,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT uq_kpis_source UNIQUE (societe, date_document_raw, source_fichier)
);

ALTER TABLE actuariel.kpis ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE actuariel.kpis ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;
ALTER TABLE actuariel.kpis ADD COLUMN IF NOT EXISTS issue_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE actuariel.kpis ADD COLUMN IF NOT EXISTS issues TEXT;

CREATE INDEX IF NOT EXISTS idx_kpis_societe_date ON actuariel.kpis (societe, date_document);

CREATE TABLE IF NOT EXISTS actuariel.extracted_table_rows (
	id BIGSERIAL PRIMARY KEY,
	societe TEXT NOT NULL,
	date_document DATE,
	date_document_raw TEXT,
	source_fichier TEXT NOT NULL,
	page INTEGER,
	table_num INTEGER,
	row_hash CHAR(32) NOT NULL,
	row_data JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT uq_table_row UNIQUE (source_fichier, page, table_num, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_rows_societe_date ON actuariel.extracted_table_rows (societe, date_document);
CREATE INDEX IF NOT EXISTS idx_rows_gin_data ON actuariel.extracted_table_rows USING GIN (row_data);

CREATE TABLE IF NOT EXISTS actuariel.statement_rows (
	id BIGSERIAL PRIMARY KEY,
	societe TEXT NOT NULL,
	date_document DATE,
	date_document_raw TEXT,
	source_fichier TEXT NOT NULL,
	page INTEGER,
	table_num INTEGER,
	metric_code TEXT,
	row_label TEXT NOT NULL,
	numeric_values JSONB NOT NULL DEFAULT '[]'::jsonb,
	confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
	source_text TEXT,
	row_hash CHAR(32) NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT uq_statement_row UNIQUE (source_fichier, page, table_num, row_hash)
);

CREATE INDEX IF NOT EXISTS idx_statement_rows_societe_date ON actuariel.statement_rows (societe, date_document);
CREATE INDEX IF NOT EXISTS idx_statement_rows_metric ON actuariel.statement_rows (metric_code);

CREATE OR REPLACE VIEW actuariel.v_latest_kpis AS
SELECT DISTINCT ON (societe)
	societe,
	date_document,
	date_document_raw,
	source_fichier,
	source_type,
	confidence,
	issue_count,
	issues,
	primes_emises,
	charge_sinistres,
	provisions_techniques,
	resultat_net,
	total_bilan,
	fonds_propres,
	ratio_sp,
	updated_at
FROM actuariel.kpis
ORDER BY societe, date_document DESC NULLS LAST, updated_at DESC;

COMMIT;
