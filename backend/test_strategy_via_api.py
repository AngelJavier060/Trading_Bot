"""
Test Estrategia EMA Trend Continuation usando datos de la API
"""
import sys
sys.path.insert(0, '.')

import urllib.request
import json
import time as ttime
from services.strategies import get_strategy

def test_strategy_api():
    strategy = get_strategy('ema_trend_continuation')
    
    symbols = ['EURUSD-OTC', 'USDJPY-OTC', 'GBPUSD-OTC']
    
    for symbol in symbols:
        print("=" * 70)
        print("ESTRATEGIA: EMA TREND CONTINUATION + RSI + ADX")
        print("Simbolo:", symbol)
        print("Timeframe: 5 min | Expiration: 15 min")
        print("=" * 70)
        
        # Obtener velas del servidor
        now = int(ttime.time())
        url = ('http://127.0.0.1:5000/api/tv/history'
               '?symbol=' + symbol +
               '&resolution=5'
               '&from=' + str(now - 86400) +
               '&to=' + str(now) +
               '&countback=150')
        
        try:
            req = urllib.request.Request(url)
            resp = urllib.request.urlopen(req, timeout=15)
            data = json.loads(resp.read())
        except Exception as e:
            print("ERROR obteniendo velas:", str(e)[:100])
            continue
        
        if data.get('s') != 'ok' or not data.get('t'):
            print("Sin datos para", symbol)
            continue
        
        # Convertir a formato de estrategia
        candles = []
        for i in range(len(data['t'])):
            candles.append({
                'open': data['o'][i],
                'high': data['h'][i],
                'low': data['l'][i],
                'close': data['c'][i],
                'volume': data['v'][i] if i < len(data['v']) else 0
            })
        
        print("Velas obtenidas:", len(candles))
        
        if len(candles) < 60:
            print("Insuficientes velas (< 60)")
            continue
        
        # Ejecutar estrategia
        try:
            signal = strategy.analyze(candles)
            sd = signal.to_dict()
            
            print()
            print("SENAL:", sd['signal'].upper())
            print("Confianza:", sd['confidence'], "%")
            print("Indicadores:")
            ind = sd.get('indicators', {})
            for k in ['ema_fast', 'ema_slow', 'ema_separation_pct', 'rsi', 'adx', 'close', 'total_steps', 'in_trading_hours']:
                if k in ind:
                    v = ind[k]
                    if isinstance(v, float):
                        print("  -", k + ":", round(v, 4))
                    else:
                        print("  -", k + ":", v)
            print()
            print("Pasos cumplidos:")
            for s in ['step1_trend', 'step2_pullback', 'step3_adx', 'step4_rsi', 'step5_candle']:
                if s in ind:
                    print("  -", s + ":", ind[s])
            print()
            print("Razones:")
            for r in sd.get('reasons', []):
                icon = "+" if r.get('met') else "-"
                weight = r.get('weight', 0)
                condition = r.get('condition', '')[:80]
                indicator = r.get('indicator', '')
                if isinstance(weight, (int, float)) and weight > 0:
                    print("  " + icon, indicator + ":", condition, "[" + str(weight) + "pts]")
                else:
                    print("  " + icon, indicator + ":", condition)
        
        except Exception as e:
            import traceback
            print("ERROR:", str(e)[:200])
            traceback.print_exc()
        
        print()

if __name__ == '__main__':
    test_strategy_api()
