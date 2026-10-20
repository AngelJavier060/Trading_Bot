"""La base de datos funciona igual en SQLite (tests rápidos) y en PostgreSQL (uso real).

Los casos con PostgreSQL se ejecutan si TEST_DATABASE_URL está en .env (base dedicada a tests:
se vacía en cada ejecución).
"""

import os
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy import text

from tradebot.auth import Auth, AuthError
from tradebot.storage import Store, metadata

ENV = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
PG_URL = os.environ.get("TEST_DATABASE_URL") or ENV.get("TEST_DATABASE_URL")

BACKENDS = [pytest.param(None, id="sqlite")]
if PG_URL:
    BACKENDS.append(pytest.param(PG_URL, id="postgresql"))


@pytest.fixture(params=BACKENDS)
def store(request):
    s = Store(request.param)
    if s.dialect == "postgresql":
        with s.engine.begin() as c:   # base de tests: empezar vacía
            for t in reversed(metadata.sorted_tables):
                c.execute(text(f"TRUNCATE TABLE {t.name} RESTART IDENTITY CASCADE"))
    yield s
    s.close()


def test_kv_upsert(store):
    assert store.get("x", "def") == "def"
    store.set("x", {"a": 1})
    store.set("x", {"a": 2})
    assert store.get("x") == {"a": 2}


def test_signals_and_events(store):
    i1 = store.add_signal(bar_time="2026-01-01T00:00:00+00:00", symbol="EURUSD-T", side="buy", decision="dry_run",
                          confidence=60, account=1)
    i2 = store.add_signal(bar_time="2026-01-01T00:15:00+00:00", symbol="EURUSD-T", side="sell", decision="blocked",
                          account=2)
    assert i2 > i1
    assert [s["id"] for s in store.signals()] == [i2, i1]
    assert [s["id"] for s in store.signals(account=1)] == [i1]
    assert [s["id"] for s in store.signals(after_id=i1)] == [i2]
    e = store.log_event("prueba", detalle="ñandú")
    got = store.events(limit=5)[0]
    assert got["event"] == "prueba" and got["detalle"] == "ñandú" and got["ts"] == e["ts"]


def test_trades_lifecycle_and_stats(store):
    store.open_trade(ticket=10, symbol="EURUSD-T", side="buy", volume=0.1, open_time="2026-01-01T00:00:00",
                     risk_money=50.0, account=7)
    store.open_trade(ticket=10, symbol="EURUSD-T", side="buy", volume=0.1, open_time="2026-01-01T00:00:00")  # duplicado
    store.open_trade(ticket=11, symbol="GOLD-T", side="sell", volume=0.2, open_time="2026-01-02T00:00:00",
                     risk_money=40.0, account=7)
    assert len(store.open_trades(account=7)) == 2
    store.close_trade(10, "2026-01-01T05:00:00", 1.1, 100.0, "tp", "win")
    store.close_trade(11, "2026-01-02T05:00:00", 2400.0, -40.0, "sl", "loss")
    st = store.trade_stats(account=7)
    assert st["trades"] == 2 and st["net_profit"] == 60.0 and st["profit_factor"] == 2.5
    assert st["avg_r"] == pytest.approx((2.0 - 1.0) / 2)
    assert store.open_trades() == []
    assert store.trade_stats(since="2026-01-02")["trades"] == 1


def test_equity_and_experiments(store):
    store.add_equity(10_000, 10_050, 1, account=3)
    assert store.equity_curve(days=1, account=3)[0]["equity"] == 10_050
    eid = store.add_experiment("wf", "walkforward_fixed", {"a": 1}, {"candidate": {"profit_factor": 1.2}},
                               verdict={"passed": True})
    store.set_experiment_status(eid, "promoted")
    exp = store.experiment(eid)
    assert exp["status"] == "promoted" and exp["metrics"]["candidate"]["profit_factor"] == 1.2
    assert exp["verdict"]["passed"] is True
    assert store.experiments(kind="walkforward_fixed")[0]["id"] == eid


def test_users_and_auth(store):
    auth = Auth(store, "clave-de-firma")
    assert auth.needs_setup()
    user = auth.create_user("Javier", "una-clave-larga")
    assert store.count_users() == 1 and user["username"] == "javier"
    with pytest.raises(AuthError):
        auth.create_user("javier", "otra-clave-larga")
    token, _ = auth.login("JAVIER", "una-clave-larga")
    assert auth.verify(token)["username"] == "javier"
    assert auth.verify(token + "x") is None
    assert "password_hash" not in store.list_users()[0]
