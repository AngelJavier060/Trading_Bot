from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AccountInfo(BaseModel):
    """Modelo para información de cuenta de trading."""
    account_type: str  # "PRACTICE" o "REAL"
    balance: float
    currency: str = "USD"
    email: Optional[str] = None
    leverage: Optional[int] = None
    equity: Optional[float] = None
    margin: Optional[float] = None
    free_margin: Optional[float] = None
    server_time: Optional[datetime] = None


class AccountCredentials(BaseModel):
    """Credenciales para conexión a plataformas."""
    email: Optional[str] = None
    password: str
    login: Optional[int] = None  # Para MT5
    server: Optional[str] = None  # Para MT5


class AccountSession(BaseModel):
    """Estado de sesión de una cuenta conectada."""
    platform: str  # "iqoption", "mt5", "quotex"
    connected: bool = False
    account_type: str = "PRACTICE"
    last_sync: Optional[datetime] = None
    error_message: Optional[str] = None
