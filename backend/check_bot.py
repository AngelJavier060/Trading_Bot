"""
Verificar estado del bot y senales
"""
import urllib.request
import json
import time

print("Esperando 8 segundos para que el bot escanee...")
time.sleep(8)

# Verificar estado
req = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
resp = urllib.request.urlopen(req, timeout=10)
result = json.loads(resp.read())
platforms = result.get("platforms", {})
instances = platforms.get("instances", {})
iq = instances.get("iqoption", {})

print("=" * 50)
print("ESTADO DEL BOT EN IQ OPTION")
print("=" * 50)
print(f"Corriendo: {iq.get('is_running')}")
print(f"Escaneando: {iq.get('is_scanning')}")
print(f"Ultimo escaneo: {iq.get('last_scan_time')}")
print(f"Trades realizados: {iq.get('trades_count')}")
print(f"Simbolos: {iq.get('symbols')}")
print(f"Estrategias: {iq.get('strategies')}")
print(f"Confianza min: {iq.get('min_confidence')}")
print(f"Monto: ${iq.get('amount')}")
print()

# Verificar bot principal
bot = platforms.get("main_bot", {})
print("BOT PRINCIPAL:")
print(f"  Corriendo: {bot.get('is_running')}")
print(f"  Modo: {bot.get('mode')}")
print(f"  Total trades: {bot.get('total_trades')}")
print(f"  Balance: ${bot.get('balance', 0)}")
print()

# Ver si hay senales
print("SENALES RECIENTES:")
try:
    req2 = urllib.request.Request("http://127.0.0.1:5000/api/live/signals")
    resp2 = urllib.request.urlopen(req2, timeout=10)
    signals_data = json.loads(resp2.read())
    signals = signals_data.get("signals", signals_data.get("data", []))
    if signals:
        for s in signals:
            print(f"  {s.get('symbol')} - {s.get('direction')} - conf: {s.get('confidence')}%")
    else:
        print("  No hay senales disponibles aun")
        print("  (es normal, el bot necesita acumular velas primero)")
except Exception as e:
    print(f"  Error obteniendo senales: {e}")

print()
print("NOTA: El bot escanea cada 60 segundos.")
print("Si no hay trades, puede ser que:")
print("1. Las condiciones EMA/RSI no se esten cumpliendo")
print("2. Necesita mas velas para analizar")
print("3. El mercado OTC no esta generando senales claras ahora")
print()
print("Puedes cambiar la confianza a 60% para mas operaciones:")
print("  curl -X POST http://127.0.0.1:5000/api/platforms/config")
print('  -d \'{"platform":"iqoption","min_confidence":60}\'')
