"""Puente con MT5: publica el estado y las señales del bot para verlos en el gráfico.

Formato de texto simple (fácil de leer en MQL5), en dos archivos:

  status.txt   líneas clave=valor
  signals.txt  una señal por línea, campos separados por '|':
               id|tiempo_servidor|symbol|side|decision|entry|sl|tp|volume|confidence|ml_prob|ticket|reason

- En la misma máquina (VPS): se escriben en <Terminal>\\Common\\Files\\TradeBot\\ y el
  indicador TradeBotMonitor los lee.
- Desde otro PC: el EA TradeBotRemote pide lo mismo a la API
  (/api/bridge/status.txt y /api/bridge/signals.txt).

`tiempo_servidor` es la apertura de la vela de entrada en hora del servidor del
broker (la que usan los gráficos de MT5), en segundos Unix.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from .broker import timeframes

if TYPE_CHECKING:
    from .live.engine import TradingBot

logger = logging.getLogger(__name__)

SIGNAL_FIELDS = ["id", "time", "symbol", "side", "decision", "entry", "sl", "tp", "volume",
                 "confidence", "ml_prob", "ticket", "reason"]


def _clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return str(value).replace("|", "/").replace("\n", " ").replace("\r", " ")


def render_status(bot: "TradingBot") -> str:
    st = bot.status()
    cfg = st.get("config") or {}
    params = cfg.get("params", {})
    lines = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "running": int(st["running"]),
        "mode": ("DRY_RUN" if cfg.get("dry_run") else "LIVE") if cfg else "-",
        "strategy": params.get("strategy", "-"),
        "timeframe": params.get("timeframe", "-"),
        "ml_model": params.get("ml_model") or "-",
        "symbols": ",".join(cfg.get("symbols", [])),
        "heartbeat_age": st["heartbeat_age_s"] if st["heartbeat_age_s"] is not None else "-",
        "trades_today": st["trades_today"],
        "open_positions": len(st["open_positions"]),
        "floating_pnl": round(sum(p["profit"] for p in st["open_positions"]), 2),
        "last_error": st["last_error"] or "-",
    }
    try:
        acc = bot.ctx.client.account()
        lines["equity"] = round(acc.equity, 2)
        lines["day_pnl"] = round(acc.equity - st["day_start_equity"], 2) if st["day_start_equity"] else 0
    except Exception:
        lines["equity"] = "-"
    try:
        login = bot.ctx.client.account().login
    except Exception:
        login = None
    total = bot.store.trade_stats(account=login)
    lines.update({
        "stats_trades": total["trades"], "stats_win_rate": total["win_rate"],
        "stats_pf": total["profit_factor"], "stats_net": total["net_profit"], "stats_avg_r": total["avg_r"],
    })
    return "\n".join(f"{k}={_clean(v)}" for k, v in lines.items()) + "\n"


def render_signals(bot: "TradingBot", limit: int = 300, symbol: Optional[str] = None) -> str:
    tf_min = timeframes.minutes(bot.config.params.timeframe) if bot.config else 0
    try:
        offset = bot.ctx.client.utc_offset()
    except Exception:
        offset = 0
    out = []
    try:
        login = bot.ctx.client.account().login
    except Exception:
        login = None
    for s in reversed(bot.store.signals(limit=limit, symbol=symbol, account=login)):
        bar = datetime.fromisoformat(s["bar_time"])
        # la flecha va en la vela de ENTRADA (la siguiente a la última cerrada)
        entry_epoch = int(bar.timestamp()) + tf_min * 60 + offset
        row = {**s, "time": entry_epoch}
        out.append("|".join(_clean(row.get(f)) for f in SIGNAL_FIELDS))
    return "\n".join(out) + ("\n" if out else "")


def common_files_dir(bot: "TradingBot") -> Optional[Path]:
    configured = bot.ctx.settings.mt5_common_files
    if configured:
        return Path(configured)
    try:
        info = bot.ctx.client.call("terminal_info")
        return Path(info.commondata_path) / "Files" if info and info.commondata_path else None
    except Exception:
        return None


class FileBridge:
    """Escribe status.txt y signals.txt en Common\\Files\\TradeBot de MT5 tras cada ciclo."""

    def __init__(self, folder: Optional[Path] = None):
        self.folder = folder
        self.last_error = ""

    def publish(self, bot: "TradingBot") -> None:
        folder = self.folder
        if folder is None:
            base = common_files_dir(bot)
            if base is None:
                return
            folder = self.folder = base / "TradeBot"
        try:
            folder.mkdir(parents=True, exist_ok=True)
            _atomic_write(folder / "status.txt", render_status(bot))
            _atomic_write(folder / "signals.txt", render_signals(bot))
            self.last_error = ""
        except OSError as exc:
            if str(exc) != self.last_error:
                logger.warning("No se pudo escribir el puente MT5 en %s: %s", folder, exc)
            self.last_error = str(exc)


def _atomic_write(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    # MT5 puede tener el archivo abierto un instante mientras lo lee: reintentar
    for attempt in range(5):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.05)
