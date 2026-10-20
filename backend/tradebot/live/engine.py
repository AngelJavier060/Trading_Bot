"""Bot en vivo: escanea símbolos, abre operaciones y vigila su cierre.

Ciclo (cada `poll_seconds`):
  1. Comprueba la conexión con MT5 y se reconecta si hace falta.
  2. Lee cuenta y posiciones propias (filtradas por magic number).
  3. Registra en la base de datos las posiciones que se cerraron (SL/TP/manual) con su P&L real.
  4. Cierra por tiempo las que superan max_bars_in_trade.
  5. Por cada símbolo, cuando aparece una vela CERRADA nueva: estrategia -> filtro ML (opcional)
     -> límites de riesgo -> plan (SL/TP por ATR, lote por % de riesgo) -> orden a mercado.

La lógica de señal, filtro y plan es la misma del backtest (tradebot.planner).
La configuración y el estado del día se guardan en SQLite: tras un reinicio
el bot retoma donde estaba (ver Supervisor).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional

from ..broker import timeframes
from ..broker.models import MT5Error
from ..context import Context
from ..notify import Notifier
from ..ml.features import MIN_BARS as ML_MIN_BARS
from ..planner import StrategyParams, build_plan, current_atr, generate_signal, ml_probability
from ..risk import RiskContext, RiskLimits, check
from ..storage import Store
from ..strategies.base_strategy import SignalType

logger = logging.getLogger(__name__)

EQUITY_SNAPSHOT_SECONDS = 60
MAX_BACKOFF_SECONDS = 300


@dataclass
class BotConfig:
    symbols: list[str] = field(default_factory=lambda: ["EURUSD"])
    params: StrategyParams = field(default_factory=StrategyParams)
    limits: RiskLimits = field(default_factory=RiskLimits)
    poll_seconds: float = 10.0
    dry_run: bool = True   # True = solo registra señales, no envía órdenes

    @classmethod
    def from_dict(cls, data: dict) -> "BotConfig":
        data = dict(data or {})
        params = StrategyParams(**data.pop("params", {}))
        limits = RiskLimits(**data.pop("limits", {}))
        symbols = data.pop("symbols", ["EURUSD"])
        if isinstance(symbols, str):
            symbols = [s.strip() for s in symbols.split(",") if s.strip()]
        return cls(symbols=symbols, params=params, limits=limits, **data)

    def to_dict(self) -> dict:
        return {
            "symbols": self.symbols,
            "params": self.params.to_dict(),
            "limits": self.limits.to_dict(),
            "poll_seconds": self.poll_seconds,
            "dry_run": self.dry_run,
        }


MODEL_BOUND_PARAMS = ("strategy", "timeframe", "sl_atr_mult", "tp_atr_mult", "max_bars_in_trade", "min_sl_spread_mult")


def check_model_matches(model, params: StrategyParams) -> None:
    """El modelo aprendió con señales de una estrategia y unas reglas de salida concretas:
    usarlo con otras invalidaría sus probabilidades."""
    trained = model.info.params if model.info else {}
    current = params.to_dict()
    diffs = [f"{k}: modelo={trained.get(k)} bot={current.get(k)}"
             for k in MODEL_BOUND_PARAMS if k in trained and trained.get(k) != current.get(k)]
    if diffs:
        raise RuntimeError("El modelo ML se entrenó con otra configuración — " + "; ".join(diffs))


@dataclass
class SymbolState:
    last_bar: Optional[str] = None
    last_signal: Optional[dict] = None
    last_decision: str = ""
    error: str = ""


class TradingBot:
    def __init__(self, ctx: Context, store: Store, notifier: Optional[Notifier] = None,
                 on_cycle: Optional[Callable[["TradingBot"], None]] = None):
        self.ctx = ctx
        self.store = store
        self.notifier = notifier or Notifier()
        self.on_cycle = on_cycle            # p. ej. publicar el estado para el indicador de MT5
        self.config: Optional[BotConfig] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._strategies: dict = {}
        self._symbols: dict[str, SymbolState] = {}
        self._day: Optional[str] = None
        self._day_start_equity = 0.0
        self._trades_today = 0
        self._last_cycle: Optional[float] = None    # time.time() del último ciclo completo
        self._last_equity_snapshot = 0.0
        self._last_error = ""
        self._errors_in_a_row = 0
        self._was_disconnected = False
        self._started_at: Optional[str] = None
        self._account: Optional[int] = None     # login de la cuenta con la que opera el bot

    # ── control ─────────────────────────────────────────────────────────

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def wants_to_run(self) -> bool:
        """True si el usuario dejó el bot encendido (se retoma tras reinicios)."""
        return bool(self.store.get("bot_autostart", False)) and self.store.get("bot_config") is not None

    def saved_config(self) -> Optional[BotConfig]:
        raw = self.store.get("bot_config")
        return BotConfig.from_dict(raw) if raw else None

    def start(self, config: BotConfig, persist: bool = True, confirm_real: bool = False) -> None:
        if self.running:
            raise RuntimeError("El bot ya está en marcha")
        self._preflight(config, confirm_real=confirm_real)
        self.config = config
        self._strategies = {s: config.params.build_strategy() for s in config.symbols}
        self._symbols = {s: SymbolState() for s in config.symbols}
        self._load_day_state()
        self._stop.clear()
        self._errors_in_a_row = 0
        self._started_at = datetime.now(timezone.utc).isoformat()
        if persist:
            self.store.set("bot_config", config.to_dict())
            self.store.set("bot_autostart", True)
        self.store.log_event("bot_start", config=config.to_dict())
        self._thread = threading.Thread(target=self._loop, name="trading-bot", daemon=True)
        self._thread.start()
        mode = "DRY RUN (sin órdenes)" if config.dry_run else "OPERANDO"
        logger.info("Bot iniciado (%s) en %s", mode, config.symbols)
        self.notifier.send(f"▶️ Bot iniciado — {mode}\n{', '.join(config.symbols)} · {config.params.strategy} "
                           f"{config.params.timeframe} · riesgo {config.limits.risk_per_trade_pct}%")

    def stop(self, by_user: bool = True) -> None:
        """by_user=True: queda apagado tras reinicios. False: parada temporal (cierre del proceso)."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=30)
        if by_user:
            self.store.set("bot_autostart", False)
        if self.config is not None:
            self.store.log_event("bot_stop", by_user=by_user)
            if by_user:
                self.notifier.send("⏹️ Bot detenido")
        logger.info("Bot detenido")

    def _preflight(self, config: BotConfig, confirm_real: bool = False) -> None:
        """Comprobaciones antes de arrancar. Lanza RuntimeError con el motivo."""
        if not config.symbols:
            raise RuntimeError("No hay símbolos configurados")
        try:
            self._ensure_connection()
        except MT5Error as exc:
            err = self.ctx.client.last_error()
            raise RuntimeError(f"Sin conexión a MT5. last_error={err[0]} {err[1]}. {exc}") from exc
        account = self.ctx.client.account()
        if not config.dry_run:
            if not account.is_demo:
                if not self.ctx.settings.allow_real_account:
                    raise RuntimeError(
                        f"La cuenta {account.login} es CUENTA REAL. Para operar pon "
                        "ALLOW_REAL_ACCOUNT=true en .env (después de validar en demo) y confirma en el panel."
                    )
                if not confirm_real:
                    raise RuntimeError(
                        f"CUENTA REAL {account.login} @ {account.server}. Confirma en el panel que quieres "
                        "enviar órdenes con order_send a esta cuenta."
                    )
            if not account.trade_allowed:
                raise RuntimeError("El broker no permite operar en esta cuenta")
            if not self.ctx.client.terminal_status().get("algo_trading_enabled"):
                raise RuntimeError("Activa el botón 'Algo Trading' en el terminal MT5")
        for symbol in config.symbols:
            self.ctx.resolver.spec(symbol)  # valida que exista
        config.params.build_strategy()      # valida estrategia y parámetros
        if config.params.ml_model:
            from ..ml.registry import load_model
            check_model_matches(load_model(self.ctx.settings.models_dir, config.params.ml_model), config.params)

    # ── bucle ───────────────────────────────────────────────────────────

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.run_once()
                self._last_error = ""
                self._errors_in_a_row = 0
                wait = self.config.poll_seconds
            except Exception as exc:  # el bucle nunca debe morir por un error puntual
                self._errors_in_a_row += 1
                self._last_error = str(exc)
                wait = min(self.config.poll_seconds * 2 ** min(self._errors_in_a_row, 8), MAX_BACKOFF_SECONDS)
                logger.exception("Error en el ciclo del bot (reintento en %.0fs)", wait)
                self.store.log_event("error", message=str(exc))
                if self._errors_in_a_row in (1, 5, 20):
                    self.notifier.send(f"⚠️ Error en el bot ({self._errors_in_a_row} seguidos): {exc}")
            if self.on_cycle is not None:
                try:
                    self.on_cycle(self)
                except Exception:
                    logger.exception("Error publicando el estado")
            self._stop.wait(wait)

    def _ensure_connection(self) -> None:
        if self.ctx.client.is_connected():
            if self._was_disconnected:
                self._was_disconnected = False
                self.store.log_event("mt5_reconnected")
                self.notifier.send("🔌 MT5 reconectado")
            return
        if not self._was_disconnected:
            self._was_disconnected = True
            self.store.log_event("mt5_disconnected")
            self.notifier.send("🔌 MT5 desconectado — reintentando")
        self.ctx.connect()  # lanza MT5Error si no puede; el bucle reintenta con espera creciente
        self._was_disconnected = False
        self.store.log_event("mt5_reconnected")
        self.notifier.send("🔌 MT5 reconectado")

    def run_once(self) -> None:
        cfg = self.config
        if cfg is None:
            raise RuntimeError("Bot sin configuración")
        self._ensure_connection()
        account = self.ctx.client.account()
        self._account = account.login
        now = datetime.now(timezone.utc)
        self._roll_day(now, account.equity)

        positions = self.ctx.executor.positions()
        self._sync_trades(positions)
        positions = self._time_exits(positions, now)

        open_symbols = [p.symbol for p in positions]
        for symbol in cfg.symbols:
            state = self._symbols[symbol]
            try:
                opened = self._scan_symbol(symbol, state, account, open_symbols)
                if opened:
                    open_symbols.append(opened)
                state.error = ""
            except MT5Error as exc:
                state.error = str(exc)
                logger.warning("%s: %s", symbol, exc)

        if time.time() - self._last_equity_snapshot >= EQUITY_SNAPSHOT_SECONDS:
            acc = self.ctx.client.account()
            self.store.add_equity(acc.balance, acc.equity, len(open_symbols), account=acc.login)
            self._last_equity_snapshot = time.time()
        self._last_cycle = time.time()

    def _scan_symbol(self, symbol: str, state: SymbolState, account, open_symbols: list[str]) -> Optional[str]:
        cfg, ctx = self.config, self.ctx
        params = cfg.params
        # Con modelo ML se piden más velas para que sus features (EMA 100, rangos) se calculen
        # igual que en el backtest; la estrategia recibe solo las últimas `lookback`.
        count = max(params.lookback, ML_MIN_BARS) if params.ml_model else params.lookback
        df_full = ctx.market.candles(symbol, params.timeframe, count, closed_only=True)
        if df_full.empty:
            return None
        df = df_full.tail(params.lookback).reset_index(drop=True)
        bar = df["time"].iloc[-1].isoformat()
        if bar == state.last_bar:
            return None  # sin vela nueva: ya se evaluó
        state.last_bar = bar

        htf_df = None
        if params.htf_timeframe:
            htf_df = ctx.market.candles(symbol, params.htf_timeframe, params.lookback, closed_only=True)
        signal = generate_signal(self._strategies[symbol], df, htf_df, symbol)
        state.last_signal = {"bar": bar, "signal": signal.signal.value, "confidence": signal.confidence}
        if signal.signal == SignalType.NONE:
            state.last_decision = "sin señal"
            return None

        spec = ctx.resolver.spec(symbol)
        side = "buy" if signal.signal == SignalType.BUY else "sell"
        base = dict(bar_time=bar, symbol=spec.name, side=side, confidence=signal.confidence, strategy=params.strategy,
                    account=self._account)

        ml_prob = None
        if params.ml_model:
            from ..ml.registry import load_model
            model = load_model(ctx.settings.models_dir, params.ml_model)
            ml_prob = ml_probability(model, df_full, signal, spec.spread, spec.point)
            if ml_prob < params.ml_threshold:
                reason = f"ML: probabilidad {ml_prob:.2f} < umbral {params.ml_threshold:.2f}"
                return self._skip(state, base, reason, "ml_filtered", ml_prob)

        allowed, reason = check(
            cfg.limits,
            RiskContext(
                equity=account.equity,
                day_start_equity=self._day_start_equity,
                open_symbols=open_symbols,
                trades_today=self._trades_today,
                spread_points=spec.spread,
            ),
            spec.name,
        )
        if not allowed:
            return self._skip(state, base, reason, "blocked", ml_prob)

        tick = ctx.market.tick(symbol)
        entry = tick["ask"] if side == "buy" else tick["bid"]
        plan, reason = build_plan(
            signal, current_atr(df, params.atr_period), spec, account.balance, entry, params,
            cfg.limits.risk_per_trade_pct, spec.name,
        )
        if plan is None:
            return self._skip(state, base, reason, "blocked", ml_prob)
        levels = dict(entry=plan.entry, sl=plan.sl, tp=plan.tp, volume=plan.volume, ml_prob=ml_prob)

        if cfg.dry_run:
            state.last_decision = f"DRY RUN: {plan.side} {plan.volume} lotes"
            self.store.add_signal(**base, **levels, decision="dry_run", reason="modo dry run")
            return None

        result = ctx.executor.open_market(spec.name, plan.side, plan.volume, plan.sl, plan.tp,
                                          comment=f"bot {params.strategy}"[:31])
        if not result.ok:
            state.last_decision = f"orden rechazada: {result.retcode} {result.comment}"
            self.store.add_signal(**base, **levels, decision="rejected", reason=f"{result.retcode} {result.comment}")
            self.notifier.send(f"❌ Orden rechazada {spec.name} {side}: {result.retcode} {result.comment}")
            return None

        self._trades_today += 1
        self._save_day_state()
        self.store.add_signal(**base, **levels, decision="opened", ticket=result.ticket)
        self.store.open_trade(
            ticket=result.ticket, symbol=spec.name, side=side, volume=plan.volume, strategy=params.strategy,
            bar_time=bar, open_time=datetime.now(timezone.utc).isoformat(), open_price=result.price,
            sl=plan.sl, tp=plan.tp, risk_money=plan.risk_money, ml_prob=ml_prob, account=self._account,
        )
        state.last_decision = f"abierta {side} {plan.volume} lotes ticket {result.ticket}"
        self.notifier.send(f"🟢 {side.upper()} {spec.name} {plan.volume} lotes @ {result.price}\n"
                           f"SL {plan.sl} · TP {plan.tp} · riesgo {plan.risk_money:.2f}")
        return spec.name

    def _skip(self, state: SymbolState, base: dict, reason: str, decision: str, ml_prob=None) -> None:
        state.last_decision = f"{'filtrada' if decision == 'ml_filtered' else 'bloqueada'}: {reason}"
        self.store.add_signal(**base, decision=decision, reason=reason, ml_prob=ml_prob)
        return None

    # ── seguimiento de posiciones ───────────────────────────────────────

    def _sync_trades(self, positions) -> None:
        """Adopta posiciones propias desconocidas y registra el resultado de las que se cerraron."""
        known = {t["ticket"] for t in self.store.open_trades(account=self._account)}
        open_tickets = {p.ticket for p in positions}
        for p in positions:
            if p.ticket not in known:  # p. ej. abierta antes de que existiera la base de datos
                self.store.open_trade(ticket=p.ticket, symbol=p.symbol, side=p.side, volume=p.volume,
                                      open_time=p.time_open.isoformat(), open_price=p.price_open,
                                      sl=p.sl, tp=p.tp, account=self._account)
        for ticket in known - open_tickets:
            result = self.ctx.executor.closed_position_result(ticket, lookback_days=30)
            if result is None:
                continue  # el historial puede tardar unos segundos en aparecer
            self.store.close_trade(ticket, result["close_time"], result["close_price"], result["net_profit"],
                                   result["reason"], result["result"])
            self.store.log_event("close", **result)
            icon = "✅" if result["net_profit"] > 0 else "🔴"
            self.notifier.send(f"{icon} Cerrada #{ticket} ({result['reason']}): {result['net_profit']:+.2f}")
            logger.info("Posición %s cerrada: %s %+.2f", ticket, result["reason"], result["net_profit"])

    def _time_exits(self, positions, now: datetime):
        max_bars = self.config.params.max_bars_in_trade
        close_hour = int((self.config.params.strategy_params or {}).get("close_hour") or 0)
        limit_s = (max_bars * timeframes.minutes(self.config.params.timeframe) * 60) if max_bars else 0
        remaining = []
        for p in positions:
            by_bars = bool(limit_s) and (now - p.time_open).total_seconds() >= limit_s
            by_hour = close_hour > 0 and now.hour >= close_hour
            if (by_bars or by_hour) and not self.config.dry_run:
                result = self.ctx.executor.close_position(p.ticket, comment="time exit")
                self.store.log_event("time_exit", ticket=p.ticket, symbol=p.symbol, result=result.to_dict())
                if result.ok:
                    continue
            remaining.append(p)
        return remaining

    # ── estado diario (persistente) ─────────────────────────────────────

    def _load_day_state(self) -> None:
        state = self.store.get("day_state") or {}
        self._day = state.get("day")
        self._day_start_equity = float(state.get("day_start_equity", 0.0))
        self._trades_today = int(state.get("trades_today", 0))

    def _save_day_state(self) -> None:
        self.store.set("day_state", {"day": self._day, "day_start_equity": self._day_start_equity,
                                     "trades_today": self._trades_today})

    def _roll_day(self, now: datetime, equity: float) -> None:
        today = now.strftime("%Y-%m-%d")
        if today == self._day:
            return
        previous = self._day
        self._day = today
        self._day_start_equity = equity
        self._trades_today = 0
        self._save_day_state()
        if previous:
            stats = self.store.trade_stats(since=previous, account=self._account)
            self.notifier.send(
                f"📊 Resumen {previous}: {stats['trades']} ops · win {stats['win_rate']}% · "
                f"neto {stats['net_profit']:+.2f} · PF {stats['profit_factor']} · equity {equity:.2f}"
            )

    # ── estado ──────────────────────────────────────────────────────────

    def heartbeat_age(self) -> Optional[float]:
        return None if self._last_cycle is None else time.time() - self._last_cycle

    def status(self) -> dict:
        positions = []
        if self.ctx.client.is_connected():
            try:
                positions = [p.to_dict() for p in self.ctx.executor.positions(only_mine=False)]
            except MT5Error:
                pass
        age = self.heartbeat_age()
        return {
            "running": self.running,
            "wants_to_run": self.wants_to_run,
            "started_at": self._started_at,
            "heartbeat_age_s": round(age, 1) if age is not None else None,
            "last_error": self._last_error,
            "errors_in_a_row": self._errors_in_a_row,
            "config": self.config.to_dict() if self.config else None,
            "day": self._day,
            "day_start_equity": self._day_start_equity,
            "trades_today": self._trades_today,
            "symbols": {s: asdict(st) for s, st in self._symbols.items()},
            "open_positions": positions,
        }
