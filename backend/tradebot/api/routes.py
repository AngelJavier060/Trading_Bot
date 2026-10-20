"""Rutas de la API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import json
import time

from flask import Blueprint, Flask, Response, current_app, g, jsonify, request, stream_with_context

from .. import __version__
from ..app import System
from ..backtest import BacktestConfig, BacktestEngine, load_history
from ..bridge import render_signals, render_status
from ..broker.market_data import frame_to_candles
from ..broker.models import MT5Error
from ..live import BotConfig
from ..planner import StrategyParams
from ..risk import RiskLimits
from ..strategies import AVAILABLE_STRATEGIES, get_strategy

bp = Blueprint("api", __name__, url_prefix="/api")


def _sys() -> System:
    return current_app.config["SYSTEM"]


def _mt5_last_error(client) -> list | None:
    """None si no hay error (MT5 usa 1 = Success)."""
    try:
        err = list(client.last_error())
    except Exception:
        return None
    if not err or err[0] in (0, 1):
        return None
    return err


def _body() -> dict:
    return request.get_json(silent=True) or {}


def _int_arg(name: str, default: int, maximum: int) -> int:
    return max(1, min(int(request.args.get(name, default)), maximum))


def _account_filter():
    """Login de la cuenta conectada (los listados muestran solo sus datos). ?all=1 = todas las cuentas."""
    if request.args.get("all") == "1":
        return None
    client = _sys().ctx.client
    if client.is_connected():
        try:
            return client.account().login
        except Exception:
            return None
    active = _sys().ctx.accounts.active() if _sys().ctx.accounts else None
    return active.login if active else None


def parse_date(value):
    """'2026-01-31' o ISO con hora. Sin zona horaria se interpreta como UTC."""
    if not value:
        return None
    d = datetime.fromisoformat(value)
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


# ── general ─────────────────────────────────────────────────────────────

@bp.get("/health")
def health():
    """Para el watchdog y monitores externos: 503 si el bot está congelado."""
    s = _sys()
    ok, reason = s.supervisor.healthy()
    body = {
        "status": "ok" if ok else "unhealthy",
        "reason": reason,
        "version": __version__,
        "mt5_connected": s.ctx.client.is_connected(),
        "bot_running": s.bot.running,
        "heartbeat_age_s": s.bot.heartbeat_age(),
    }
    return jsonify(body), (200 if ok else 503)


# ── MT5 ─────────────────────────────────────────────────────────────────

@bp.post("/mt5/connect")
def mt5_connect():
    """Iniciar sesión en una cuenta MT5 (la deja como cuenta activa del sistema).

    {login, password, server, path?, kind: demo|real, label?, remember_password?}
    Sin login: reconecta a la cuenta activa / la abierta en el terminal.
    """
    b = _body()
    system = _sys()
    if system.bot.running:
        raise RuntimeError("Detén el bot antes de cambiar de cuenta")
    ctx = system.ctx
    login = b.get("login")
    warning = ""
    if login:
        account, warning = ctx.login_account(
            int(str(login).strip()), b.get("password", ""), (b.get("server") or "").strip(),
            path=(b.get("path") or "").strip(), kind=b.get("kind", "demo"), label=b.get("label", ""),
            remember_password=bool(b.get("remember_password")),
        )
    else:
        account = ctx.connect()
    system.store.set("mt5_logged_out", False)
    system.store.log_event("mt5_login", login=account.login, server=account.server, mode=account.mode)
    return jsonify(account=account.to_dict(), terminal=ctx.client.terminal_status(), warning=warning)


@bp.get("/mt5/accounts")
def mt5_accounts():
    book = _sys().ctx.accounts
    active = book.active()
    return jsonify(accounts=[a.public() for a in book.list()], active=active.key if active else None)


@bp.delete("/mt5/accounts/<int:login>/<path:server>")
def mt5_account_delete(login: int, server: str):
    if not _sys().ctx.accounts.delete(login, server):
        raise ValueError("Cuenta no encontrada")
    return jsonify(deleted=True)


@bp.get("/mt5/terminals")
def mt5_terminals():
    from ..broker.client import find_terminals
    return jsonify(terminals=find_terminals())


@bp.post("/mt5/disconnect")
def mt5_disconnect():
    """Cerrar sesión: el sistema deja de reconectarse solo hasta que se elija otra cuenta."""
    if _sys().bot.running:
        raise RuntimeError("Detén el bot antes de desconectar")
    _sys().ctx.accounts.clear_active()
    _sys().ctx.client.disconnect()
    _sys().store.set("mt5_logged_out", True)
    return jsonify(connected=False)


@bp.get("/mt5/status")
def mt5_status():
    client = _sys().ctx.client
    err = _mt5_last_error(client)
    if not client.is_connected():
        return jsonify(connected=False, account=None, last_error=err)
    return jsonify(connected=True, account=client.account().to_dict(), terminal=client.terminal_status(), last_error=None)


@bp.get("/mt5/history-stats")
def mt5_history_stats():
    """Ganadas/perdidas del historial del terminal (history_deals_get), no del backtest."""
    ctx = _sys().ctx
    if not ctx.client.is_connected():
        return jsonify(connected=False, last_error=_mt5_last_error(ctx.client))
    days = _int_arg("days", 30, 3650)
    return jsonify(connected=True, **ctx.executor.closed_deal_stats(days))


@bp.get("/mt5/symbols")
def mt5_symbols():
    ctx = _sys().ctx
    ctx.client.ensure_connected()
    q = (request.args.get("q") or "").strip()
    raw = ctx.client.call("symbols_get", f"*{q}*") if q else ctx.client.call("symbols_get")
    items = [
        {"name": s.name, "description": s.description, "path": s.path, "spread": s.spread, "trade_mode": s.trade_mode}
        for s in (raw or [])
    ]
    return jsonify(count=len(items), symbols=items[:500])


@bp.get("/mt5/symbol/<symbol>")
def mt5_symbol(symbol: str):
    ctx = _sys().ctx
    ctx.client.ensure_connected()
    return jsonify(requested=symbol, spec=ctx.resolver.spec(symbol).to_dict(), tick=ctx.market.tick(symbol))


@bp.get("/mt5/candles")
def mt5_candles():
    ctx = _sys().ctx
    ctx.client.ensure_connected()
    symbol = request.args.get("symbol", "EURUSD")
    tf = request.args.get("timeframe", "M15")
    date_from = parse_date(request.args.get("from") or request.args.get("date_from"))
    date_to = parse_date(request.args.get("to") or request.args.get("date_to"))
    if date_from and date_to:
        df = load_history(ctx.market, symbol, tf, date_from, date_to, ctx.settings.cache_dir)
        if len(df) > 2500:
            step = max(1, len(df) // 2500)
            idx = list(range(0, len(df), step))
            if idx[-1] != len(df) - 1:
                idx.append(len(df) - 1)
            df = df.iloc[idx]
    else:
        df = ctx.market.candles(symbol, tf, _int_arg("count", 200, 5000), closed_only=request.args.get("closed", "1") != "0")
    return jsonify(symbol=ctx.resolver.resolve(symbol), timeframe=tf, candles=frame_to_candles(df))


@bp.get("/mt5/positions")
def mt5_positions():
    ctx = _sys().ctx
    ctx.client.ensure_connected()
    only_mine = request.args.get("all", "0") != "1"
    return jsonify(positions=[p.to_dict() for p in ctx.executor.positions(only_mine=only_mine)])


# ── historial del sistema ───────────────────────────────────────────────

@bp.get("/signals")
def signals():
    return jsonify(signals=_sys().store.signals(limit=_int_arg("limit", 100, 2000), symbol=request.args.get("symbol"),
                                                account=_account_filter()))


@bp.get("/trades")
def trades():
    store = _sys().store
    return jsonify(trades=store.trades(limit=_int_arg("limit", 200, 5000),
                                       closed_only=request.args.get("closed") == "1", account=_account_filter()))


@bp.get("/stats")
def stats():
    store = _sys().store
    now = datetime.now(timezone.utc)
    acc = _account_filter()
    return jsonify(
        account=acc,
        today=store.trade_stats(since=now.strftime("%Y-%m-%d"), account=acc),
        last_7d=store.trade_stats(since=(now - timedelta(days=7)).isoformat(), account=acc),
        last_30d=store.trade_stats(since=(now - timedelta(days=30)).isoformat(), account=acc),
        all=store.trade_stats(account=acc),
    )


@bp.get("/equity")
def equity():
    return jsonify(points=_sys().store.equity_curve(days=_int_arg("days", 30, 3650), account=_account_filter()))


@bp.get("/events")
def events():
    return jsonify(events=_sys().store.events(_int_arg("limit", 100, 1000), request.args.get("event")))


# ── estrategias y backtest ──────────────────────────────────────────────

@bp.get("/strategies")
def strategies():
    from ..strategies.catalog import describe

    store = _sys().store
    latest: dict = {}
    for e in store.experiments(limit=500):
        cfg = e.get("config") or {}
        params = (cfg.get("backtest") or cfg).get("params") or {}
        sid = params.get("strategy")
        if sid and sid not in latest and str(e["kind"]).startswith("walkforward"):
            m = e["metrics"].get("candidate", {})
            latest[sid] = {"experiment": e["id"], "kind": e["kind"], "name": e["name"], "status": e["status"],
                           "passed": (e.get("verdict") or {}).get("passed"), "profit_factor": m.get("profit_factor"),
                           "avg_r": m.get("avg_r"), "trades": m.get("total_trades")}
    out = []
    for name in AVAILABLE_STRATEGIES:
        info = get_strategy(name).get_info()
        out.append(info | {"id": name, "catalog": describe(name), "last_evaluation": latest.get(name)})
    return jsonify(strategies=out)


@bp.get("/defaults")
def defaults():
    """Valores por defecto de parámetros de salida y límites de riesgo (para los formularios)."""
    return jsonify(params=StrategyParams().to_dict(), limits=RiskLimits().to_dict())


@bp.post("/backtest")
def backtest():
    return jsonify(results=_run_backtest(_sys(), _body()))


@bp.post("/jobs/backtest")
def job_backtest():
    b = _body()
    system = _sys()  # capturado aquí: el hilo de la tarea no tiene contexto de Flask
    return jsonify(system.jobs.submit("backtest", lambda: {"results": _run_backtest(system, b)}, b)), 202


def _run_backtest(system: System, b: dict) -> list:
    """{symbol, timeframe, strategy ('all' = todas), days | date_from/date_to, params{}, limits{}, ...}"""
    ctx = system.ctx
    ctx.client.ensure_connected()
    symbol = b.get("symbol", "EURUSD")
    timeframe = b.get("timeframe", "M15")
    date_to = parse_date(b.get("date_to")) or datetime.now(timezone.utc)
    date_from = parse_date(b.get("date_from")) or date_to - timedelta(days=int(b.get("days", 90)))
    names = list(AVAILABLE_STRATEGIES) if b.get("strategy") == "all" else [b.get("strategy", "ema_rsi")]
    include_trades = bool(b.get("include_trades", len(names) == 1))

    spec = ctx.resolver.spec(symbol)
    df = load_history(ctx.market, symbol, timeframe, date_from, date_to, ctx.settings.cache_dir)
    results = []
    for name in names:
        config = BacktestConfig(
            symbol=spec.name,
            params=StrategyParams(**{**b.get("params", {}), "strategy": name, "timeframe": timeframe,
                                     **({"strategy_params": {}} if len(names) > 1 else {})}),
            limits=RiskLimits(**b.get("limits", {})),
            initial_balance=float(b.get("initial_balance", 10_000)),
            spread_points=b.get("spread_points"),
            commission_per_lot=float(b.get("commission_per_lot", 0.0)),
            slippage_points=int(b.get("slippage_points", 0)),
        )
        engine = BacktestEngine(config, spec, models_dir=ctx.settings.models_dir)
        results.append(engine.run(df).to_dict(include_trades=include_trades))
    return results


# ── experimentos, modelos y tareas en segundo plano ─────────────────────

@bp.get("/experiments")
def experiments():
    return jsonify(experiments=_sys().store.experiments(limit=_int_arg("limit", 100, 1000),
                                                        kind=request.args.get("kind"),
                                                        status=request.args.get("status")))


@bp.get("/experiments/<int:exp_id>")
def experiment(exp_id: int):
    exp = _sys().store.experiment(exp_id)
    if exp is None:
        raise ValueError(f"No existe el experimento {exp_id}")
    return jsonify(exp)


@bp.post("/experiments/<int:exp_id>/status")
def experiment_status(exp_id: int):
    status = _body().get("status")
    if status not in ("candidate", "promoted", "rejected", "info"):
        raise ValueError("status debe ser candidate, promoted, rejected o info")
    _sys().store.set_experiment_status(exp_id, status)
    return jsonify(_sys().store.experiment(exp_id))


@bp.get("/experiments/compare")
def experiments_compare():
    from ..research.experiments import compare_experiments
    return jsonify(compare_experiments(_sys().store, int(request.args["a"]), int(request.args["b"])))


@bp.get("/models")
def models():
    from ..ml.registry import list_models
    return jsonify(models=list_models(_sys().settings.models_dir))


@bp.get("/jobs")
def jobs():
    return jsonify(jobs=_sys().jobs.list())


@bp.get("/jobs/<job_id>")
def job(job_id: str):
    return jsonify(_sys().jobs.get(job_id))


@bp.post("/jobs/walkforward")
def job_walkforward():
    """{symbol, timeframe, strategy, days, train_days, test_days, mode, grid, params{}, limits{}, ml_threshold}"""
    from ..research.evaluation import Criteria
    from ..research.experiments import record_walkforward
    from ..research.walkforward import make_folds, parse_grid, run_walkforward

    b = _body()
    system = _sys()

    def run():
        ctx = system.ctx
        ctx.client.ensure_connected()
        date_to = parse_date(b.get("date_to")) or datetime.now(timezone.utc)
        date_from = parse_date(b.get("date_from")) or date_to - timedelta(days=int(b.get("days", 730)))
        spec = ctx.resolver.spec(b.get("symbol", "EURUSD"))
        timeframe = b.get("timeframe", "H1")
        df = load_history(ctx.market, spec.name, timeframe, date_from, date_to, ctx.settings.cache_dir)
        base = BacktestConfig(
            symbol=spec.name,
            params=StrategyParams(**{**b.get("params", {}), "strategy": b.get("strategy", "macd"), "timeframe": timeframe}),
            limits=RiskLimits(**b.get("limits", {})),
            initial_balance=float(b.get("initial_balance", 10_000)),
        )
        folds = make_folds(date_from, date_to, int(b.get("train_days", 180)), int(b.get("test_days", 60)))
        grid = b.get("grid") or {}
        if isinstance(grid, str):
            grid = parse_grid(grid)
        mode = b.get("mode", "fixed")
        result = run_walkforward(df, spec, base, folds, mode=mode, grid=grid,
                                 ml_threshold=b.get("ml_threshold"))
        exp_id, verdict = record_walkforward(
            system.store, b.get("name") or f"{base.params.strategy} {spec.name} {timeframe} {mode}",
            {"backtest": base.to_dict(), "mode": mode, "grid": grid, "train_days": b.get("train_days", 180),
             "test_days": b.get("test_days", 60)},
            result, (date_from.isoformat(), date_to.isoformat()), Criteria(min_trades=int(b.get("min_trades", 30))))
        return {"experiment_id": exp_id, "verdict": verdict, **result.to_dict()}

    return jsonify(system.jobs.submit("walkforward", run, b)), 202


@bp.post("/jobs/reconcile")
def job_reconcile():
    """{days} — vivo contra backtest con la configuración guardada del bot."""
    from ..research.reconcile import reconcile

    b = _body()
    system = _sys()
    config = system.bot.saved_config()
    if config is None:
        raise ValueError("No hay configuración guardada del bot")

    def run():
        system.ctx.client.ensure_connected()
        date_to = datetime.now(timezone.utc)
        return reconcile(system.ctx, system.store, config, date_to - timedelta(days=int(b.get("days", 14))), date_to)

    return jsonify(system.jobs.submit("reconcile", run, b)), 202


@bp.post("/jobs/mt5-tester")
def job_mt5_tester():
    """Elige estrategia en el panel → entradas al Probador de MT5 (TradeBotReplay)."""
    from ..mt5tester.service import run_mt5_tester_job

    b = _body()
    system = _sys()
    return jsonify(system.jobs.submit("mt5_tester", lambda: run_mt5_tester_job(system, b), b)), 202


@bp.post("/jobs/mt5-tester-import")
def job_mt5_tester_import():
    """Lee el CSV que escribió TradeBotReplay y lo registra en Experimentos."""
    from ..mt5tester.service import import_mt5_tester_job

    b = _body()
    name = (b.get("name") or "").strip()
    if not name:
        raise ValueError("Falta el nombre de la repetición (el que te dio el envío al Probador)")
    system = _sys()
    return jsonify(system.jobs.submit("mt5_tester_import", lambda: import_mt5_tester_job(system, name), b)), 202



# ── bot ─────────────────────────────────────────────────────────────────

@bp.get("/bot/status")
def bot_status():
    return jsonify(_sys().bot.status())


@bp.get("/bot/config")
def bot_config():
    return jsonify(config=_sys().store.get("bot_config"), autostart=_sys().store.get("bot_autostart", False))


@bp.post("/bot/config")
def bot_config_save():
    """Guarda la configuración del bot sin arrancarlo (se valida antes)."""
    config = BotConfig.from_dict(_body())
    config.params.build_strategy()
    for symbol in config.symbols:
        if _sys().ctx.client.is_connected():
            _sys().ctx.resolver.spec(symbol)
    _sys().store.set("bot_config", config.to_dict())
    return jsonify(config=config.to_dict(), autostart=_sys().store.get("bot_autostart", False))


@bp.post("/bot/start")
def bot_start():
    bot = _sys().bot
    body = dict(_body() or {})
    confirm_real = bool(body.pop("confirm_real", False))
    ctx = _sys().ctx
    if not ctx.client.is_connected():
        try:
            ctx.connect()
        except MT5Error as exc:
            return jsonify(error=str(exc), last_error=_mt5_last_error(ctx.client), connected=False), 503
    config = BotConfig.from_dict(body) if body else bot.saved_config()
    if config is None:
        raise ValueError("Envía la configuración del bot (no hay una guardada)")
    bot.start(config, confirm_real=confirm_real)
    acc = ctx.client.account()
    return jsonify(bot.status() | {"account": acc.to_dict(), "connected": True})


@bp.post("/bot/stop")
def bot_stop():
    _sys().bot.stop(by_user=True)
    return jsonify(_sys().bot.status())


@bp.get("/bot/journal")
def bot_journal():
    return jsonify(events=_sys().store.events(_int_arg("limit", 100, 500), request.args.get("event")))


# ── puente para el EA TradeBotRemote de MT5 ─────────────────────────────

@bp.get("/bridge/status.txt")
def bridge_status():
    return Response(render_status(_sys().bot), mimetype="text/plain; charset=utf-8")


@bp.get("/bridge/signals.txt")
def bridge_signals():
    text = render_signals(_sys().bot, limit=_int_arg("limit", 300, 2000), symbol=request.args.get("symbol") or None)
    return Response(text, mimetype="text/plain; charset=utf-8")


# ── usuarios del sistema ────────────────────────────────────────────────

@bp.get("/auth/status")
def auth_status():
    """Público: el frontend sabe si debe mostrar 'crear primer usuario' o 'iniciar sesión'."""
    return jsonify(needs_setup=_sys().auth.needs_setup())


@bp.post("/auth/setup")
def auth_setup():
    """Crea el primer usuario (administrador). Solo funciona si todavía no hay ninguno."""
    auth = _sys().auth
    if not auth.needs_setup():
        return jsonify(error="Ya existe un usuario: inicia sesión"), 409
    b = _body()
    user = auth.create_user(b.get("username", ""), b.get("password", ""), role="admin")
    token, user = auth.login(user["username"], b.get("password", ""), request.remote_addr or "")
    _sys().store.log_event("user_created", username=user["username"], first=True)
    return jsonify(token=token, user=user)


@bp.post("/auth/login")
def auth_login():
    b = _body()
    token, user = _sys().auth.login(b.get("username", ""), b.get("password", ""), request.remote_addr or "")
    _sys().store.log_event("user_login", username=user["username"])
    return jsonify(token=token, user=user)


@bp.get("/auth/me")
def auth_me():
    return jsonify(user=g.user)


@bp.post("/auth/password")
def auth_password():
    if not g.user or not g.user.get("id"):
        raise ValueError("Solo usuarios pueden cambiar su contraseña")
    b = _body()
    _sys().auth.change_password(g.user["id"], b.get("current", ""), b.get("new", ""))
    return jsonify(ok=True, message="Contraseña cambiada: vuelve a iniciar sesión")


@bp.get("/users")
def users_list():
    _require_admin()
    return jsonify(users=_sys().store.list_users())


@bp.post("/users")
def users_create():
    _require_admin()
    b = _body()
    user = _sys().auth.create_user(b.get("username", ""), b.get("password", ""), b.get("role", "viewer"))
    return jsonify(user=user)


@bp.delete("/users/<int:user_id>")
def users_delete(user_id: int):
    _require_admin()
    if g.user.get("id") == user_id:
        raise ValueError("No puedes borrarte a ti mismo")
    _sys().store.delete_user(user_id)
    return jsonify(deleted=True)


def _require_admin():
    if not g.user or g.user.get("role") not in ("admin", "service"):
        raise RuntimeError("Solo un administrador puede hacer esto")


# ── tiempo real (Server-Sent Events) ────────────────────────────────────

@bp.get("/stream")
def stream():
    """Envía cada 2 s el estado (event: status) y las señales/eventos nuevos (event: signal / event)."""
    system = _sys()
    interval = max(1.0, float(request.args.get("interval", 2)))

    def snapshot() -> dict:
        client = system.ctx.client
        connected = client.is_connected()
        account = None
        if connected:
            try:
                account = client.account().to_dict()
            except Exception:
                connected = False
        ok, reason = system.supervisor.healthy()
        err = _mt5_last_error(client) if not connected else None
        return {"health": {"ok": ok, "reason": reason},
                "mt5": {"connected": connected, "account": account, "last_error": err},
                "bot": system.bot.status()}

    def gen():
        last_signal = max((s["id"] for s in system.store.signals(limit=1)), default=0)
        last_event = max((e["id"] for e in system.store.events(limit=1)), default=0)
        yield "retry: 3000\n\n"
        while True:
            try:
                yield f"event: status\ndata: {json.dumps(snapshot(), default=str)}\n\n"
                for s in reversed(system.store.signals(limit=50, after_id=last_signal)):
                    last_signal = max(last_signal, s["id"])
                    yield f"event: signal\ndata: {json.dumps(s, default=str)}\n\n"
                for e in reversed(system.store.events(limit=50, after_id=last_event)):
                    last_event = max(last_event, e["id"])
                    yield f"event: event\ndata: {json.dumps(e, default=str)}\n\n"
            except Exception as exc:  # no cortar el flujo por un error puntual
                yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
            time.sleep(interval)

    # no-transform: que ningún proxy (p. ej. el de Next.js) lo comprima y retrase los eventos
    headers = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    return Response(stream_with_context(gen()), mimetype="text/event-stream", headers=headers)


def register_routes(app: Flask) -> None:
    app.register_blueprint(bp)

    @app.get("/")
    def root():
        return jsonify(service="TradeBot MT5 backend", version=__version__,
                       panel="El panel web es el frontend (Next.js): http://localhost:3000",
                       health="/api/health")
