from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class IndicatorValues(BaseModel):
    """Valores de indicadores técnicos."""
    close: Optional[float] = None
    ema_fast: Optional[float] = None
    ema_slow: Optional[float] = None
    ema_diff: Optional[float] = None
    rsi: Optional[float] = None
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    bollinger_upper: Optional[float] = None
    bollinger_lower: Optional[float] = None


class SignalReason(BaseModel):
    """Razón individual para una decisión de trading."""
    rule: str  # Ej: "ema_trend", "rsi_filter", "macd_cross"
    detail: str  # Explicación legible


class TradingSignal(BaseModel):
    """Señal de trading generada por el sistema de IA."""
    asset: str
    signal: Optional[str] = None  # "call", "put", o None
    confidence: float = 0.0
    indicators: IndicatorValues = IndicatorValues()
    reasons: List[SignalReason] = []
    timestamp: datetime = datetime.utcnow()
    strategy: str = "ema_rsi"


class ScanResult(BaseModel):
    """Resultado del escaneo de múltiples activos."""
    asset: str
    status: str  # "success" o "error"
    decision: Optional[TradingSignal] = None
    message: Optional[str] = None


class StrategyConfig(BaseModel):
    """Configuración de parámetros de estrategia."""
    name: str
    enabled: bool = True
    params: Dict[str, Any] = {}
    weight: float = 1.0  # Para estrategias combinadas
