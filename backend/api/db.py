from __future__ import annotations

import csv
import os
import subprocess
from io import StringIO
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parents[2]


def _psql_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PGHOST", "localhost")
    env.setdefault("PGPORT", "5432")
    env.setdefault("PGDATABASE", "copilot_actuariel")
    env.setdefault("PGUSER", "postgres")
    return env


def query_csv(sql: str) -> list[dict[str, str]]:
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
        "-v",
        "ON_ERROR_STOP=1",
        "-P",
        "format=csv",
        "-P",
        "border=0",
        "-P",
        "pager=off",
        "-c",
        f"COPY ({sql}) TO STDOUT WITH CSV HEADER",
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=_psql_env(),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())

    reader = csv.DictReader(StringIO(result.stdout))
    return list(reader)


def query_scalar(sql: str) -> str:
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
        "-t",
        "-A",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=_psql_env(),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()
