"""Trabajo de Probador de MT5 lanzado desde el panel.

Elige estrategia en el TradeBot → se generan las entradas → el EA TradeBotReplay
las ejecuta en el Probador (órdenes de prueba, no en la cuenta en vivo) → los
resultados vuelven a Experimentos.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..backtest import BacktestConfig, BacktestEngine, load_history
from ..planner import StrategyParams
from ..research.experiments import code_version
from ..risk import RiskLimits
from .replay import (compare_runs, export_replay, load_mt5_results, now_stamp, replay_files,
                     run_tester, tester_ini)


def common_files_dir(system) -> Path:
    if system.settings.mt5_common_files:
        p = Path(system.settings.mt5_common_files)
        p.mkdir(parents=True, exist_ok=True)
        return p
    try:
        info = system.ctx.client.call("terminal_info")
        raw = getattr(info, "commondata_path", None)
        if raw:
            p = Path(raw) / "Files"
            p.mkdir(parents=True, exist_ok=True)
            return p
    except Exception:
        pass
    p = system.settings.data_dir / "mt5_files"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _period(body: dict) -> tuple[datetime, datetime]:
    date_to = datetime.now(timezone.utc)
    raw_to = body.get("date_to")
    if raw_to:
        date_to = datetime.strptime(str(raw_to)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    raw_from = body.get("date_from")
    if raw_from:
        date_from = datetime.strptime(str(raw_from)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        date_from = date_to - timedelta(days=int(body.get("days", 365)))
    return date_from, date_to


def run_mt5_tester_job(system, body: dict) -> dict[str, Any]:
    """Backtest propio + export al Probador. Si hay MT5_TESTER_PATH, lo lanza solo."""
    ctx = system.ctx
    ctx.client.ensure_connected()
    date_from, date_to = _period(body)
    timeframe = body.get("timeframe", "H1")
    strategy = body.get("strategy", "macd")
    if strategy == "all":
        raise ValueError("El Probador repite una estrategia. Elige una (no 'all').")
    spec = ctx.resolver.spec(body.get("symbol", "EURUSD"))
    df = load_history(ctx.market, spec.name, timeframe, date_from, date_to, ctx.settings.cache_dir)
    config = BacktestConfig(
        symbol=spec.name,
        params=StrategyParams(**{**body.get("params", {}), "strategy": strategy, "timeframe": timeframe}),
        limits=RiskLimits(**body.get("limits", {})),
        initial_balance=float(body.get("initial_balance", 10_000)),
    )
    result = BacktestEngine(config, spec, models_dir=system.settings.models_dir).run(df)
    if not result.trades:
        raise ValueError("El backtest no generó operaciones que enviar al Probador. Cambia símbolo, días o estrategia.")

    files_root = common_files_dir(system)
    name = f"{spec.name}_{timeframe}_{strategy}_{now_stamp()}"
    offset = ctx.client.utc_offset(spec.name)
    files = export_replay(result, spec, files_root, name, offset)
    account = ctx.client.account()
    tester = (system.settings.mt5_tester_path or "").strip()
    payload = {
        "name": name,
        "symbol": spec.name,
        "timeframe": timeframe,
        "strategy": strategy,
        "ours": result.to_dict(include_trades=False),
        "files": {"orders": str(files.orders), "ea_input": files.ea_input, "result": str(files.result)},
        "tester": {
            "expert": "TradeBot\\TradeBotReplay",
            "symbol": spec.name,
            "period": timeframe,
            "from": f"{date_from:%Y.%m.%d}",
            "to": f"{date_to:%Y.%m.%d}",
            "deposit": config.initial_balance,
            "currency": account.currency,
            "inp_file": files.ea_input,
            "model": "Cada tick basado en ticks reales",
        },
    }

    if not tester:
        payload["mode"] = "manual"
        payload["message"] = (
            "Entradas listas en Common\\Files. En MT5: Ctrl+R (Probador) → Experto TradeBot\\TradeBotReplay, "
            f"símbolo {spec.name}, periodo {timeframe}, fechas {date_from:%Y.%m.%d}–{date_to:%Y.%m.%d}, "
            f"InpFile={files.ea_input}. Al terminar, pulsa «Importar resultado» con el nombre {name}."
        )
        return payload

    ini = tester_ini(
        files, spec.name, timeframe, date_from, date_to, config.initial_balance,
        account.currency, account.leverage, files.orders.parent,
        system.settings.mt5_login, system.settings.mt5_password, system.settings.mt5_server,
        int(body.get("model", 4)),
    )
    ok = run_tester(Path(tester), ini, files)
    if not ok:
        payload["mode"] = "manual"
        payload["message"] = (
            "No se pudo lanzar el Probador automático (hace falta un MT5 portable aparte en MT5_TESTER_PATH). "
            f"Ejecútalo a mano: Experto TradeBot\\TradeBotReplay, InpFile={files.ea_input}."
        )
        return payload

    cmp = compare_runs(result, load_mt5_results(files.result, offset))
    exp_id = _record(system, name, result.to_dict(), cmp, files)
    payload["mode"] = "auto"
    payload["experiment_id"] = exp_id
    payload["comparison"] = {"summary": cmp["summary"], "ours": cmp["ours"], "mt5": cmp["mt5"]}
    payload["message"] = f"Probador terminado. Experimento #{exp_id} en Experimentos."
    return payload


def import_mt5_tester_job(system, name: str) -> dict[str, Any]:
    files = replay_files(common_files_dir(system), name)
    if not files.result.exists():
        raise ValueError(
            f"Aún no está el resultado del Probador ({files.result.name}). "
            "Cuando termine TradeBotReplay, vuelve a importar."
        )
    saved = json.loads(files.ours.read_text(encoding="utf-8"))
    ours = saved["result"]
    cmp = compare_runs(ours, load_mt5_results(files.result, saved["utc_offset_seconds"]))
    exp_id = _record(system, name, ours, cmp, files)
    return {
        "mode": "imported",
        "name": name,
        "experiment_id": exp_id,
        "comparison": {"summary": cmp["summary"], "ours": cmp["ours"], "mt5": cmp["mt5"]},
        "message": f"Importado. Experimento #{exp_id}.",
    }


def _record(system, name: str, ours: dict, cmp: dict, files) -> int:
    return system.store.add_experiment(
        name=f"MT5 vs backtest {name}", kind="mt5_tester_compare", config=ours.get("config") or {},
        metrics={"candidate": cmp["mt5"], "ours": cmp["ours"], "summary": cmp["summary"]},
        status="info", period_start=ours.get("period_start"), period_end=ours.get("period_end"),
        code_version=code_version(), artifacts={"orders": str(files.orders), "result": str(files.result)},
    )
