"""Backtest bidireccional con el Probador de Estrategias de MT5.

  # 0) Instalar/compilar los programas MQL5 (indicador, EAs) en el terminal
  .venv\\Scripts\\python scripts\\mt5_tester.py install

  # 1) Nuestro backtest -> exportar entradas -> Probador de MT5 -> comparar
  .venv\\Scripts\\python scripts\\mt5_tester.py run --symbol EURUSD --timeframe H1 --strategy macd --days 180

  # 2) Si el Probador se ejecutó a mano: importar su resultado y comparar
  .venv\\Scripts\\python scripts\\mt5_tester.py import <nombre>

  # 3) Analizar el resultado de CUALQUIER EA que use TradeBotRecorder.mqh
  .venv\\Scripts\\python scripts\\mt5_tester.py analyze "TradeBot\\mi_ea.csv" --balance 10000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from _common import add_period_args, add_trading_args, build_config, fmt_metrics, period, utf8_console

from tradebot.app import build_system
from tradebot.backtest import BacktestEngine, load_history
from tradebot.logging_setup import setup_logging
from tradebot.mt5tester.install import install_mql5
from tradebot.mt5tester.replay import (compare_runs, export_replay, load_mt5_results, mt5_only_metrics, now_stamp,
                                       replay_files, run_tester, tester_ini)
from tradebot.research.experiments import code_version


def common_files(system) -> Path:
    if system.settings.mt5_common_files:
        return Path(system.settings.mt5_common_files)
    return Path(system.ctx.client.call("terminal_info").commondata_path) / "Files"


def print_comparison(cmp: dict) -> None:
    s = cmp["summary"]
    print(f"\n  Nuestro backtest : {fmt_metrics(cmp['ours'])}")
    print(f"  Probador MT5     : {fmt_metrics(cmp['mt5'])}")
    print(f"\n  Emparejadas {s['matched']}/{s['ours_trades']} · faltan en MT5 {s['missing_in_mt5']} · "
          f"mismo resultado (gana/pierde) {s['same_outcome_pct']}% · misma salida (SL/TP/tiempo) {s['same_exit_reason_pct']}%")
    print(f"  Diferencia media de precio de entrada {s['mean_abs_entry_diff']} · neto nuestro {s['net_ours']} vs MT5 "
          f"{s['net_mt5']} · correlación P&L {s['pnl_correlation']}")
    worst = sorted([t for t in cmp["trades"] if t["mt5"] and not t["same_outcome"]],
                   key=lambda t: abs(t["mt5_net"] - t["ours_net"]), reverse=True)[:5]
    if worst:
        print("  Mayores discrepancias:")
        for t in worst:
            print(f"    #{t['id']} {t['entry_time'][:16]} {t['side']}: nuestro {t['ours_net']:+.2f} ({t['ours_exit_reason']})"
                  f" vs MT5 {t['mt5_net']:+.2f} ({t['mt5_exit_reason']})")


def record(system, name: str, ours: dict, cmp: dict, files) -> int:
    return system.store.add_experiment(
        name=name, kind="mt5_tester_compare", config=ours["config"],
        metrics={"candidate": cmp["mt5"], "ours": cmp["ours"], "summary": cmp["summary"]},
        status="info", period_start=ours["period_start"], period_end=ours["period_end"],
        code_version=code_version(), artifacts={"orders": str(files.orders), "result": str(files.result)},
    )


def main() -> int:
    utf8_console()
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("install")
    run = sub.add_parser("run")
    add_trading_args(run)
    add_period_args(run, days=365)
    run.add_argument("--model", type=int, default=4, help="4 ticks reales · 1 OHLC M1 · 0 cada tick")
    run.add_argument("--manual", action="store_true", help="Solo exportar; ejecutar el Probador a mano")
    imp = sub.add_parser("import")
    imp.add_argument("name")
    an = sub.add_parser("analyze")
    an.add_argument("file", help="Ruta relativa a Common\\Files")
    an.add_argument("--balance", type=float, default=10_000)
    args = p.parse_args()

    system = build_system()
    setup_logging(system.settings.logs_dir, "WARNING")
    ctx = system.ctx
    ctx.connect()
    info = ctx.client.call("terminal_info")

    if args.cmd == "install":
        targets = [(Path(info.data_path), Path(info.path))]
        if system.settings.mt5_tester_path:
            tester_dir = Path(system.settings.mt5_tester_path).parent
            targets.append((tester_dir, tester_dir))  # instalación portable: datos = carpeta del programa
        for data_path, terminal_dir in targets:
            res = install_mql5(data_path, terminal_dir)
            print(f"{data_path}:")
            for f, r in res["compiled"].items():
                print(f"  {'OK ' if r['ok'] else 'ERR'} {f} ({r['errors']} errores, {r['warnings']} avisos)")
                for issue in r["issues"]:
                    print(f"      {issue}")
        print("\nEn MT5: Navegador > Indicadores > TradeBot > TradeBotMonitor (arrástralo a un gráfico).")
        return 0

    files_root = common_files(system)

    if args.cmd == "analyze":
        df = load_mt5_results(files_root / args.file, ctx.client.utc_offset())
        print(fmt_metrics(mt5_only_metrics(df, args.balance)))
        return 0

    if args.cmd == "import":
        files = replay_files(files_root, args.name)
        if not files.result.exists():
            print(f"No existe {files.result}. ¿Terminó el Probador?")
            return 1
        saved = json.loads(files.ours.read_text(encoding="utf-8"))
        ours = saved["result"]
        cmp = compare_runs(ours, load_mt5_results(files.result, saved["utc_offset_seconds"]))
        print_comparison(cmp)
        print(f"\n  Experimento #{record(system, f'MT5 vs backtest {args.name}', ours, cmp, files)} registrado")
        return 0

    # run
    date_from, date_to = period(args)
    account = ctx.client.account()
    spec = ctx.resolver.spec(args.symbol)
    df = load_history(ctx.market, args.symbol, args.timeframe, date_from, date_to, ctx.settings.cache_dir)
    config = build_config(args, spec.name)
    result = BacktestEngine(config, spec, models_dir=system.settings.models_dir).run(df)
    print(f"Nuestro backtest: {fmt_metrics(result.metrics)}")
    if not result.trades:
        print("Sin operaciones que repetir.")
        return 1
    name = f"{spec.name}_{args.timeframe}_{args.strategy}_{now_stamp()}"
    offset = ctx.client.utc_offset(spec.name)
    files = export_replay(result, spec, files_root, name, offset)
    print(f"Entradas exportadas: {files.orders}")

    tester = system.settings.mt5_tester_path
    if args.manual or not tester:
        print(f"""
Ejecuta el Probador a mano (Ver > Probador de estrategias, Ctrl+R):
  Experto:      TradeBot\\TradeBotReplay
  Símbolo:      {spec.name}     Periodo: {args.timeframe}
  Fechas:       {date_from:%Y.%m.%d} - {date_to:%Y.%m.%d}
  Modelado:     Cada tick basado en ticks reales
  Depósito:     {config.initial_balance:.0f} {account.currency}
  Parámetro InpFile = {files.ea_input}
Al terminar:  .venv\\Scripts\\python scripts\\mt5_tester.py import {name}
(Para automatizarlo define MT5_TESTER_PATH con una instalación de MT5 aparte, en modo portable.)""")
        return 0

    ini = tester_ini(files, spec.name, args.timeframe, date_from, date_to, config.initial_balance,
                     account.currency, account.leverage, files.orders.parent,
                     system.settings.mt5_login, system.settings.mt5_password, system.settings.mt5_server, args.model)
    print("Ejecutando el Probador de MT5 (puede tardar varios minutos)...")
    if not run_tester(Path(tester), ini, files):
        print("El Probador no generó resultados. Revisa el diario del terminal de pruebas.")
        return 1
    cmp = compare_runs(result, load_mt5_results(files.result, offset))
    print_comparison(cmp)
    print(f"\n  Experimento #{record(system, f'MT5 vs backtest {name}', result.to_dict(), cmp, files)} registrado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
