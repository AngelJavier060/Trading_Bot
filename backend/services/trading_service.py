import logging
from typing import Dict, Any, Optional
from iqoptionapi.stable_api import IQ_Option

class TradingService:
    """
    Servicio centralizado para gestionar todas las conexiones de trading.
    Actúa como un singleton para mantener el estado de las sesiones.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TradingService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self.sessions: Dict[str, Any] = {
            'iqoption': None,
            'mt5': None,
            'quotex': None
        }
        self.active_platform: Optional[str] = None
        self._initialized = True
        logging.info("TradingService inicializado")

    # IQ Option
    def get_iq_option(self) -> Optional[IQ_Option]:
        instance = self.sessions.get('iqoption')
        if not instance:
            return None

        try:
            if instance.check_connect():
                return instance
        except Exception:
            pass

        logging.warning("Conexión de IQ Option perdida. Intentando reconectar...")
        try:
            instance.connect()
        except Exception as e:
            logging.error(f"Error al reconectar IQ Option: {e}")

        try:
            if instance.check_connect():
                return instance
        except Exception:
            pass

        self.sessions['iqoption'] = None
        self.active_platform = None
        return None

    def set_iq_option(self, instance: IQ_Option):
        self.sessions['iqoption'] = instance
        self.active_platform = 'iqoption'
        logging.info("Nueva sesión de IQ Option registrada en TradingService")

    # MT5
    def get_mt5(self):
        instance = self.sessions.get('mt5')
        if instance:
            import MetaTrader5 as mt5
            # MT5 no tiene un 'check_connect' directo tan simple como IQ, 
            # pero podemos intentar obtener info básica.
            if mt5.account_info() is None:
                logging.warning("Conexión de MetaTrader 5 perdida.")
                self.sessions['mt5'] = None
                return None
        return instance

    def set_mt5(self, connection_info: dict):
        self.sessions['mt5'] = connection_info
        self.active_platform = 'mt5'
        logging.info("Nueva sesión de MT5 registrada en TradingService")

    # Quotex
    def get_quotex_driver(self):
        driver = self.sessions.get('quotex')
        if driver:
            try:
                # Verificar si el navegador sigue vivo
                driver.current_url
            except Exception:
                logging.warning("Driver de Quotex (Selenium) no responde.")
                self.sessions['quotex'] = None
                return None
        return driver

    def set_quotex_driver(self, driver):
        self.sessions['quotex'] = driver
        self.active_platform = 'quotex'

    def disconnect_all(self):
        # IQ Option
        if self.sessions['iqoption']:
            try:
                self.sessions['iqoption'].disconnect()
            except Exception as e:
                logging.error(f"Error al desconectar IQ Option: {e}")
            self.sessions['iqoption'] = None
        
        # MT5
        if self.sessions['mt5']:
            try:
                import MetaTrader5 as mt5
                mt5.shutdown()
            except Exception as e:
                logging.error(f"Error al cerrar MT5: {e}")
            self.sessions['mt5'] = None

        # Quotex
        if self.sessions['quotex']:
            try:
                self.sessions['quotex'].quit()
            except Exception as e:
                logging.error(f"Error al cerrar driver Quotex: {e}")
            self.sessions['quotex'] = None
        
        self.active_platform = None
        logging.info("Todas las sesiones de trading cerradas")

# Instancia global del servicio
trading_service = TradingService()
