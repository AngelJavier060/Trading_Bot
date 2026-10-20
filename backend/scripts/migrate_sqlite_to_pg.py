"""Copia los datos de la base SQLite (data/tradebot.db) a la base de DATABASE_URL (PostgreSQL).

    .venv\\Scripts\\python scripts\\migrate_sqlite_to_pg.py
Es idempotente: las filas que ya existen en destino no se duplican.
"""

from __future__ import annotations

import sys

from _common import utf8_console

from sqlalchemy import select, text

from tradebot.config import Settings
from tradebot.storage import Store, equity, events, experiments, kv, signals, trades, users

TABLES = [(users, "id"), (kv, "key"), (events, "id"), (signals, "id"), (trades, "ticket"), (equity, "ts"),
          (experiments, "id")]


def main() -> int:
    utf8_console()
    settings = Settings.from_env()
    if not settings.database_url.startswith("postgresql"):
        print("DATABASE_URL no apunta a PostgreSQL en .env")
        return 1
    if not settings.db_path.exists():
        print(f"No hay base SQLite en {settings.db_path}: nada que migrar")
        return 0
    src, dst = Store(settings.db_path), Store(settings.database_url)
    print(f"Origen  {src.url}\nDestino {dst.url}\n")
    for table, key in TABLES:
        with src.engine.connect() as c:
            rows = [dict(r._mapping) for r in c.execute(select(table))]
        if not rows:
            print(f"  {table.name:12} 0 filas")
            continue
        stmt = dst._insert(table).on_conflict_do_nothing(index_elements=[table.c[key]])
        with dst.engine.begin() as c:
            c.execute(stmt, rows)
            # que las claves autoincrementales sigan después de las filas copiadas
            if key == "id":
                c.execute(text(f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                               f"COALESCE((SELECT MAX(id) FROM {table.name}), 1))"))
        print(f"  {table.name:12} {len(rows)} filas copiadas")
    print("\nListo. El archivo SQLite se conserva como respaldo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
