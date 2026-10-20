import time

import pytest

from conftest import make_system
from fake_mt5 import FakeMT5
from tradebot.live import BotConfig
from tradebot.live.engine import SymbolState
from tradebot.planner import StrategyParams
from tradebot.strategies import AVAILABLE_STRATEGIES
from tradebot.strategies.base_strategy import BaseStrategy, SignalType, TradingSignal


class AlwaysBuy(BaseStrategy):
    name = "always_buy"
    min_candles = 20

    def default_params(self):
        return {"x": 1}

    def analyze(self, candles, candles_htf=None, *, asset=""):
        return TradingSignal(signal=SignalType.BUY, confidence=90, indicators={}, reasons=[], strategy_name=self.name)


@pytest.fixture(autouse=True)
def register(monkeypatch):
    monkeypatch.setitem(AVAILABLE_STRATEGIES, "always_buy", AlwaysBuy)


def config(**kw):
    return BotConfig(symbols=["EURUSD"], params=StrategyParams(strategy="always_buy", timeframe="M15"), **kw)


def prepare(bot, cfg):
    """Configura el bot sin lanzar el hilo, para ejecutar ciclos a mano."""
    bot._preflight(cfg)
    bot.config = cfg
    bot._strategies = {s: cfg.params.build_strategy() for s in cfg.symbols}
    bot._symbols = {s: SymbolState() for s in cfg.symbols}
    bot._load_day_state()


def test_dry_run_does_not_send_orders(system, fake_mt5):
    prepare(system.bot, config(dry_run=True))
    system.bot.run_once()
    assert fake_mt5.sent == []
    sig = system.store.signals()[0]
    assert sig["decision"] == "dry_run" and sig["side"] == "buy" and sig["volume"] > 0


def test_opens_order_and_records_trade(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    assert len(fake_mt5.sent) == 1
    req = fake_mt5.sent[0]
    assert req["symbol"] == "EURUSD-T" and req["type"] == FakeMT5.ORDER_TYPE_BUY
    assert 0 < req["sl"] < req["price"] < req["tp"]
    assert req["magic"] == system.settings.magic
    trade = system.store.open_trades()[0]
    assert trade["ticket"] == next(iter(fake_mt5.positions)) and trade["risk_money"] > 0
    assert system.store.signals()[0]["decision"] == "opened"
    assert any("BUY EURUSD-T" in m for m in system.notifier.sent)


def test_evaluates_each_closed_bar_only_once(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    fake_mt5.close_externally(next(iter(fake_mt5.positions)), profit=-50)
    system.bot.run_once()  # misma vela: no reabre aunque ya no haya posición
    assert len(fake_mt5.sent) == 1


def test_one_position_per_symbol(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    system.bot._symbols["EURUSD"].last_bar = None  # forzar reevaluación con la posición aún abierta
    system.bot.run_once()
    assert len(fake_mt5.sent) == 1
    assert system.store.signals()[0]["decision"] == "blocked"


def test_records_closed_position_result(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    ticket = next(iter(fake_mt5.positions))
    fake_mt5.close_externally(ticket, profit=-49.5)
    system.bot.run_once()
    trade = system.store.trades()[0]
    assert trade["net_profit"] == -49.5 and trade["reason"] == "sl" and trade["result"] == "loss"
    assert trade["r_multiple"] < 0
    assert system.store.trade_stats()["losses"] == 1


def test_trade_closed_while_system_was_down_is_recorded(settings, fake_mt5):
    s1 = make_system(settings, fake_mt5)
    prepare(s1.bot, config(dry_run=False))
    s1.bot.run_once()
    ticket = next(iter(fake_mt5.positions))
    store = s1.store
    fake_mt5.close_externally(ticket, profit=30.0, reason=FakeMT5.DEAL_REASON_TP)
    # "reinicio": nuevo bot sobre la misma base de datos
    s2 = make_system(settings, fake_mt5)
    s2.bot.store = store
    prepare(s2.bot, config(dry_run=False))
    s2.bot.run_once()
    closed = next(t for t in store.trades() if t["ticket"] == ticket)
    assert closed["reason"] == "tp" and closed["net_profit"] == 30.0


def test_adopts_unknown_bot_positions(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    system.store._exec("DELETE FROM trades")
    system.bot.run_once()
    assert len(system.store.open_trades()) == 1


def test_rejected_order_is_logged(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    fake_mt5.reject_next = True
    system.bot.run_once()
    assert not fake_mt5.positions
    assert system.store.signals()[0]["decision"] == "rejected"
    assert system.bot.status()["trades_today"] == 0


def test_time_exit_closes_old_positions(system, fake_mt5):
    cfg = config(dry_run=False)
    cfg.params.max_bars_in_trade = 2
    prepare(system.bot, cfg)
    system.bot.run_once()
    next(iter(fake_mt5.positions.values())).time -= 3 * 15 * 60
    system.bot.run_once()
    assert not fake_mt5.positions


@pytest.mark.parametrize("age_bars,should_close", [(1, False), (3, True)])
def test_time_exit_with_server_in_utc_plus_3(random_walk_rates, settings, age_bars, should_close):
    fake = FakeMT5(rates={"EURUSD-T": random_walk_rates}, server_offset=3 * 3600)
    system = make_system(settings, fake)
    cfg = config(dry_run=False)
    cfg.params.max_bars_in_trade = 2
    prepare(system.bot, cfg)
    system.bot.run_once()
    next(iter(fake.positions.values())).time -= age_bars * 15 * 60
    system.bot.run_once()
    assert (len(fake.positions) == 0) == should_close


def test_day_state_survives_restart(system, fake_mt5):
    prepare(system.bot, config(dry_run=False))
    system.bot.run_once()
    assert system.bot._trades_today == 1
    system.bot._trades_today = 0
    system.bot._load_day_state()
    assert system.bot._trades_today == 1
    assert system.bot._day_start_equity > 0


def test_reconnects_after_mt5_disconnect(system, fake_mt5):
    prepare(system.bot, config(dry_run=True))
    fake_mt5.shutdown()  # el terminal se cae
    system.bot.run_once()  # se reconecta solo
    events = [e["event"] for e in system.store.events()]
    assert "mt5_disconnected" in events and "mt5_reconnected" in events
    assert system.ctx.client.is_connected()


def test_refuses_real_account(random_walk_rates, settings):
    system = make_system(settings, FakeMT5(mode=2, rates={"EURUSD-T": random_walk_rates}))
    with pytest.raises(RuntimeError, match="REAL"):
        system.bot.start(config(dry_run=False))


def test_real_account_dry_run_is_allowed(random_walk_rates, settings):
    system = make_system(settings, FakeMT5(mode=2, rates={"EURUSD-T": random_walk_rates}))
    system.bot._preflight(config(dry_run=True))


def test_real_account_live_needs_confirm(random_walk_rates, settings):
    settings.allow_real_account = True
    system = make_system(settings, FakeMT5(mode=2, rates={"EURUSD-T": random_walk_rates}))
    with pytest.raises(RuntimeError, match="Confirma"):
        system.bot.start(config(dry_run=False))
    system.bot.start(config(dry_run=False), confirm_real=True)
    assert system.bot.running
    system.bot.stop(by_user=True)


def test_requires_algo_trading(random_walk_rates, settings):
    system = make_system(settings, FakeMT5(algo=False, rates={"EURUSD-T": random_walk_rates}))
    with pytest.raises(RuntimeError, match="Algo Trading"):
        system.bot.start(config(dry_run=False))


def test_start_persists_config_and_stop_by_user_disables_autostart(system):
    system.bot.start(config(dry_run=True, poll_seconds=0.05))
    assert system.bot.running and system.bot.wants_to_run
    assert system.bot.saved_config().params.strategy == "always_buy"
    with pytest.raises(RuntimeError):
        system.bot.start(config())
    system.bot.stop(by_user=True)
    assert not system.bot.running and not system.bot.wants_to_run


def test_supervisor_resumes_bot_after_restart(system):
    system.bot.start(config(dry_run=True, poll_seconds=0.05))
    system.bot.stop(by_user=False)          # cierre del proceso, no del usuario
    assert system.bot.wants_to_run and not system.bot.running
    system.supervisor.check_once()
    assert system.bot.running
    assert system.store.events(event="bot_resumed")


def test_supervisor_waits_until_mt5_is_available(system, fake_mt5):
    system.bot.start(config(dry_run=True, poll_seconds=0.05))
    system.bot.stop(by_user=False)
    fake_mt5.initialize = lambda *a, **k: False   # MT5 aún no abrió
    fake_mt5.shutdown()
    system.supervisor.check_once()
    assert not system.bot.running and system.supervisor.last_start_error
    del fake_mt5.initialize                      # vuelve el terminal
    system.supervisor.check_once()
    assert system.bot.running


def test_supervisor_flags_frozen_bot(system):
    system.bot.start(config(dry_run=True, poll_seconds=0.05))
    time.sleep(0.2)
    system.bot._last_cycle = time.time() - 10_000   # simula un ciclo colgado
    ok, reason = system.supervisor.healthy()
    assert not ok and "no completa ciclos" in reason
    system.supervisor.check_once()
    assert system.store.events(event="bot_stale")


def test_bridge_files_are_published(system, settings):
    prepare(system.bot, config(dry_run=True))
    system.bot.run_once()
    system.bridge.publish(system.bot)
    folder = settings.data_dir / "common" / "TradeBot"
    status = (folder / "status.txt").read_text(encoding="utf-8")
    assert "mode=DRY_RUN" in status and "strategy=always_buy" in status
    line = (folder / "signals.txt").read_text(encoding="utf-8").strip().splitlines()[-1]
    fields = line.split("|")
    assert len(fields) == 13 and fields[2] == "EURUSD-T" and fields[3] == "buy" and fields[4] == "dry_run"
    # la flecha va en la vela de entrada (vela de señal + 15 min)
    from datetime import datetime
    bar = datetime.fromisoformat(system.store.signals()[0]["bar_time"])
    assert int(fields[1]) == int(bar.timestamp()) + 15 * 60


def test_bot_config_from_dict():
    cfg = BotConfig.from_dict({"symbols": "EURUSD, GBPUSD", "params": {"strategy": "macd", "timeframe": "5m"},
                               "limits": {"risk_per_trade_pct": 0.25}, "dry_run": False})
    assert cfg.symbols == ["EURUSD", "GBPUSD"]
    assert cfg.params.timeframe == "M5"
    assert cfg.limits.risk_per_trade_pct == 0.25
    assert cfg.dry_run is False


def test_notifier_dedupes_repeated_messages():
    from tradebot.notify import Notifier
    n = Notifier(dedupe_seconds=60)
    n.send("hola")
    n.send("hola")
    n.send("otra")
    assert n.sent == ["hola", "otra"]
