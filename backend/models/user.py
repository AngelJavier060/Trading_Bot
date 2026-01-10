from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class UserPreferences(BaseModel):
    """Preferencias de trading del usuario."""
    default_platform: str = "iqoption"
    default_account_type: str = "PRACTICE"
    default_asset: str = "EURUSD"
    default_amount: float = 1.0
    default_expiration: int = 1  # minutos
    risk_percentage: float = 2.0  # % del balance por operación
    max_daily_trades: Optional[int] = None
    max_daily_risk_amount: Optional[float] = None
    favorite_assets: List[str] = ["EURUSD", "GBPUSD", "USDJPY"]
    selected_strategies: List[str] = ["ema_rsi"]
    selected_timeframes: List[str] = ["1m", "5m"]


class UserSession(BaseModel):
    """Sesión activa del usuario."""
    user_id: Optional[str] = None
    email: Optional[str] = None
    is_authenticated: bool = False
    created_at: datetime = datetime.utcnow()
    expires_at: Optional[datetime] = None
    platform_sessions: List[str] = []  # Plataformas conectadas


class TradingStats(BaseModel):
    """Estadísticas de trading del usuario."""
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    total_profit: float = 0.0
    total_loss: float = 0.0
    net_profit: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    average_trade: float = 0.0
    current_streak: int = 0
    best_streak: int = 0
    worst_streak: int = 0
