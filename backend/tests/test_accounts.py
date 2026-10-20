import sys

import pytest

from tradebot import secrets
from tradebot.accounts import AccountBook
from tradebot.api import create_app
from tradebot.broker import MT5Error
from tradebot.storage import Store


@pytest.fixture
def client(system):
    from conftest import authed_client
    return authed_client(system)


@pytest.mark.skipif(sys.platform != "win32", reason="DPAPI solo existe en Windows")
def test_dpapi_roundtrip():
    token = secrets.protect("sV4r#7qML#7Cn9")
    assert token and "sV4r" not in token
    assert secrets.unprotect(token) == "sV4r#7qML#7Cn9"
    assert secrets.unprotect("bm8gZXMgdW4gYmxvYg==") is None  # no cifrado por DPAPI


def test_account_book():
    book = AccountBook(Store(None))
    book.remember(123, "Fake-Demo", label="demo", password="pw", keep_password=True)
    book.remember(456, "Fake-Live", kind="real")
    acc = book.get(123, "Fake-Demo")
    assert acc.label == "demo" and acc.public()["has_password"] is True and "password_enc" not in acc.public()
    if secrets.AVAILABLE:
        assert book.password(acc) == "pw"
    assert book.get(456, "Fake-Live").public()["has_password"] is False
    book.set_active(456, "Fake-Live")
    assert book.active().login == 456
    book.remember(123, "Fake-Demo", keep_password=False)       # desmarcar "recordar" borra la contraseña
    assert not book.get(123, "Fake-Demo").password_enc
    assert book.delete(456, "Fake-Live") and book.active() is None


def test_login_switches_account_and_becomes_active(system, fake_mt5):
    account, warning = system.ctx.login_account(456, "pw456", "Fake-Live", kind="real", label="Real 1",
                                                remember_password=True)
    assert account.login == 456 and account.mode == "real" and warning == ""
    assert system.ctx.client.account().login == 456
    saved = system.ctx.accounts.active()
    assert saved.login == 456 and saved.kind == "real" and saved.label == "Real 1"


def test_wrong_password_gives_clear_error_and_does_not_try_other_terminals(system, fake_mt5, monkeypatch):
    monkeypatch.setattr("tradebot.broker.client.find_terminals", lambda: ["C:/otro/terminal64.exe"])
    calls_before = len(fake_mt5.init_calls)
    with pytest.raises(MT5Error, match="rechazó el inicio de sesión"):
        system.ctx.login_account(456, "mala", "Fake-Live")
    new_calls = fake_mt5.init_calls[calls_before:]
    assert not any("C:/otro/terminal64.exe" in args for args, _ in new_calls)   # no probó el otro terminal


def test_kind_mismatch_warning(system):
    _, warning = system.ctx.login_account(456, "pw456", "Fake-Live", kind="demo")
    assert "REAL" in warning


def test_reconnect_returns_to_active_account(system, fake_mt5):
    system.ctx.login_account(456, "pw456", "Fake-Live", remember_password=True)
    fake_mt5.current_login = 123            # alguien cambió el terminal a otra cuenta
    fake_mt5.shutdown()
    account = system.ctx.connect()          # reconexión automática (supervisor / bot)
    if secrets.AVAILABLE:
        assert account.login == 456
    else:
        pytest.skip("sin DPAPI no hay contraseña guardada")


def test_reconnect_without_saved_password_uses_terminal_memory(system, fake_mt5):
    system.ctx.login_account(456, "pw456", "Fake-Live", remember_password=False)
    fake_mt5.current_login = 123
    fake_mt5.remembered.add(456)            # MT5 tiene "guardar contraseña" marcado
    assert system.ctx.connect().login == 456
    fake_mt5.remembered.clear()
    fake_mt5.current_login = 123
    with pytest.raises(MT5Error):
        system.ctx.connect()


def test_api_login_flow(client, system, fake_mt5):
    r = client.post("/api/mt5/connect", json={"login": "456", "password": "pw456", "server": "Fake-Live",
                                              "kind": "real", "label": "Mi real", "remember_password": False})
    assert r.status_code == 200 and r.json["account"]["login"] == 456
    data = client.get("/api/mt5/accounts").json
    assert data["active"] == "456@Fake-Live" and data["accounts"][0]["label"] == "Mi real"
    assert all("password_enc" not in a for a in data["accounts"])
    bad = client.post("/api/mt5/connect", json={"login": 123, "password": "x", "server": "Fake-Demo"})
    assert bad.status_code == 503 and "rechazó" in bad.json["error"]
    assert client.get("/api/mt5/terminals").status_code == 200
    assert client.delete("/api/mt5/accounts/456/Fake-Live").json["deleted"] is True


def test_cannot_switch_account_while_bot_runs(client):
    client.post("/api/bot/start", json={"symbols": ["EURUSD"], "params": {"strategy": "macd"}, "poll_seconds": 0.05})
    r = client.post("/api/mt5/connect", json={"login": 456, "password": "pw456", "server": "Fake-Live"})
    assert r.status_code == 409
    client.post("/api/bot/stop")


def test_logout_stops_auto_reconnect(client, system, fake_mt5):
    assert client.post("/api/mt5/disconnect").json["connected"] is False
    system.supervisor.check_once()
    assert not system.ctx.client.is_connected()          # no se reconecta solo
    client.post("/api/mt5/connect", json={"login": 123, "password": "pw123", "server": "Fake-Demo"})
    assert system.ctx.client.is_connected() and system.store.get("mt5_logged_out") is False


def test_history_is_separated_by_account(system):
    store = system.store
    store.open_trade(ticket=1, symbol="EURUSD-T", side="buy", volume=0.1, open_time="2026-01-01", account=123)
    store.open_trade(ticket=2, symbol="EURUSD-T", side="buy", volume=0.1, open_time="2026-01-01", account=456)
    store.close_trade(1, "2026-01-02", 1.1, 50.0, "tp", "win")
    store.close_trade(2, "2026-01-02", 1.1, -20.0, "sl", "loss")
    assert store.trade_stats(account=123)["net_profit"] == 50.0
    assert store.trade_stats(account=456)["net_profit"] == -20.0
    assert store.trade_stats()["trades"] == 2
    assert [t["ticket"] for t in store.trades(account=456)] == [2]


def test_old_database_is_migrated(tmp_path):
    import sqlite3
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE trades (ticket INTEGER PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL, "
                "volume REAL NOT NULL, open_time TEXT NOT NULL)")
    con.commit()
    con.close()
    store = Store(path)
    from sqlalchemy import inspect
    cols = {c["name"] for c in inspect(store.engine).get_columns("trades")}
    assert "account" in cols


def test_same_account_is_not_reauthenticated(system, fake_mt5):
    """Una contraseña mal escrita para la cuenta ya conectada no debe romper la sesión."""
    calls = len(fake_mt5.init_calls)
    account, warning = system.ctx.login_account(123, "MAL ESCRITA", "Fake-Demo", remember_password=True)
    assert account.login == 123 and system.ctx.client.is_connected()
    assert len(fake_mt5.init_calls) == calls        # no se volvió a autenticar
    assert "no se guardó la contraseña" in warning
    assert not system.ctx.accounts.get(123, "Fake-Demo").password_enc


def test_failed_switch_restores_previous_account(system, fake_mt5):
    fake_mt5.remembered.add(123)                    # el terminal recuerda la contraseña de la cuenta actual
    with pytest.raises(MT5Error, match="Se volvió a la cuenta anterior 123"):
        system.ctx.login_account(456, "mala", "Fake-Live")
    assert system.ctx.client.is_connected() and system.ctx.client.account().login == 123


def test_failed_switch_reports_when_terminal_is_left_without_session(system, fake_mt5):
    with pytest.raises(MT5Error, match="quedó sin sesión"):
        system.ctx.login_account(456, "mala", "Fake-Live")
