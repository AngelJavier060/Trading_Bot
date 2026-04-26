"""
Migraciones automáticas e idempotentes.
========================================
Se ejecutan al iniciar el backend (`init_db`) y añaden columnas nuevas
sin tocar las existentes. Son seguras de correr varias veces.

Soporta los tres dialectos del proyecto: PostgreSQL, MySQL/MariaDB y SQLite.
"""

from __future__ import annotations

import logging
from typing import Iterable, Tuple

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


# (tabla, columna, tipo_postgres, tipo_mysql, tipo_sqlite, valor_por_defecto_sql)
# Los tipos se eligen de modo que sean compatibles con el modelo SQLAlchemy.
_NEW_COLUMNS: Iterable[Tuple[str, str, str, str, str, str]] = (
    # robot_configs
    ("robot_configs", "ml_weight",            "DOUBLE PRECISION",  "DOUBLE",       "REAL",     "0.20"),
    ("robot_configs", "extra_config",         "JSONB",             "JSON",         "TEXT",     "NULL"),
    # strategies
    ("strategies",    "allowed_market_type",  "VARCHAR(8)",        "VARCHAR(8)",   "TEXT",     "'both'"),
    ("strategies",    "recommended_timeframe","VARCHAR(8)",        "VARCHAR(8)",   "TEXT",     "NULL"),
)


def _existing_columns(engine: Engine, table: str) -> set[str]:
    """Devuelve el conjunto de columnas existentes (lower-case) o vacío si la tabla aún no existe."""
    try:
        insp = inspect(engine)
        if not insp.has_table(table):
            return set()
        return {c["name"].lower() for c in insp.get_columns(table)}
    except Exception as exc:
        logger.warning("No se pudo inspeccionar %s: %s", table, exc)
        return set()


def _dialect_name(engine: Engine) -> str:
    name = (engine.dialect.name or "").lower()
    if name.startswith("postgres"):
        return "postgres"
    if name.startswith("mysql") or name.startswith("mariadb"):
        return "mysql"
    return "sqlite"


def _column_type(dialect: str, pg_type: str, my_type: str, sqlite_type: str) -> str:
    if dialect == "postgres":
        return pg_type
    if dialect == "mysql":
        return my_type
    return sqlite_type


def run_migrations(engine: Engine) -> None:
    """Aplica las migraciones idempotentes para columnas nuevas."""
    if engine is None:
        return

    dialect = _dialect_name(engine)
    logger.info("Aplicando migraciones (dialect=%s)", dialect)

    for table, col, pg_t, my_t, sl_t, default_sql in _NEW_COLUMNS:
        existing = _existing_columns(engine, table)
        if not existing:
            # tabla aún no creada → el create_all se encarga
            continue
        if col.lower() in existing:
            continue

        col_type = _column_type(dialect, pg_t, my_t, sl_t)
        default_clause = "" if default_sql.strip().upper() == "NULL" else f" DEFAULT {default_sql}"
        ddl = f"ALTER TABLE {table} ADD COLUMN {col} {col_type}{default_clause}"

        try:
            with engine.begin() as conn:
                conn.execute(text(ddl))
            logger.info("  ✓ %s.%s añadido", table, col)
        except Exception as exc:
            # Si el dialecto no soporta IF NOT EXISTS y la columna ya existe en una carrera previa,
            # ignoramos. De lo contrario, registramos pero seguimos con el resto.
            logger.warning("  ✗ Falló agregar %s.%s: %s", table, col, exc)

    # Ajustes por defecto recomendados (no pisar valores ya existentes manualmente):
    # - Ichimoku → solo mercado real, desactivada por defecto
    try:
        with engine.begin() as conn:
            insp = inspect(engine)
            if insp.has_table("strategies"):
                cols = {c["name"].lower() for c in insp.get_columns("strategies")}
                if "allowed_market_type" in cols:
                    conn.execute(text(
                        "UPDATE strategies SET allowed_market_type = 'real' "
                        "WHERE LOWER(name) LIKE '%ichimoku%' "
                        "AND (allowed_market_type IS NULL OR allowed_market_type = 'both')"
                    ))
                if "recommended_timeframe" in cols:
                    conn.execute(text(
                        "UPDATE strategies SET recommended_timeframe = '5m' "
                        "WHERE recommended_timeframe IS NULL AND LOWER(name) IN ('ema_rsi','macd','bollinger')"
                    ))
                    conn.execute(text(
                        "UPDATE strategies SET recommended_timeframe = '15m' "
                        "WHERE recommended_timeframe IS NULL AND LOWER(name) IN ('rsi_divergence','ichimoku')"
                    ))
    except Exception as exc:
        logger.warning("No se pudieron aplicar valores por defecto post-migración: %s", exc)

    logger.info("Migraciones aplicadas")
