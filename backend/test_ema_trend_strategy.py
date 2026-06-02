"""
Test de la Estrategia EMA Trend Continuation + RSI + ADX
Obtiene velas reales de IQ Option y ejecuta la estrategia
"""
import sys
sys.path.insert(0, '.')

import json
import time as ttime
from services.strategies import get_strategy

def test_strategy():
    strategy = get_strategy('ema_trend_continuation')
    print("=== ESTRATEGIA: EMA TREND CONTINUATION ===")
    print(f"Nombre: {strategy.name}")
    print(f"Descripcion: {strategy.description}")
    print(f"Min velas: {strategy.min_candles}")
    print(f"Parametros: {strategy.params}")
    print()

    # Obtener velas de IQ Option directamente
    from services.trading_service import trading_service
    iq = trading_service.get_iq_option()
    if not iq:
        print("ERROR: IQ Option no disponible")
        return
    if not iq.check_connect():
        print("ERROR: IQ Option no conectado")
        return

    symbols = ['EURUSD-OTC', 'USDJPY-OTC']
    timeframes = ['5m']  # 5 min recomendado

    for symbol in symbols:
        for tf in timeframes:
            print(f"\n{'='*60}")
            print(f"ANALISIS: {symbol} ({tf})")
            print(f"{'='*60}")

            # Obtener velas (5 min = 300 segundos, pedimos 100 velas)
            seconds_map = {'1m': 60, '5m': 300, '15m': 900}
            interval = seconds_map.get(tf, 300)
            
            candles_raw = iq.get_candles(symbol, interval, 100, ttime.time())
            
            if not candles_raw or len(candles_raw) < 50:
                print(f"  Solo {len(candles_raw) if candles_raw else 0} velas - insuficiente")
                continue

            # Convertir a lista de dicts
            candles_list = []
            for c in candles_raw:
                if isinstance(c, dict):
                    candles_list.append({
                        'open': c.get('open', c.get('o', 0)),
                        'high': c.get('high', c.get('h', 0)),
                        'low': c.get('low', c.get('l', 0)),
                        'close': c.get('close', c.get('c', 0)),
                        'volume': c.get('volume', c.get('v', 0))
                    })
                else:
                    continue

            print(f"  Velas obtenidas: {len(candles_list)}")
            
            # Ejecutar estrategia
            try:
                signal = strategy.analyze(candles_list)
                sd = signal.to_dict()

                print(f"\n  SENAL: {sd['signal'].upper()}")
                print(f"  Confianza: {sd['confidence']}%")
                print(f"  Estrategia: {sd['strategy_name']}")
                print(f"  Explicacion: {sd.get('explanation', 'N/A')[:200]}")
                print()
                print("  INDICADORES:")
                for k, v in sd.get('indicators', {}).items():
                    if isinstance(v, float):
                        print(f"    {k}: {v:.4f}")
                    else:
                        print(f"    {k}: {v}")
                print()
                print("  RAZONES:")
                for r in sd.get('reasons', []):
                    icon = '✅' if r.get('met') else '❌'
                    print(f"    {icon} {r.get('indicator','')}: {r.get('condition','')[:100]} [{r.get('weight',0)}pts]")

            except Exception as e:
                err = str(e).encode('ascii', errors='replace').decode()[:200]
                print(f"  ERROR: {err}")

    print(f"\n{'='*60}")
    print("TEST COMPLETADO")
    print(f"{'='*60}")

if __name__ == '__main__':
    test_strategy()
