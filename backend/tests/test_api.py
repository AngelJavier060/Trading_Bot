import time

import pytest

from tradebot.api import create_app


@pytest.fixture
def client(system):
    from conftest import authed_client
    return authed_client(system)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json["status"] == "ok" and r.json["mt5_connected"]


def test_health_is_503_when_bot_frozen(client, system):
    client.post("/api/bot/start", json={"symbols": ["EURUSD"], "params": {"strategy": "macd"}, "poll_seconds": 0.05})
    time.sleep(0.2)
    system.bot._last_cycle = time.time() - 10_000
    assert client.get("/api/health").status_code == 503


def test_root_points_to_frontend(client):
    r = client.get("/")
    assert r.status_code == 200 and "frontend" in r.json["panel"].lower()


def test_mt5_status(client):
    data = client.get("/api/mt5/status").json
    assert data["connected"] is True and data["account"]["is_demo"] is True


def test_symbol_resolution(client):
    data = client.get("/api/mt5/symbol/EURUSD").json
    assert data["spec"]["name"] == "EURUSD-T" and data["tick"]["ask"] > data["tick"]["bid"]


def test_unknown_symbol_is_503(client):
    r = client.get("/api/mt5/symbol/NOEXISTE")
    assert r.status_code == 503 and "no existe" in r.json["error"]


def test_candles(client):
    data = client.get("/api/mt5/candles?symbol=EURUSD&timeframe=M15&count=50").json
    assert len(data["candles"]) == 50 and {"open", "high", "low", "close", "time"} <= set(data["candles"][0])


def test_strategies(client):
    ids = {s["id"] for s in client.get("/api/strategies").json["strategies"]}
    assert {"ema_rsi", "macd", "bollinger"} <= ids


def test_backtest_endpoint(client):
    r = client.post("/api/backtest", json={"symbol": "EURUSD", "timeframe": "M15", "strategy": "macd",
                                           "date_from": "2023-11-14", "date_to": "2023-12-31"})
    assert r.status_code == 200, r.json
    assert "profit_factor" in r.json["results"][0]["metrics"]


def test_invalid_timeframe_is_400(client):
    r = client.post("/api/backtest", json={"symbol": "EURUSD", "timeframe": "M7", "strategy": "macd"})
    assert r.status_code == 400


def test_unknown_param_is_400(client):
    r = client.post("/api/bot/start", json={"symbols": ["EURUSD"], "params": {"strategy": "macd", "nope": 1}})
    assert r.status_code == 400


def test_bot_lifecycle_and_history_endpoints(client):
    r = client.post("/api/bot/start", json={"symbols": ["EURUSD"], "params": {"strategy": "macd"},
                                           "dry_run": True, "poll_seconds": 0.05})
    assert r.status_code == 200 and r.json["running"] is True
    assert client.post("/api/bot/start", json={}).status_code == 409
    time.sleep(0.3)
    assert client.get("/api/bot/config").json["autostart"] is True
    assert client.post("/api/bot/stop").json["running"] is False
    assert client.get("/api/bot/config").json["autostart"] is False
    # reanudar con la configuración guardada (cuerpo vacío)
    assert client.post("/api/bot/start").json["running"] is True
    client.post("/api/bot/stop")
    for path in ("/api/signals", "/api/trades", "/api/stats", "/api/equity", "/api/events", "/api/experiments",
                 "/api/models", "/api/jobs"):
        assert client.get(path).status_code == 200, path


def test_bridge_text_endpoints(client):
    status = client.get("/api/bridge/status.txt")
    assert status.status_code == 200 and "running=0" in status.get_data(as_text=True)
    assert client.get("/api/bridge/signals.txt?symbol=EURUSD-T").status_code == 200


def test_walkforward_job(client):
    r = client.post("/api/jobs/walkforward", json={"symbol": "EURUSD", "timeframe": "M15", "strategy": "macd",
                                                   "date_from": "2023-11-14", "date_to": "2023-11-29",
                                                   "train_days": 5, "test_days": 5, "min_trades": 1})
    assert r.status_code == 202
    job_id = r.json["id"]
    for _ in range(200):
        job = client.get(f"/api/jobs/{job_id}").json
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert job["status"] == "done", job.get("error")
    exp = client.get(f"/api/experiments/{job['result']['experiment_id']}").json
    assert exp["kind"] == "walkforward_fixed" and "candidate" in exp["metrics"]
    r = client.post(f"/api/experiments/{exp['id']}/status", json={"status": "promoted"})
    assert r.json["status"] == "promoted"


def test_auth_flow(system):
    c = create_app(system).test_client()
    assert c.get("/api/auth/status").json["needs_setup"] is True
    assert c.get("/api/mt5/status").status_code == 401                       # sin sesión
    bad = c.post("/api/auth/setup", json={"username": "ab", "password": "corta"})
    assert bad.status_code == 400
    r = c.post("/api/auth/setup", json={"username": "Javier", "password": "una-clave-larga"})
    assert r.status_code == 200 and r.json["user"]["role"] == "admin"
    assert c.post("/api/auth/setup", json={"username": "otro", "password": "una-clave-larga"}).status_code == 409
    token = r.json["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert c.get("/api/mt5/status", headers=h).status_code == 200
    assert c.get("/api/auth/me", headers=h).json["user"]["username"] == "javier"
    assert c.post("/api/auth/login", json={"username": "javier", "password": "mala"}).status_code == 400
    # cambiar la contraseña invalida el token anterior
    assert c.post("/api/auth/password", headers=h, json={"current": "una-clave-larga", "new": "otra-clave-larga"}).status_code == 200
    assert c.get("/api/mt5/status", headers=h).status_code == 401
    assert c.post("/api/auth/login", json={"username": "javier", "password": "otra-clave-larga"}).status_code == 200


def test_login_lockout(system):
    c = create_app(system).test_client()
    c.post("/api/auth/setup", json={"username": "admin", "password": "clave-segura-1"})
    for _ in range(5):
        c.post("/api/auth/login", json={"username": "admin", "password": "x"})
    r = c.post("/api/auth/login", json={"username": "admin", "password": "clave-segura-1"})
    assert r.status_code == 400 and "Demasiados intentos" in r.json["error"]


def test_service_token_for_ea_and_watchdog(system):
    system.settings.api_token = "token-servicio"
    c = create_app(system).test_client()
    assert c.get("/api/bridge/status.txt").status_code == 401
    assert c.get("/api/bridge/status.txt", headers={"X-API-Token": "token-servicio"}).status_code == 200
    assert c.get("/api/health").status_code == 200


def test_cors_only_for_frontend_origin(client):
    ok = client.options("/api/mt5/status", headers={"Origin": "http://localhost:3000",
                                                    "Access-Control-Request-Method": "GET"})
    assert ok.status_code == 204 and ok.headers["Access-Control-Allow-Origin"] == "http://localhost:3000"
    other = client.get("/api/health", headers={"Origin": "https://malicioso.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


def test_users_admin(client):
    r = client.post("/api/users", json={"username": "lector", "password": "clave-lector-1", "role": "viewer"})
    assert r.status_code == 200
    users = client.get("/api/users").json["users"]
    assert {u["username"] for u in users} == {"admin", "lector"} and all("password_hash" not in u for u in users)


def test_stream_sends_status(client):
    resp = client.get("/api/stream?interval=1", buffered=False)
    assert resp.status_code == 200 and resp.mimetype == "text/event-stream"
    chunks = []
    for chunk in resp.response:
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
        if any("event: status" in c for c in chunks):
            break
    resp.close()
    assert any("event: status" in c for c in chunks)


def test_strategy_catalog_and_defaults(client):
    data = client.get("/api/strategies").json["strategies"]
    macd = next(s for s in data if s["id"] == "macd")
    assert macd["catalog"]["nombre"] == "MACD" and "fast_period" in macd["catalog"]["params"]
    assert set(macd["catalog"]["params"]) == set(macd["params"])      # todos los parámetros tienen explicación
    for s in data:
        assert set(s["catalog"]["params"]) == set(s["params"]), s["id"]
    d = client.get("/api/defaults").json
    assert d["params"]["sl_atr_mult"] == 1.5 and d["limits"]["risk_per_trade_pct"] == 0.5


def test_save_config_without_starting(client):
    cfg = {"symbols": ["EURUSD"], "params": {"strategy": "bollinger", "timeframe": "H1",
                                             "strategy_params": {"period": 30}}, "dry_run": True}
    r = client.post("/api/bot/config", json=cfg)
    assert r.status_code == 200 and r.json["config"]["params"]["strategy_params"]["period"] == 30
    assert client.get("/api/bot/status").json["running"] is False
    assert client.get("/api/bot/config").json["config"]["params"]["strategy"] == "bollinger"
    bad = client.post("/api/bot/config", json={"symbols": ["NOEXISTE"], "params": {"strategy": "macd"}})
    assert bad.status_code == 503


def test_backtest_job_compare_all(client):
    r = client.post("/api/jobs/backtest", json={"symbol": "EURUSD", "timeframe": "M15", "strategy": "all",
                                                "date_from": "2023-11-14", "date_to": "2023-11-25",
                                                "params": {"sl_atr_mult": 2.0}, "include_trades": False})
    assert r.status_code == 202
    for _ in range(1200):   # hasta 2 min: son 7 backtests
        job = client.get(f"/api/jobs/{r.json['id']}").json
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.1)
    assert job["status"] == "done", job.get("error")
    from tradebot.strategies import AVAILABLE_STRATEGIES
    results = job["result"]["results"]
    assert len(results) == len(AVAILABLE_STRATEGIES) and all(x["config"]["params"]["sl_atr_mult"] == 2.0 for x in results)


def test_viewer_is_read_only(client, system):
    client.post("/api/users", json={"username": "lector", "password": "clave-lector-1", "role": "viewer"})
    c = create_app(system).test_client()
    token = c.post("/api/auth/login", json={"username": "lector", "password": "clave-lector-1"}).json["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert c.get("/api/bot/status", headers=h).status_code == 200
    assert c.post("/api/bot/start", headers=h, json={}).status_code == 403
    assert c.post("/api/auth/password", headers=h, json={"current": "clave-lector-1", "new": "clave-lector-2"}).status_code == 200
