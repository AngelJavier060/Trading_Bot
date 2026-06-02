"""
Fix: Reemplazar _scan_and_trade_for_platform para usar IQ Option API directamente
"""
import sys, os
sys.path.insert(0, '.')
os.environ['PYTHONIOENCODING'] = 'utf-8'

from services.trading.live_trading_service import live_trading_service
import types
import logging

logger = logging.getLogger(__name__)


def _scan_and_trade_for_platform_fixed(self, platform, symbols, strategies, amount,
                                        min_confidence, expiration, max_concurrent,
                                        max_daily_trades):
    """
    Escanea y opera para una plataforma especifica.
    Version FIX: usa IQ Option API directamente en vez de unified_data_service.
    """
    try:
        svc_logger = logging.getLogger('platform_manager.scan')
        svc_logger.info(f'Escaneando [{platform}] simbolos: {symbols}')

        # Obtener API de IQ Option directamente desde trading_service
        from services.trading_service import trading_service
        iq_api = trading_service.get_iq_option()

        if not iq_api:
            # Intentar obtener desde auto_connector
            from services.trading.auto_connector import auto_connector
            status = auto_connector.get_status()
            svc_logger.info(f'AutoConnector status: {status.get("platforms", {}).get("iqoption", {})}')
            
            # Si auto_connector dice conectado pero trading_service no lo tiene,
            # necesitamos sincronizar
            svc_logger.warning('IQ Option no disponible en trading_service')
            return

        # Verificar conexion
        try:
            check = iq_api.check_connect()
            if not check:
                svc_logger.error('IQ Option API no conectada')
                return
        except Exception as e:
            svc_logger.error(f'Error verificando conexion IQ: {e}')
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

                    # Asegurar columnas necesarias
                    df.columns = [c.lower() for c in df.columns]
                    if 'close' not in df.columns:
                        # Mapear nombre de columna
                        if 'price' in df.columns:
                            df['close'] = df['price']
                        elif 'price_close' in df.columns:
                            df['close'] = df['price_close']
                        else:
                            continue

                    # Analizar senal
                    strategy = get_strategy(strategy_name)
                    candles_list = df.to_dict('records')
                    signal = strategy.analyze(candles_list)
                    signal_dict = signal.to_dict() if hasattr(signal, 'to_dict') else signal

                    sig_type = signal_dict.get('signal', 'none')
                    confidence = float(signal_dict.get('confidence', 0))

                    svc_logger.info(f'  {symbol}: {sig_type} conf={confidence:.0f}% (umbral={min_confidence})')

                    if sig_type in ('call', 'put') and confidence >= min_confidence:
                        indicators = signal_dict.get('indicators', {})
                        entry_price = float(indicators.get('close', 0))
                        if entry_price <= 0:
                            entry_price = float(df['close'].iloc[-1])

                        if entry_price > 0:
                            try:
                                # Ejecutar trade
                                result = live_trading_service.execute_trade(
                                    platform=platform,
                                    account_type=self.status.get('account_type', 'PRACTICE'),
                                    symbol=symbol,
                                    direction=sig_type,
                                    amount=amount,
                                    entry_price=entry_price,
                                    confidence=confidence,
                                    strategy_used=strategy_name,
                                    indicators=indicators,
                                    reasons=signal_dict.get('reasons', []),
                                )
                                # Loggear resultado
                                from services.trade_logger import log_trade
                                log_trade(
                                    event_type='trade_executed',
                                    source=f'platform_manager.{platform}',
                                    symbol=symbol,
                                    direction=sig_type,
                                    amount=amount,
                                    price=entry_price,
                                    confidence=confidence,
                                    strategy=strategy_name,
                                    platform=platform,
                                    account_type=self.status.get('account_type', 'PRACTICE'),
                                )
                                svc_logger.info(f'TRADE EJECUTADO: {symbol} {sig_type} ${amount} conf={confidence:.0f}%')
                            except Exception as e:
                                svc_logger.error(f'Error ejecutando trade {symbol}: {e}')
                        else:
                            svc_logger.warning(f'Sin precio de entrada para {symbol}')

                except Exception as e:
                    svc_logger.error(f'Error analizando {symbol} [{platform}]: {e}')

    except Exception as e:
        logger.error(f'Error en _scan_and_trade_for_platform: {e}')


# Aplicar el fix
live_trading_service._scan_and_trade_for_platform = types.MethodType(
    _scan_and_trade_for_platform_fixed, live_trading_service
)

print('FIX APLICADO: _scan_and_trade_for_platform ahora usa IQ Option API directamente!')
print()
print('Ahora reinicia el bot desde la API y deberia funcionar.')

# Verificar que trading_service tiene IQ Option
from services.trading_service import trading_service
iq = trading_service.get_iq_option()
print(f'TradingService tiene IQ Option: {iq is not None}')
if iq:
    try:
        check = iq.check_connect()
        print(f'IQ Option conectado: {check}')
        # Obtener velas de prueba
        import time as ttime
        candles = iq.get_candles('EURUSD-OTC', 60, 5, ttime.time())
        print(f'Velas de prueba obtenidas: {len(candles) if candles else 0}')
    except Exception as e:
        print(f'Error de prueba: {str(e).encode("ascii", errors="replace").decode()[:200]}')
