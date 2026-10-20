import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from fake_mt5 import FakeMT5, make_rates  # noqa: E402
from tradebot.broker.models import SymbolSpec  # noqa: E402
from tradebot.config import Settings  # noqa: E402
from tradebot.context import build_context  # noqa: E402


@pytest.fixture
def eurusd_spec() -> SymbolSpec:
    return SymbolSpec(
        name="EURUSD-T", digits=5, point=0.00001, tick_size=0.00001, tick_value=1.0,
        contract_size=100000, volume_min=0.01, volume_max=100, volume_step=0.01,
        stops_level=0, spread=10, filling_mode=3,
    )


@pytest.fixture
def random_walk_rates():
    rng = np.random.default_rng(42)
    closes = 1.10 + np.cumsum(rng.normal(0, 0.0008, 1500))
    return make_rates(list(closes))


@pytest.fixture
def fake_mt5(random_walk_rates) -> FakeMT5:
    return FakeMT5(rates={"EURUSD-T": random_walk_rates})


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(data_dir=tmp_path)


@pytest.fixture
def ctx(fake_mt5, settings):
    c = build_context(settings, api=fake_mt5)
    c.connect()
    return c


def make_system(settings, fake):
    from tradebot.app import build_system
    from tradebot.bridge import FileBridge

    system = build_system(settings, api=fake, in_memory_db=True, supervisor_interval=0.05)
    system.bridge.folder = settings.data_dir / "common" / "TradeBot"
    system.ctx.connect()
    return system


@pytest.fixture
def system(fake_mt5, settings):
    s = make_system(settings, fake_mt5)
    yield s
    s.supervisor.stop()
    if s.bot.running:
        s.bot.stop(by_user=False)


def frame(closes, start="2026-01-05 00:00", freq="15min", spread=10, wick=0.0002, opens=None, highs=None, lows=None):
    """DataFrame de velas para el backtest a partir de cierres (y opcionalmente OHLC explícitos)."""
    n = len(closes)
    times = pd.date_range(start, periods=n, freq=freq, tz="UTC")
    closes = np.asarray(closes, float)
    o = np.asarray(opens, float) if opens is not None else np.concatenate([[closes[0]], closes[:-1]])
    h = np.asarray(highs, float) if highs is not None else np.maximum(o, closes) + wick
    l = np.asarray(lows, float) if lows is not None else np.minimum(o, closes) - wick
    return pd.DataFrame({"time": times, "open": o, "high": h, "low": l, "close": closes,
                         "tick_volume": 100, "spread": spread})


# ── Velas sintéticas para los tests de estrategias ──────────────────────

from datetime import datetime, timedelta, timezone  # noqa: E402
from typing import Any, Dict, List  # noqa: E402


@pytest.fixture
def sample_candles_5m() -> List[Dict[str, Any]]:
    """200 velas simuladas 5m para pruebas de estrategias."""

    np.random.seed(42)
    base_price = 1.1000
    candles = []
    for i in range(200):
        ts = datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=5 * i)
        price = base_price + np.random.randn() * 0.002
        high = price + abs(np.random.randn() * 0.001)
        low = price - abs(np.random.randn() * 0.001)
        volume = np.random.randint(100, 10000)
        candles.append({
            'time': ts.timestamp(),
            'open': round(price, 5),
            'high': round(high, 5),
            'low': round(low, 5),
            'close': round(price, 5),
            'volume': volume,
        })
        base_price = price
    return candles


@pytest.fixture
def sample_candles_trend_up() -> List[Dict[str, Any]]:
    """Velas con tendencia alcista clara."""

    np.random.seed(123)
    candles = []
    base = 1.0800
    for i in range(200):
        trend = i * 0.0001  # Tendencia ascendente suave
        noise = np.random.randn() * 0.0005
        price = base + trend + noise
        high = price + abs(np.random.randn() * 0.0008)
        low = price - abs(np.random.randn() * 0.0008)
        candles.append({
            'time': (datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=5 * i)).timestamp(),
            'open': round(price - 0.0002, 5),
            'high': round(high, 5),
            'low': round(low, 5),
            'close': round(price, 5),
            'volume': 5000,
        })
    return candles


@pytest.fixture
def sample_candles_trend_down() -> List[Dict[str, Any]]:
    """Velas con tendencia bajista clara."""

    np.random.seed(456)
    candles = []
    base = 1.1200
    for i in range(200):
        trend = -i * 0.0001
        noise = np.random.randn() * 0.0005
        price = base + trend + noise
        high = price + abs(np.random.randn() * 0.0008)
        low = price - abs(np.random.randn() * 0.0008)
        candles.append({
            'time': (datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=5 * i)).timestamp(),
            'open': round(price + 0.0002, 5),
            'high': round(high, 5),
            'low': round(low, 5),
            'close': round(price, 5),
            'volume': 5000,
        })
    return candles


@pytest.fixture
def sample_candles_rsi_oversold() -> List[Dict[str, Any]]:
    """Velas que generan RSI < 30 (sobreventa)."""

    np.random.seed(789)
    candles = []
    price = 1.1000
    for i in range(200):
        if i > 150:
            price -= 0.003  # Caída fuerte al final
        else:
            price += np.random.randn() * 0.001
        high = price + 0.002
        low = price - 0.002
        candles.append({
            'time': (datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=5 * i)).timestamp(),
            'open': round(price - 0.0001, 5),
            'high': round(high, 5),
            'low': round(low, 5),
            'close': round(price, 5),
            'volume': 8000,
        })
    return candles


def authed_client(system):
    """Cliente de pruebas de la API con sesión de usuario iniciada."""
    from tradebot.api import create_app

    client = create_app(system).test_client()
    if system.auth.needs_setup():
        r = client.post("/api/auth/setup", json={"username": "admin", "password": "clave-segura-1"})
    else:
        r = client.post("/api/auth/login", json={"username": "admin", "password": "clave-segura-1"})
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {r.json['token']}"
    return client
