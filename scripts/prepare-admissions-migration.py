"""Compose the initial, unreleased D1 migration from the application's schema sources.

After first deployment create a new numbered migration for schema changes.
"""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
source_files = ("schema.sql", "growth.sql", "operations.sql")
statements = []
for source in source_files:
    pending = ""
    for line in (root / source).read_text().splitlines():
        if line.strip().upper().startswith("PRAGMA "):
            continue
        pending += line + "\n"
        if sqlite3.complete_statement(pending):
            statements.append(pending.strip())
            pending = ""
    if pending.strip():
        raise ValueError(f"Incomplete schema in {source}")
out = root / "drizzle/0000_plataforma_admisiones.sql"
out.write_text("\n--> statement-breakpoint\n".join(statements) + "\n")
