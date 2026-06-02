"""
Platform Manager - Multi-Platform Trading Bot
==============================================
Permite ejecutar bots de trading en MULTIPLES plataformas simultáneamente
(IQ Option + MT5 + Quotex), cada uno con su propio hilo de escaneo y
configuración independiente.

Arquitectura:
    PlatformManager
    ├── instances: Dict[str, BotInstance]
    │   ├── "iqoption" → BotInstance(platform="iqoption", thread, config)
    │   └── "mt5"      → BotInstance(platform="mt5", thread, config)
    ├── start_platform(platform, config)
    ├── stop_platform(platform)
    ├── get_status() → estado de todas las instancias
    └── start_all(configs) → inicia todas las plataformas configuradas

Cada BotInstance tiene:
    - Su propio hilo de escaneo (threading.Thread)
    - Su propia configuración (símbolos, estrategias, monto)
    - Su propio registro de trades activos
    - Acceso al mismo LiveTradingService para el motor de señales
"""

import logging
import threading
import time
from typing import Dict, Optional, Any, List, Callable
from datetime import datetime
from dataclasses import dataclass, field
from threading import Event

logger = logging.getLogger(__name__)


@dataclass
class PlatformConfig:
    """Configuración para una instancia de bot en una plataforma."""
    platform: str  # "iqoption", "mt5", "quotex"
    account_type: str = "PRACTICE"  # "PRACTICE"/"DEMO"/"REAL"
    mode: str = "manual"  # "auto" o "manual"
    symbols: List[str] = field(default_factory=lambda: ["EURUSD", "GBPUSD", "USDJPY"])
    strategies: List[str] = field(default_factory=lambda: ["ema_rsi"])
    amount: float = 10.0
    min_confidence: float = 68.0
    expiration: int = 5
    max_concurrent: int = 3
    max_daily_trades: int = 50
    use_ml: bool = True
    ml_weight: float = 0.20
    ml_min_probability: float = 0.55
    # Gestión de riesgo
    max_consecutive_losses: int = 3
    loss_streak_pause_minutes: int = 30
    reset_streak_on_win: bool = True
    daily_profit_target_type: str = "percent"
    daily_profit_target: float = 15.0
    daily_loss_limit_type: str = "percent"
    daily_loss_limit: float = 10.0
    # Filtros
    volatility_filter_enabled: bool = True
    atr_min_threshold: float = 0.03
    news_filter_enabled: bool = True

    def to_dict(self) -> Dict:
        return {
            "platform": self.platform,
            "account_type": self.account_type,
            "mode": self.mode,
            "symbols": self.symbols,
            "strategies": self.strategies,
            "amount": self.amount,
            "min_confidence": self.min_confidence,
            "expiration": self.expiration,
            "max_concurrent": self.max_concurrent,
            "max_daily_trades": self.max_daily_trades,
            "use_ml": self.use_ml,
            "ml_weight": self.ml_weight,
            "ml_min_probability": self.ml_min_probability,
        }


class BotInstance:
    """
    Una instancia individual del bot de trading para una plataforma específica.
    Ejecuta su propio hilo de escaneo independiente.
    """

    def __init__(self, config: PlatformConfig):
        self.config = config
        self._stop_event = Event()
        self._thread: Optional[threading.Thread] = None
        self.is_running = False
        self.is_scanning = False
        self.started_at: Optional[str] = None
        self.errors: List[str] = []
        self.last_scan_time: Optional[str] = None
        self.trades_count = 0

    def start(self):
        """Inicia el hilo de escaneo para esta plataforma."""
        if self._thread and self._thread.is_alive():
            logger.warning(f"BotInstance [{self.config.platform}] ya está corriendo")
            return

        self._stop_event.clear()
        self.is_running = True
        self.started_at = datetime.now().isoformat()
        self.errors = []

        self._thread = threading.Thread(
            target=self._scan_loop,
            daemon=True,
            name=f"bot-{self.config.platform}"
        )
        self._thread.start()

        logger.info(f"🤖 BotInstance [{self.config.platform}] iniciado")

    def stop(self):
        """Detiene el hilo de escaneo."""
        self._stop_event.set()
        self.is_running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        logger.info(f"🛑 BotInstance [{self.config.platform}] detenido")

    def _scan_loop(self):
        """Loop principal de escaneo para esta plataforma."""
        from services.trading.live_trading_service import live_trading_service

        scan_interval = 60  # 1 minuto entre escaneos

        while not self._stop_event.is_set():
            if self.config.mode != "auto":
                # En modo manual, esperar pero no escanear
                self._stop_event.wait(scan_interval)
                continue

            try:
                self.is_scanning = True
                self.last_scan_time = datetime.now().isoformat()

                # Delegar el escaneo al LiveTradingService
                # pero usando la configuración de esta plataforma
                live_trading_service._scan_and_trade_for_platform(
                    platform=self.config.platform,
                    symbols=self.config.symbols,
                    strategies=self.config.strategies,
                    amount=self.config.amount,
                    min_confidence=self.config.min_confidence,
                    expiration=self.config.expiration,
                    max_concurrent=self.config.max_concurrent,
                    max_daily_trades=self.config.max_daily_trades,
                )

                self.trades_count += 1

            except Exception as e:
                error_msg = f"Error en escaneo [{self.config.platform}]: {e}"
                logger.error(error_msg)
                self.errors.append(error_msg)
                if len(self.errors) > 100:
                    self.errors = self.errors[-100:]

            finally:
                self.is_scanning = False
                # Esperar el intervalo antes del próximo escaneo
                self._stop_event.wait(scan_interval)

    def get_status(self) -> Dict:
        """Devuelve el estado de esta instancia."""
        return {
            "platform": self.config.platform,
            "account_type": self.config.account_type,
            "mode": self.config.mode,
            "is_running": self.is_running,
            "is_scanning": self.is_scanning,
            "started_at": self.started_at,
            "last_scan_time": self.last_scan_time,
            "errors": self.errors[-5:],  # Últimos 5 errores
            "trades_count": self.trades_count,
            "symbols": self.config.symbols,
            "strategies": self.config.strategies,
            "amount": self.config.amount,
            "min_confidence": self.config.min_confidence,
            "expiration": self.config.expiration,
        }


class PlatformManager:
    """
    Gestor multi-plataforma. Permite tener múltiples bots ejecutándose
    simultáneamente en diferentes plataformas.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.instances: Dict[str, BotInstance] = {}

    def start_platform(self, config: PlatformConfig) -> Dict:
        """
        Inicia una instancia de bot para la plataforma especificada.

        Args:
            config: Configuración de la plataforma.

        Returns:
            Dict con resultado de la operación.
        """
        platform = config.platform

        with self._lock:
            # Si ya existe una instancia para esta plataforma, detenerla primero
            if platform in self.instances:
                logger.info(f"Reemplazando instancia existente para [{platform}]")
                self.instances[platform].stop()
                del self.instances[platform]

            # Verificar conexión con la plataforma
            if platform == "iqoption":
                from services.trading_service import trading_service
                iq = trading_service.get_iq_option()
                if not iq:
                    return {
                        "status": "error",
                        "message": f"No hay conexión con {platform}. Conecta primero.",
                        "platform": platform,
                    }

            # Crear y arrancar la nueva instancia
            instance = BotInstance(config)
            instance.start()
            self.instances[platform] = instance

            logger.info(f"✅ PlatformManager: {platform} iniciado correctamente")

            return {
                "status": "success",
                "message": f"Bot para {platform} iniciado",
                "platform": platform,
                "instance_status": instance.get_status(),
            }

    def stop_platform(self, platform: str) -> Dict:
        """
        Detiene la instancia de una plataforma específica.

        Args:
            platform: "iqoption", "mt5", "quotex"

        Returns:
            Dict con resultado.
        """
        with self._lock:
            if platform not in self.instances:
                return {
                    "status": "error",
                    "message": f"No hay instancia activa para {platform}",
                    "platform": platform,
                }

            instance = self.instances[platform]
            instance.stop()
            del self.instances[platform]

            logger.info(f"🛑 PlatformManager: {platform} detenido")

            return {
                "status": "success",
                "message": f"Bot para {platform} detenido",
                "platform": platform,
            }

    def stop_all(self):
        """Detiene todas las instancias."""
        with self._lock:
            platforms = list(self.instances.keys())
            for platform in platforms:
                self.instances[platform].stop()
                del self.instances[platform]
            logger.info("🛑 PlatformManager: Todas las instancias detenidas")

    def update_config(self, platform: str, updates: Dict) -> Dict:
        """
        Actualiza la configuración de una plataforma en caliente.

        Args:
            platform: "iqoption", "mt5", "quotex"
            updates: Diccionario con campos a actualizar.

        Returns:
            Dict con resultado.
        """
        with self._lock:
            if platform not in self.instances:
                return {
                    "status": "error",
                    "message": f"No hay instancia activa para {platform}",
                }

            instance = self.instances[platform]

            # Actualizar campos permitidos
            allowed_fields = [
                "mode", "symbols", "strategies", "amount",
                "min_confidence", "expiration", "max_concurrent",
                "max_daily_trades", "use_ml", "ml_weight",
                "ml_min_probability",
            ]

            for key, value in updates.items():
                if key in allowed_fields:
                    setattr(instance.config, key, value)

            # Si se cambió el modo, se refleja en el próximo ciclo
            logger.info(f"⚙️ Configuración actualizada para {platform}: {updates}")

            return {
                "status": "success",
                "message": f"Configuración de {platform} actualizada",
                "current_config": instance.config.to_dict(),
            }

    def get_status(self) -> Dict:
        """
        Devuelve el estado de todas las plataformas.

        Returns:
            Dict con estado de cada plataforma + resumen.
        """
        with self._lock:
            platforms_status = {}
            for platform, instance in self.instances.items():
                platforms_status[platform] = instance.get_status()

            # También incluir estado de conexión de cada plataforma
            from services.trading_service import trading_service

            connection_status = {}
            try:
                iq = trading_service.get_iq_option()
                connection_status["iqoption"] = {
                    "connected": iq is not None and bool(iq.check_connect()) if iq else False,
                }
            except Exception:
                connection_status["iqoption"] = {"connected": False}

            try:
                mt5 = trading_service.get_mt5()
                connection_status["mt5"] = {
                    "connected": mt5 is not None,
                }
            except Exception:
                connection_status["mt5"] = {"connected": False}

            return {
                "total_instances": len(self.instances),
                "instances": platforms_status,
                "connection_status": connection_status,
            }

    def get_platform_status(self, platform: str) -> Optional[Dict]:
        """Devuelve el estado de una plataforma específica."""
        with self._lock:
            instance = self.instances.get(platform)
            if instance:
                return instance.get_status()
            return None

    def is_platform_running(self, platform: str) -> bool:
        """Verifica si una plataforma específica está activa."""
        with self._lock:
            instance = self.instances.get(platform)
            return instance is not None and instance.is_running


# ── Parche al LiveTradingService ──────────────────────────────────────────
# Agregamos el método _scan_and_trade_for_platform al LiveTradingService
# para que PlatformManager pueda delegar escaneos por plataforma

def _patch_live_trading_service():
    """
    Parchea LiveTradingService para agregar el método
    _scan_and_trade_for_platform necesario para PlatformManager.
    """
    from services.trading.live_trading_service import live_trading_service

    if hasattr(live_trading_service, '_scan_and_trade_for_platform'):
        return  # Ya parcheado

    def _scan_and_trade_for_platform(self, platform, symbols, strategies, amount,
                                     min_confidence, expiration, max_concurrent,
                                     max_daily_trades):
        """
        Escanea y opera para una plataforma especifica.
        Version FIX: usa IQ Option API directamente.
        """
        try:
            from services.trading.live_trading_service import logger as svc_logger
            svc_logger.info(f"Escaneando [{platform}] simbolos: {symbols}")

            # Obtener API de IQ Option desde trading_service
            from services.trading_service import trading_service
            iq_api = trading_service.get_iq_option()

            if not iq_api:
                svc_logger.warning(f"IQ Option no disponible en trading_service")
                return

            # Verificar conexion
            try:
                if not iq_api.check_connect():
                    svc_logger.error("IQ Option API no conectada")
                    return
            except Exception as e:
                svc_logger.error(f"Error verificando conexion IQ: {e}")
                return

            import time as ttime
            from services.strategies import get_strategy
            import pandas as pd

            for symbol in symbols:
                for strategy_name in strategies:
                    try:
                        # Obtener velas DIRECTAMENTE de IQ Option API
                        candles_raw = iq_api.get_candles(symbol, 60, 200, ttime.time())
                        if not candles_raw:
                            continue

                        # Convertir a DataFrame
                        df = pd.DataFrame(candles_raw)
                        if df.empty:
                            continue

                        # Asegurar columna close
                        df.columns = [c.lower() for c in df.columns]
                        if 'close' not in df.columns:
                            if 'price' in df.columns:
                                df['close'] = df['price']
                            elif 'price_close' in df.columns:
                                df['close'] = df['price_close']
                            else:
                                continue

                        # Analizar senal
                        strategy = get_strategy(strategy_name)
                        # Ensure no duplicate columns
                        df = df.loc[:, ~df.columns.duplicated()]
                        candles_list = df.to_dict('records')
                        signal = strategy.analyze(candles_list, None, asset=symbol)
                        signal_dict = signal.to_dict() if hasattr(signal, 'to_dict') else signal

                        sig_type = signal_dict.get('signal', 'none')
                        confidence = float(signal_dict.get('confidence', 0))

                        svc_logger.info(f"  {symbol}: {sig_type} conf={confidence:.0f}% (umbral={min_confidence})")

                        if sig_type in ('call', 'put') and confidence >= min_confidence:
                            indicators = signal_dict.get('indicators', {})
                            entry_price = float(indicators.get('close', 0))
                            if entry_price <= 0:
                                entry_price = float(df['close'].iloc[-1])

                            if entry_price > 0:
                                try:
                                    # Ejecutar trade usando execute_and_monitor_trade
                                    # (este metodo SI coloca la orden en IQ Option)
                                    from services.trading.live_trading_service import live_trading_service
                                    result = live_trading_service.execute_and_monitor_trade(
                                        symbol=symbol,
                                        direction=sig_type,
                                        amount=amount,
                                        strategy=strategy_name,
                                        confidence=confidence,
                                        indicators=indicators,
                                        reasons=signal_dict.get('reasons', []),
                                        platform=platform,
                                        account_type=self.status.get('account_type', 'PRACTICE'),
                                        expiration=expiration,
                                    )
                                    svc_logger.info(f"TRADE EJECUTADO: {symbol} {sig_type} ${amount} conf={confidence:.0f}%")
                                except Exception as e:
                                    svc_logger.error(f"Error ejecutando trade {symbol}: {e}")
                            else:
                                svc_logger.warning(f"Sin precio de entrada para {symbol}")

                    except Exception as e:
                        svc_logger.error(f"Error analizando {symbol} [{platform}]: {e}")

        except Exception as e:
            logger.error(f"Error en _scan_and_trade_for_platform: {e}")

    # Agregar el método al live_trading_service
    import types
    live_trading_service._scan_and_trade_for_platform = types.MethodType(
        _scan_and_trade_for_platform, live_trading_service
    )
    logger.info("🔧 LiveTradingService parcheado para PlatformManager")


# Aplicar el parche al importar
_patch_live_trading_service()

# Instancia global
platform_manager = PlatformManager()
