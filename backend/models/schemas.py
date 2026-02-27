from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any

class CredentialsSchema(BaseModel):
    email: Optional[str] = None
    password: str
    login: Optional[int] = None # Para MT5
    server: Optional[str] = None # Para MT5 - servidor personalizado
    terminal_path: Optional[str] = None # Ruta del terminal MT5 opcional

class ConnectSchema(BaseModel):
    platform: Optional[str] = "iqoption"
    credentials: CredentialsSchema
    account_type: Optional[str] = "PRACTICE"
    is_demo: Optional[bool] = True # Para MT5

class OrderSchema(BaseModel):
    asset: Optional[str] = None
    symbol: Optional[str] = None  # Alias for asset
    amount: float = Field(gt=0)
    direction: str # "call" or "put"
    expiration: int = Field(ge=1, default=5) # minutos
    strategy: Optional[str] = None
    explanation: Optional[str] = None
    
    def get_asset(self) -> str:
        """Get asset from either asset or symbol field"""
        return self.asset or self.symbol or "EURUSD"

class SwitchAccountSchema(BaseModel):
    account_type: str # "REAL" or "PRACTICE"

class CloseOrderSchema(BaseModel):
    order_id: int

class StrategySchema(BaseModel):
    asset: str = "EURUSD"
    interval: int = 60
    n_candles: int = 100
    amount: Optional[float] = None
    expiration: Optional[int] = None
    auto_execute: bool = False

class ConfigSchema(BaseModel):
    platform: str
    marketType: str
    risk: float
    timeframes: List[str]
    strategies: List[str]
    max_daily_trades: Optional[int] = None
    max_daily_risk_amount: Optional[float] = None

class ScanSchema(BaseModel):
    assets: Optional[str] = "EURUSD,GBPUSD,USDJPY,AUDUSD,EURJPY"
    interval: Optional[int] = 60
    n_candles: Optional[int] = 50
