from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
import pytest

from conftest import frame
from tradebot.backtest import BacktestConfig, BacktestEngine
from tradebot.mt5tester.replay import compare_runs, export_replay, load_mt5_results, tester_ini
from tradebot.planner import StrategyParams
from tradebot.risk import RiskLimits

OFFSET = 3 * 3600


@pytest.fixture
def our_result(eurusd_spec):
    import numpy as np
    rng = np.random.default_rng(5)
    df = frame(list(1.10 + np.cumsum(rng.normal(0, 0.0008, 1500))))
    cfg = BacktestConfig(symbol="EURUSD-T", params=StrategyParams(strategy="macd", timeframe="M15"),
                         limits=RiskLimits(max_trades_per_day=100, max_daily_loss_pct=100))
    res = BacktestEngine(cfg, eurusd_spec).run(df)
    assert len(res.trades) >= 5
    return res


def write_mt5_result(path, trades, drop_last=True, flip_first=False):
    """Simula el CSV de TradeBotRecorder a partir de nuestras operaciones."""
    lines = ["position|tag|symbol|side|volume|open_time|open_price|close_time|close_price|sl|tp|profit|commission|swap|reason"]
    use = trades[:-1] if drop_last else trades
    for i, t in enumerate(use, 1):
        profit = -t.net_profit if (flip_first and i == 1) else t.net_profit
        lines.append(f"{9000 + i}|tb:{i}|EURUSD-T|{t.side}|{t.volume}|"
                     f"{int(pd.Timestamp(t.entry_time).timestamp()) + OFFSET}|{t.entry_price + 0.00002:.5f}|"
                     f"{int(pd.Timestamp(t.exit_time).timestamp()) + OFFSET}|{t.exit_price:.5f}|{t.sl}|{t.tp}|"
                     f"{profit:.2f}|0.00|0.00|{t.exit_reason}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_export_replay(our_result, eurusd_spec, tmp_path):
    files = export_replay(our_result, eurusd_spec, tmp_path, "prueba", OFFSET)
    rows = [ln for ln in files.orders.read_text(encoding="utf-8").splitlines() if not ln.startswith("#")]
    assert len(rows) == len(our_result.trades)
    first = rows[0].split(";")
    t = our_result.trades[0]
    assert int(first[1]) == int(pd.Timestamp(t.entry_time).timestamp()) + OFFSET   # hora del servidor
    assert float(first[4]) == pytest.approx(abs(t.entry_price - t.sl), abs=1e-5)
    assert files.ours.exists() and files.ea_input.endswith("prueba.csv")


def test_compare_identical_runs(our_result, tmp_path):
    path = tmp_path / "r.csv"
    write_mt5_result(path, our_result.trades)
    mt5 = load_mt5_results(path, OFFSET)
    assert mt5["open_time"].iloc[0] == pd.Timestamp(our_result.trades[0].entry_time)
    cmp = compare_runs(our_result, mt5)
    s = cmp["summary"]
    assert s["matched"] == len(our_result.trades) - 1 and s["missing_in_mt5"] == 1
    assert s["same_outcome_pct"] == 100.0 and s["mean_abs_entry_diff"] == pytest.approx(0.00002, abs=1e-6)
    assert cmp["mt5"]["total_trades"] == s["matched"]


def test_compare_detects_discrepancy(our_result, tmp_path):
    path = tmp_path / "r.csv"
    write_mt5_result(path, our_result.trades, drop_last=False, flip_first=True)
    cmp = compare_runs(our_result.to_dict(), load_mt5_results(path, OFFSET))
    assert cmp["summary"]["same_outcome_pct"] < 100
    assert not cmp["trades"][0]["same_outcome"]


def test_panel_sends_entries_to_tester_folder(system):
    from tradebot.mt5tester.service import run_mt5_tester_job
    out = run_mt5_tester_job(system, {
        "symbol": "EURUSD", "timeframe": "M15", "strategy": "macd",
        "date_from": "2023-11-14", "date_to": "2023-11-25",
    })
    assert out["mode"] == "manual"
    assert Path(out["files"]["orders"]).is_file()
    assert "TradeBotReplay" in out["tester"]["expert"]
    assert out["ours"]["metrics"]["total_trades"] >= 1


def test_tester_ini(our_result, eurusd_spec, tmp_path):
    files = export_replay(our_result, eurusd_spec, tmp_path, "x", OFFSET)
    ini = tester_ini(files, "EURUSD-T", "M15", datetime(2025, 1, 1), datetime(2025, 6, 30), 10000, "USD", 100,
                     tmp_path, login=123, password="p", server="S")
    assert "Expert=TradeBot\\TradeBotReplay.ex5" in ini and "Model=4" in ini
    assert "FromDate=2025.01.01" in ini and "ShutdownTerminal=1" in ini
    assert f"InpFile={files.ea_input}" in ini and "Login=123" in ini
