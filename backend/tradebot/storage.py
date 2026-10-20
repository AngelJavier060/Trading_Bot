"""Base de datos del sistema (SQLAlchemy): PostgreSQL en uso normal, SQLite en tests.

Tablas: usuarios, clave/valor (configuración y estado), eventos, señales,
operaciones, equity y experimentos. Las fechas se guardan como texto ISO 8601
en UTC, que se ordena y compara igual en PostgreSQL y en SQLite.

DATABASE_URL, por ejemplo:
    postgresql+psycopg://postgres:CLAVE@127.0.0.1:5434/tradebot
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Union

from sqlalchemy import (BigInteger, Column, Float, Index, Integer, MetaData, String, Table, Text, create_engine,
                        func, inspect, select, text)
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

metadata = MetaData()

users = Table(
    "users", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String(80), nullable=False, unique=True),
    Column("password_hash", Text, nullable=False),
    Column("role", String(20), nullable=False, default="admin"),
    Column("created", Text, nullable=False),
    Column("last_login", Text),
)
kv = Table(
    "kv", metadata,
    Column("key", String(120), primary_key=True),
    Column("value", Text, nullable=False),
    Column("updated", Text, nullable=False),
)
events = Table(
    "events", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ts", Text, nullable=False),
    Column("event", String(60), nullable=False),
    Column("data", Text, nullable=False),
    Index("ix_events_event", "event", "id"),
)
signals = Table(
    "signals", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ts", Text, nullable=False),
    Column("bar_time", Text, nullable=False),
    Column("symbol", String(40), nullable=False),
    Column("side", String(8), nullable=False),
    Column("confidence", Float),
    Column("strategy", String(60)),
    Column("decision", String(20), nullable=False),   # opened | dry_run | blocked | rejected | ml_filtered
    Column("reason", Text),
    Column("entry", Float), Column("sl", Float), Column("tp", Float), Column("volume", Float),
    Column("ml_prob", Float),
    Column("ticket", BigInteger),
    Column("account", BigInteger),
    Index("ix_signals_ts", "ts"),
    Index("ix_signals_account", "account", "id"),
)
trades = Table(
    "trades", metadata,
    Column("ticket", BigInteger, primary_key=True, autoincrement=False),
    Column("symbol", String(40), nullable=False),
    Column("side", String(8), nullable=False),
    Column("volume", Float, nullable=False),
    Column("strategy", String(60)),
    Column("bar_time", Text),
    Column("open_time", Text, nullable=False),
    Column("open_price", Float),
    Column("sl", Float), Column("tp", Float),
    Column("risk_money", Float),
    Column("ml_prob", Float),
    Column("close_time", Text),
    Column("close_price", Float),
    Column("net_profit", Float),
    Column("reason", String(30)),
    Column("result", String(12)),
    Column("r_multiple", Float),
    Column("account", BigInteger),
    Index("ix_trades_open", "open_time"),
    Index("ix_trades_account", "account", "open_time"),
)
equity = Table(
    "equity", metadata,
    Column("ts", Text, primary_key=True),
    Column("balance", Float, nullable=False),
    Column("equity", Float, nullable=False),
    Column("open_positions", Integer, nullable=False),
    Column("account", BigInteger),
)
experiments = Table(
    "experiments", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("created", Text, nullable=False),
    Column("name", Text, nullable=False),
    Column("kind", String(40), nullable=False),        # walkforward_* | mt5_tester_compare | live_vs_backtest | ml_model
    Column("status", String(20), nullable=False, default="candidate"),   # candidate | promoted | rejected | info
    Column("config", Text, nullable=False),
    Column("period_start", Text), Column("period_end", Text),
    Column("metrics", Text, nullable=False),
    Column("baseline_id", Integer),
    Column("verdict", Text),
    Column("code_version", String(60)),
    Column("artifacts", Text),
    Column("notes", Text),
)

# Columnas añadidas después de la primera versión (bases creadas antes)
_ADDED_COLUMNS = {"signals": ["account"], "trades": ["account"], "equity": ["account"]}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dumps(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


def make_engine(target: Union[None, str, Path]) -> Engine:
    """None = SQLite en memoria (tests) · Path = archivo SQLite · str = URL de SQLAlchemy."""
    if target is None:
        return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    if isinstance(target, Path) or "://" not in str(target):
        path = Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False, "timeout": 30})
    try:
        return create_engine(str(target), pool_pre_ping=True, pool_size=5, max_overflow=5, future=True)
    except ModuleNotFoundError as exc:
        missing = exc.name or "el driver de PostgreSQL"
        raise ModuleNotFoundError(
            f"Falta {missing}. Usa backend\\.venv\\Scripts\\python run.py "
            f"(o: pip install \"psycopg[binary]\"). "
            f"Si no quieres PostgreSQL, deja DATABASE_URL vacío en .env para usar SQLite."
        ) from exc


class Store:
    def __init__(self, target: Union[None, str, Path] = None):
        self.engine = make_engine(target)
        self.dialect = self.engine.dialect.name
        self._lock = threading.RLock()   # SQLite no admite escrituras concurrentes
        if self.dialect == "sqlite" and target is not None:
            with self.engine.begin() as conn:
                conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        metadata.create_all(self.engine)
        self._migrate()

    @property
    def url(self) -> str:
        return self.engine.url.render_as_string(hide_password=True)

    def _migrate(self) -> None:
        insp = inspect(self.engine)
        with self.engine.begin() as conn:
            for table, cols in _ADDED_COLUMNS.items():
                existing = {c["name"] for c in insp.get_columns(table)}
                for col in cols:
                    if col not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} BIGINT"))

    def close(self) -> None:
        self.engine.dispose()

    # ── utilidades ──────────────────────────────────────────────────────

    def _insert(self, table: Table):
        return (postgresql.insert(table) if self.dialect == "postgresql" else sqlite.insert(table))

    def _write(self, stmt, params: Optional[dict] = None):
        with self._lock, self.engine.begin() as conn:
            return conn.execute(stmt, params or {})

    def _read(self, stmt) -> list[dict]:
        with self.engine.connect() as conn:
            return [dict(r._mapping) for r in conn.execute(stmt)]

    def _exec(self, sql: str, params: Iterable = ()) -> None:
        """SQL crudo (mantenimiento y tests)."""
        with self._lock, self.engine.begin() as conn:
            conn.exec_driver_sql(sql, tuple(params))

    # ── usuarios ────────────────────────────────────────────────────────

    def add_user(self, username: str, password_hash: str, role: str = "admin") -> int:
        res = self._write(users.insert().values(username=username.strip().lower(), password_hash=password_hash,
                                                role=role, created=_now()))
        return int(res.inserted_primary_key[0])

    def get_user(self, username: str) -> Optional[dict]:
        rows = self._read(select(users).where(users.c.username == username.strip().lower()))
        return rows[0] if rows else None

    def get_user_by_id(self, user_id: int) -> Optional[dict]:
        rows = self._read(select(users).where(users.c.id == user_id))
        return rows[0] if rows else None

    def list_users(self) -> list[dict]:
        return [{k: v for k, v in u.items() if k != "password_hash"} for u in self._read(select(users).order_by(users.c.id))]

    def count_users(self) -> int:
        return int(self._read(select(func.count().label("n")).select_from(users))[0]["n"])

    def set_password(self, user_id: int, password_hash: str) -> None:
        self._write(users.update().where(users.c.id == user_id).values(password_hash=password_hash))

    def touch_login(self, user_id: int) -> None:
        self._write(users.update().where(users.c.id == user_id).values(last_login=_now()))

    def delete_user(self, user_id: int) -> None:
        self._write(users.delete().where(users.c.id == user_id))

    # ── clave/valor (configuración del bot, estado del día, cuentas) ────

    def get(self, key: str, default: Any = None) -> Any:
        rows = self._read(select(kv.c.value).where(kv.c.key == key))
        return json.loads(rows[0]["value"]) if rows else default

    def set(self, key: str, value: Any) -> None:
        stmt = self._insert(kv).values(key=key, value=_dumps(value), updated=_now())
        stmt = stmt.on_conflict_do_update(index_elements=[kv.c.key],
                                          set_={"value": stmt.excluded.value, "updated": stmt.excluded.updated})
        self._write(stmt)

    # ── eventos ─────────────────────────────────────────────────────────

    def log_event(self, event: str, **data) -> dict:
        ts = _now()
        self._write(events.insert().values(ts=ts, event=event, data=_dumps(data)))
        return {"ts": ts, "event": event, **data}

    def events(self, limit: int = 100, event: Optional[str] = None, after_id: Optional[int] = None) -> list[dict]:
        stmt = select(events)
        if event:
            stmt = stmt.where(events.c.event == event)
        if after_id is not None:
            stmt = stmt.where(events.c.id > after_id)
        rows = self._read(stmt.order_by(events.c.id.desc()).limit(limit))
        return [{"id": r["id"], "ts": r["ts"], "event": r["event"], **json.loads(r["data"])} for r in rows]

    # ── señales ─────────────────────────────────────────────────────────

    _SIGNAL_COLS = ["bar_time", "symbol", "side", "confidence", "strategy", "decision", "reason",
                    "entry", "sl", "tp", "volume", "ml_prob", "ticket", "account"]

    def add_signal(self, **s) -> int:
        res = self._write(signals.insert().values(ts=_now(), **{c: s.get(c) for c in self._SIGNAL_COLS}))
        return int(res.inserted_primary_key[0])

    def signals(self, limit: int = 100, since: Optional[str] = None, symbol: Optional[str] = None,
                account: Optional[int] = None, after_id: Optional[int] = None) -> list[dict]:
        stmt = select(signals)
        if account is not None:
            stmt = stmt.where(signals.c.account == account)
        if since:
            stmt = stmt.where(signals.c.ts > since)
        if symbol:
            stmt = stmt.where(signals.c.symbol == symbol)
        if after_id is not None:
            stmt = stmt.where(signals.c.id > after_id)
        return self._read(stmt.order_by(signals.c.id.desc()).limit(limit))

    # ── operaciones ─────────────────────────────────────────────────────

    _TRADE_OPEN_COLS = ["ticket", "symbol", "side", "volume", "strategy", "bar_time", "open_time", "open_price",
                        "sl", "tp", "risk_money", "ml_prob", "account"]

    def open_trade(self, **t) -> None:
        stmt = self._insert(trades).values(**{c: t.get(c) for c in self._TRADE_OPEN_COLS})
        self._write(stmt.on_conflict_do_nothing(index_elements=[trades.c.ticket]))

    def close_trade(self, ticket: int, close_time: str, close_price: float, net_profit: float,
                    reason: str, result: str) -> None:
        rows = self._read(select(trades.c.risk_money).where(trades.c.ticket == ticket))
        risk = rows[0]["risk_money"] if rows else None
        r_mult = round(net_profit / risk, 3) if risk else None
        self._write(trades.update().where(trades.c.ticket == ticket).values(
            close_time=close_time, close_price=close_price, net_profit=net_profit, reason=reason,
            result=result, r_multiple=r_mult))

    def open_trades(self, account: Optional[int] = None) -> list[dict]:
        stmt = select(trades).where(trades.c.close_time.is_(None))
        if account is not None:
            stmt = stmt.where(trades.c.account == account)
        return self._read(stmt.order_by(trades.c.open_time))

    def trades(self, limit: int = 200, closed_only: bool = False, since: Optional[str] = None,
               account: Optional[int] = None) -> list[dict]:
        stmt = select(trades)
        if account is not None:
            stmt = stmt.where(trades.c.account == account)
        if closed_only:
            stmt = stmt.where(trades.c.close_time.is_not(None))
        if since:
            stmt = stmt.where(trades.c.open_time >= since)
        return self._read(stmt.order_by(trades.c.open_time.desc()).limit(limit))

    def trade_stats(self, since: Optional[str] = None, account: Optional[int] = None) -> dict:
        stmt = select(trades.c.net_profit, trades.c.r_multiple).where(trades.c.close_time.is_not(None))
        if since:
            stmt = stmt.where(trades.c.close_time >= since)
        if account is not None:
            stmt = stmt.where(trades.c.account == account)
        rows = self._read(stmt)
        nets = [r["net_profit"] or 0.0 for r in rows]
        rs = [r["r_multiple"] for r in rows if r["r_multiple"] is not None]
        wins = [x for x in nets if x > 0]
        gl = -sum(x for x in nets if x < 0)
        gp = sum(wins)
        n = len(nets)
        return {
            "trades": n,
            "wins": len(wins),
            "losses": sum(1 for x in nets if x < 0),
            "win_rate": round(len(wins) / n * 100, 2) if n else 0.0,
            "net_profit": round(sum(nets), 2),
            "profit_factor": round(gp / gl, 2) if gl else (999.99 if gp else 0.0),
            "avg_r": round(sum(rs) / len(rs), 3) if rs else 0.0,
        }

    # ── equity ──────────────────────────────────────────────────────────

    def add_equity(self, balance: float, equity_value: float, open_positions: int, account: Optional[int] = None) -> None:
        stmt = self._insert(equity).values(ts=_now(), balance=balance, equity=equity_value,
                                           open_positions=open_positions, account=account)
        self._write(stmt.on_conflict_do_nothing(index_elements=[equity.c.ts]))

    def equity_curve(self, days: int = 30, max_points: int = 2000, account: Optional[int] = None) -> list[dict]:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        stmt = select(equity).where(equity.c.ts >= since)
        if account is not None:
            stmt = stmt.where(equity.c.account == account)
        rows = self._read(stmt.order_by(equity.c.ts))
        step = max(1, len(rows) // max_points)
        return rows[::step]

    # ── experimentos ────────────────────────────────────────────────────

    def add_experiment(self, name: str, kind: str, config: dict, metrics: dict, *, status: str = "candidate",
                       period_start: Optional[str] = None, period_end: Optional[str] = None,
                       baseline_id: Optional[int] = None, verdict: Optional[dict] = None,
                       code_version: Optional[str] = None, artifacts: Optional[dict] = None,
                       notes: str = "") -> int:
        res = self._write(experiments.insert().values(
            created=_now(), name=name, kind=kind, status=status, config=_dumps(config),
            period_start=period_start, period_end=period_end, metrics=_dumps(metrics), baseline_id=baseline_id,
            verdict=_dumps(verdict) if verdict is not None else None, code_version=code_version,
            artifacts=_dumps(artifacts or {}), notes=notes))
        return int(res.inserted_primary_key[0])

    def set_experiment_status(self, exp_id: int, status: str, verdict: Optional[dict] = None) -> None:
        values = {"status": status}
        if verdict is not None:
            values["verdict"] = _dumps(verdict)
        self._write(experiments.update().where(experiments.c.id == exp_id).values(**values))

    def experiment(self, exp_id: int) -> Optional[dict]:
        rows = self._read(select(experiments).where(experiments.c.id == exp_id))
        return _decode_experiment(rows[0]) if rows else None

    def experiments(self, limit: int = 100, kind: Optional[str] = None, status: Optional[str] = None) -> list[dict]:
        stmt = select(experiments)
        if kind:
            stmt = stmt.where(experiments.c.kind == kind)
        if status:
            stmt = stmt.where(experiments.c.status == status)
        return [_decode_experiment(r) for r in self._read(stmt.order_by(experiments.c.id.desc()).limit(limit))]


def _decode_experiment(r: dict) -> dict:
    for k in ("config", "metrics", "verdict", "artifacts"):
        if r.get(k):
            r[k] = json.loads(r[k])
    return r
