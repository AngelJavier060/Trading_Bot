"""Backtest bidireccional con el Probador de Estrategias de MT5.

Flujo:
 1. export_replay(): las entradas de NUESTRO backtest se guardan en
    Common\\Files\\TradeBot\\replay\\<nombre>.csv (+ <nombre>_ours.json con nuestros resultados).
 2. El EA TradeBotReplay las ejecuta en el Probador con los ticks reales de MT5
    (automático con run_tester() si hay un terminal dedicado, o a mano).
 3. El EA escribe <nombre>_result.csv; load_mt5_results() lo lee.
 4. compare_runs() empareja operación por operación y resume las diferencias.

Cualquier otro EA que incluya TradeBotRecorder.mqh genera el mismo formato de
resultados, así que sus pruebas también se pueden importar y analizar aquí.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ..backtest.metrics import compute_metrics
from ..backtest.models import BacktestResult, BacktestTrade
from ..broker.models import SymbolSpec

REPLAY_SUBDIR = Path("TradeBot") / "replay"
RESULT_COLUMNS = ["position", "tag", "symbol", "side", "volume", "open_time", "open_price", "close_time",
                  "close_price", "sl", "tp", "profit", "commission", "swap", "reason"]


@dataclass
class ReplayFiles:
    name: str
    orders: Path      # entradas para el EA
    ours: Path        # nuestro resultado (para comparar)
    result: Path      # resultado del Probador (lo escribe el EA)
    ea_input: str     # valor de InpFile para el EA (relativo a Common\Files)


def replay_files(common_files: Path, name: str) -> ReplayFiles:
    folder = common_files / REPLAY_SUBDIR
    return ReplayFiles(
        name=name,
        orders=folder / f"{name}.csv",
        ours=folder / f"{name}_ours.json",
        result=folder / f"{name}_result.csv",
        ea_input=str(REPLAY_SUBDIR / f"{name}.csv"),
    )


def export_replay(result: BacktestResult, spec: SymbolSpec, common_files: Path, name: str,
                  utc_offset_seconds: int) -> ReplayFiles:
    """Escribe las entradas del backtest para el EA. Los tiempos van en hora del servidor."""
    files = replay_files(common_files, name)
    files.orders.parent.mkdir(parents=True, exist_ok=True)
    max_bars = result.config.params.max_bars_in_trade
    lines = ["# id;tiempo_servidor;side;volume;sl_dist;tp_dist;max_bars"]
    for i, t in enumerate(result.trades, 1):
        server_ts = int(pd.Timestamp(t.entry_time).timestamp()) + utc_offset_seconds
        sl_dist = abs(t.entry_price - t.sl)
        tp_dist = abs(t.tp - t.entry_price) if t.tp else 0.0
        lines.append(f"{i};{server_ts};{t.side};{t.volume:.2f};{sl_dist:.{spec.digits}f};"
                     f"{tp_dist:.{spec.digits}f};{max_bars}")
    files.orders.write_text("\n".join(lines) + "\n", encoding="utf-8")
    files.ours.write_text(json.dumps({
        "name": name, "symbol": spec.name, "utc_offset_seconds": utc_offset_seconds,
        "result": result.to_dict(include_trades=True),
    }, ensure_ascii=False, default=str), encoding="utf-8")
    return files


def tester_ini(files: ReplayFiles, symbol: str, timeframe: str, date_from: datetime, date_to: datetime,
               deposit: float, currency: str, leverage: int, report_dir: Path,
               login: Optional[int] = None, password: str = "", server: str = "", model: int = 4) -> str:
    """Configuración para lanzar el Probador por línea de comandos.
    model: 4 = cada tick basado en ticks reales, 1 = OHLC en M1, 0 = cada tick."""
    common = ""
    if login:
        common = f"[Common]\nLogin={login}\nPassword={password}\nServer={server}\n\n"
    return (
        f"{common}[Tester]\n"
        "Expert=TradeBot\\TradeBotReplay.ex5\n"
        f"Symbol={symbol}\n"
        f"Period={timeframe}\n"
        f"Model={model}\n"
        "ExecutionMode=0\n"
        "Optimization=0\n"
        f"FromDate={date_from:%Y.%m.%d}\n"
        f"ToDate={date_to:%Y.%m.%d}\n"
        "ForwardMode=0\n"
        f"Deposit={deposit:.0f}\n"
        f"Currency={currency}\n"
        f"Leverage={leverage}\n"
        f"Report={report_dir / files.name}\n"
        "ReplaceReport=1\n"
        "ShutdownTerminal=1\n"
        "Visual=0\n\n"
        "[TesterInputs]\n"
        f"InpFile={files.ea_input}\n"
    )


def run_tester(terminal_exe: Path, ini_text: str, files: ReplayFiles, timeout_s: int = 3600,
               portable: bool = True) -> bool:
    """Lanza un terminal MT5 dedicado con el .ini y espera el archivo de resultados.

    Usa una instalación de MT5 SEPARADA de la que opera en vivo: si el terminal ya
    está abierto, MT5 ignora la configuración del Probador.
    """
    ini_path = files.orders.with_suffix(".ini")
    ini_path.write_text(ini_text, encoding="utf-16")  # MT5 lee .ini en UTF-16
    if files.result.exists():
        files.result.unlink()
    cmd = [str(terminal_exe), f"/config:{ini_path}"] + (["/portable"] if portable else [])
    proc = subprocess.Popen(cmd)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if files.result.exists() and proc.poll() is not None:
            return True
        if proc.poll() is not None and not files.result.exists():
            time.sleep(3)  # dar margen a que el archivo termine de escribirse
            return files.result.exists()
        time.sleep(2)
    proc.kill()
    return False


def load_mt5_results(path: Path, utc_offset_seconds: int = 0) -> pd.DataFrame:
    """Lee el CSV de TradeBotRecorder. Tiempos convertidos a UTC."""
    df = pd.read_csv(path, sep="|", dtype={"tag": str})
    df.columns = [c.strip() for c in df.columns]
    for col in ("open_time", "close_time"):
        df[col] = pd.to_datetime(df[col].astype("int64") - utc_offset_seconds, unit="s", utc=True)
    df["net_profit"] = df["profit"] + df["commission"] + df["swap"]
    df["replay_id"] = df["tag"].fillna("").str.extract(r"tb:(\d+)")[0].astype("Int64")
    return df


def compare_runs(ours: BacktestResult | dict, mt5: pd.DataFrame, initial_balance: Optional[float] = None) -> dict:
    """Empareja nuestras operaciones con las del Probador (por id de repetición) y resume diferencias."""
    ours_d = ours.to_dict(include_trades=True) if isinstance(ours, BacktestResult) else ours
    trades = ours_d["trades"]
    balance = initial_balance or ours_d["config"]["initial_balance"]
    by_id = {int(r.replay_id): r for r in mt5.itertuples() if pd.notna(r.replay_id)}

    rows, mt5_trades = [], []
    for i, t in enumerate(trades, 1):
        m = by_id.get(i)
        row = {"id": i, "entry_time": t["entry_time"], "side": t["side"], "ours_entry": t["entry_price"],
               "ours_exit_reason": t["exit_reason"], "ours_net": t["net_profit"], "mt5": m is not None}
        if m is not None:
            row.update(mt5_entry=float(m.open_price), mt5_exit_reason=m.reason, mt5_net=round(float(m.net_profit), 2),
                       entry_diff=round(float(m.open_price) - t["entry_price"], 6),
                       same_outcome=(np.sign(m.net_profit) == np.sign(t["net_profit"])))
            mt5_trades.append(BacktestTrade(
                side=m.side, entry_time=m.open_time.isoformat(), entry_price=float(m.open_price),
                sl=float(m.sl), tp=float(m.tp), volume=float(m.volume), risk_money=t["risk_money"],
                confidence=t["confidence"], exit_time=m.close_time.isoformat(), exit_price=float(m.close_price),
                exit_reason=m.reason, net_profit=round(float(m.net_profit), 2),
                r_multiple=round(float(m.net_profit) / t["risk_money"], 3) if t["risk_money"] else 0.0,
            ))
        rows.append(row)

    matched = [r for r in rows if r["mt5"]]
    ours_trades = [BacktestTrade(**{k: v for k, v in t.items() if k in BacktestTrade.__dataclass_fields__})
                   for t in trades]

    def metrics(ts: list[BacktestTrade]) -> dict:
        if not ts:
            return compute_metrics([], balance, pd.Series(dtype=float))
        net = pd.Series([x.net_profit for x in ts],
                        index=pd.DatetimeIndex([pd.Timestamp(x.exit_time or x.entry_time) for x in ts])).sort_index()
        return compute_metrics(ts, balance, balance + net.cumsum())

    ours_net = np.array([r["ours_net"] for r in matched]) if matched else np.array([])
    mt5_net = np.array([r["mt5_net"] for r in matched]) if matched else np.array([])
    summary = {
        "ours_trades": len(trades),
        "mt5_trades": len(mt5),
        "matched": len(matched),
        "missing_in_mt5": len(trades) - len(matched),
        "same_outcome_pct": round(100 * np.mean([r["same_outcome"] for r in matched]), 2) if matched else 0.0,
        "same_exit_reason_pct": round(100 * np.mean([r["ours_exit_reason"] == r["mt5_exit_reason"] for r in matched]), 2)
        if matched else 0.0,
        "mean_abs_entry_diff": round(float(np.mean([abs(r["entry_diff"]) for r in matched])), 6) if matched else 0.0,
        "net_ours": round(float(ours_net.sum()), 2),
        "net_mt5": round(float(mt5_net.sum()), 2),
        "pnl_correlation": round(float(np.corrcoef(ours_net, mt5_net)[0, 1]), 4)
        if len(matched) > 2 and ours_net.std() > 0 and mt5_net.std() > 0 else None,
    }
    return {"summary": summary, "ours": metrics(ours_trades), "mt5": metrics(mt5_trades), "trades": rows}


def mt5_only_metrics(mt5: pd.DataFrame, initial_balance: float) -> dict:
    """Métricas de un resultado del Probador sin backtest propio (p. ej. un EA cualquiera)."""
    ts = [BacktestTrade(side=r.side, entry_time=r.open_time.isoformat(), entry_price=float(r.open_price),
                        sl=float(r.sl), tp=float(r.tp), volume=float(r.volume), risk_money=0.0, confidence=0.0,
                        exit_time=r.close_time.isoformat(), exit_price=float(r.close_price), exit_reason=r.reason,
                        net_profit=round(float(r.net_profit), 2))
          for r in mt5.itertuples()]
    if not ts:
        return compute_metrics([], initial_balance, pd.Series(dtype=float))
    net = pd.Series([t.net_profit for t in ts], index=pd.DatetimeIndex([pd.Timestamp(t.exit_time) for t in ts]))
    return compute_metrics(ts, initial_balance, initial_balance + net.sort_index().cumsum())


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
