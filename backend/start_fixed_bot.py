"""
Iniciar el bot con el codigo corregido y monitorear
"""
import urllib.request
import json
import time
import os

# 1. Iniciar bot
data = json.dumps({
    "platform": "iqoption",
    "mode": "auto",
    "account_type": "PRACTICE",
    "symbols": ["EURUSD-OTC", "GBPUSD-OTC", "USDJPY-OTC"],
    "strategies": ["ema_rsi"],
    "amount": 5,
    "min_confidence": 45,
    "expiration": 5,
    "max_concurrent": 2,
    "max_daily_trades": 50,
}).encode()

req = urllib.request.Request("http://127.0.0.1:5000/api/platforms/start", data=data)
req.add_header("Content-Type", "application/json")
req.method = "POST"
resp = urllib.request.urlopen(req, timeout=10)
result = json.loads(resp.read())
print("BOT INICIADO:")
status = result.get("instance_status", {})
print(f"  Corriendo: {status.get('is_running')}")
print(f"  Escaneando: {status.get('is_scanning')}")
print(f"  Confianza min: {status.get('min_confidence')}")
print(f"  Estrategias: {status.get('strategies')}")
print(f"  Simbolos: {status.get('symbols')}")
print()

# 2. Monitorear cada 10 segundos por 40 segundos
print("MONITOREANDO... (40 segundos)")
for i in range(4):
    time.sleep(10)
    
    # Ver log
    log_path = os.path.join(".", "data", "trade_log.jsonl")
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            if lines:
                for line in lines[-5:]:
                    try:
                        t = json.loads(line)
                        event_type = t.get("event_type", "?")
                        asset = t.get("symbol", t.get("asset", ""))
                        direction = t.get("direction", "")
                        amount = t.get("amount", 0)
                        confidence = t.get("confidence", "")
                        result_status = t.get("result", "")
                        print(f"  [{event_type}] {asset} {direction} ${amount} conf={confidence} res={result_status}")
                    except:
                        pass
            else:
                print(f"  [{i*10}s] Sin trades aun...")

# 3. Ver resumen final
print()
print("ESTADO FINAL:")
req2 = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
resp2 = urllib.request.urlopen(req2, timeout=10)
final = json.loads(resp2.read())
instances = final.get("platforms", {}).get("instances", {})
iq = instances.get("iqoption", {})
print(f"  Escaneos realizados: {iq.get('trades_count')}")
print(f"  Errores: {iq.get('errors', [])}")
print(f"  Corriendo: {iq.get('is_running')}")
print()
print("LISTO - Revisa la consola del servidor para mas detalles")
