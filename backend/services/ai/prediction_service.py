import pandas as pd
from typing import List, Dict, Optional


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Calcula RSI de forma simple a partir de una serie de precios de cierre."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()

    # Evitar divisiones por cero
    avg_loss = avg_loss.replace(0, 1e-9)

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def basic_ema_rsi_decision(
    candles: List[Dict],
    fast: int = 9,
    slow: int = 21,
    rsi_period: int = 14,
    rsi_overbought: float = 70,
    rsi_oversold: float = 30,
) -> Dict:
    if not candles:
        return {
            "signal": None,
            "confidence": 0.0,
            "indicators": {},
            "reasons": [
                {
                    "rule": "data",
                    "detail": "Sin velas disponibles para calcular señal"
                }
            ],
        }

    df = pd.DataFrame(candles)
    if "close" not in df.columns:
        return {
            "signal": None,
            "confidence": 0.0,
            "indicators": {},
            "reasons": [
                {
                    "rule": "data",
                    "detail": "El dataset de velas no contiene la columna 'close'"
                }
            ],
        }

    if "from" in df.columns:
        df = df.sort_values("from")
    elif "time" in df.columns:
        df = df.sort_values("time")

    closes = df["close"].astype(float)
    last_close = float(closes.iloc[-1])

    df["ema_fast"] = closes.ewm(span=fast, adjust=False).mean()
    df["ema_slow"] = closes.ewm(span=slow, adjust=False).mean()
    df["rsi"] = _compute_rsi(closes, period=rsi_period)

    last = df.iloc[-1]
    ema_fast = float(last["ema_fast"])
    ema_slow = float(last["ema_slow"])
    rsi = float(last["rsi"]) if pd.notna(last["rsi"]) else float("nan")

    ema_diff = ema_fast - ema_slow

    reasons = []
    signal: Optional[str] = None

    if ema_fast > ema_slow:
        reasons.append({
            "rule": "ema_trend",
            "detail": f"EMA{fast} ({ema_fast:.6f}) > EMA{slow} ({ema_slow:.6f}) => sesgo alcista"
        })
        if pd.notna(rsi) and rsi < rsi_overbought:
            reasons.append({
                "rule": "rsi_filter",
                "detail": f"RSI{rsi_period} ({rsi:.2f}) < {rsi_overbought} => no sobrecompra"
            })
            signal = "call"
        else:
            reasons.append({
                "rule": "rsi_block",
                "detail": f"RSI{rsi_period} ({rsi:.2f}) >= {rsi_overbought} => sobrecompra, se evita entrada"
            })
    elif ema_fast < ema_slow:
        reasons.append({
            "rule": "ema_trend",
            "detail": f"EMA{fast} ({ema_fast:.6f}) < EMA{slow} ({ema_slow:.6f}) => sesgo bajista"
        })
        if pd.notna(rsi) and rsi > rsi_oversold:
            reasons.append({
                "rule": "rsi_filter",
                "detail": f"RSI{rsi_period} ({rsi:.2f}) > {rsi_oversold} => no sobreventa"
            })
            signal = "put"
        else:
            reasons.append({
                "rule": "rsi_block",
                "detail": f"RSI{rsi_period} ({rsi:.2f}) <= {rsi_oversold} => sobreventa, se evita entrada"
            })
    else:
        reasons.append({
            "rule": "ema_flat",
            "detail": "EMA rápida y lenta iguales => sin tendencia clara"
        })

    trend_strength = abs(ema_diff) / last_close if last_close else 0.0
    trend_score = min(1.0, trend_strength * 200.0)

    if signal == "call" and pd.notna(rsi):
        rsi_score = max(0.0, min(1.0, (rsi_overbought - rsi) / rsi_overbought))
    elif signal == "put" and pd.notna(rsi):
        rsi_score = max(0.0, min(1.0, (rsi - rsi_oversold) / (100.0 - rsi_oversold)))
    else:
        rsi_score = 0.0

    confidence = float(max(0.0, min(1.0, 0.6 * trend_score + 0.4 * rsi_score)))

    return {
        "signal": signal,
        "confidence": confidence,
        "indicators": {
            "close": last_close,
            "ema_fast": ema_fast,
            "ema_slow": ema_slow,
            "ema_diff": ema_diff,
            "rsi": None if not pd.notna(rsi) else rsi,
            "rsi_overbought": rsi_overbought,
            "rsi_oversold": rsi_oversold,
        },
        "reasons": reasons,
    }


def basic_ema_rsi_signal(candles: List[Dict], fast: int = 9, slow: int = 21, rsi_period: int = 14) -> Optional[str]:
    decision = basic_ema_rsi_decision(
        candles=candles,
        fast=fast,
        slow=slow,
        rsi_period=rsi_period,
    )
    return decision.get("signal")
