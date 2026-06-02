"""
Monitor del bot - Espera y verifica si hay trades
"""
import urllib.request
import json
import time
import os

print("Esperando 15 segundos para el proximo escaneo...")
time.sleep(15)

# 1. Ver estado de plataforma
req = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
resp = urllib.request.urlopen(req, timeout=10)
result = json.loads(resp.read())
instances = result.get("platforms", {}).get("instances", {})
iq = instances.get("iqoption", {})

print("ESTADO ACTUAL:")
print(f"  Escaneando: {iq.get('is_scanning')}")
print(f"  Escaneos realizados: {iq.get('trades_count')}")
print(f"  Errores: {iq.get('errors', [])}")
print()

# 2. Ver trade log
log_path = os.path.join(".", "data", "trade_log.jsonl")
if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        last_lines = lines[-30:]
        print("ULTIMOS EVENTOS EN TRADE LOG:")
        has_trades = False
        for line in last_lines:
            try:
                t = json.loads(line)
                event_type = t.get("event_type", "?")
                asset = t.get("asset", t.get("symbol", ""))
                direction = t.get("direction", "")
                amount = t.get("amount", 0)
                confidence = t.get("confidence", "")
                source = t.get("source", "")
                print(f"  [{event_type}] {asset} {direction} ${amount} conf={confidence} src={source}")
                if event_type == "trade_executed":
                    has_trades = True
            except:
                pass
        if not has_trades:
            print("  (sin trades ejecutados aun)")
else:
    print("No hay trade_log.jsonl - el bot no ha generado eventos aun")
print()

# 3. Sugerencias
print("SUGERENCIAS:")
print("  Si no hay trades, prueba bajar la confianza a 50:")
print("  python -c \"import urllib.request, json; d=json.dumps({'platform':'iqoption','min_confidence':50,'amount':5}).encode(); req=urllib.request.Request('http://127.0.0.1:5000/api/platforms/config',data=d,headers={'Content-Type':'application/json'},method='POST'); print(json.loads(urllib.request.urlopen(req).read()))\"")
print()
print("  O cambia a velas de 1 minuto:")
print("  (requiere cambiar la estrategia en el codigo)")
print()
print("  O prueba con mercado BINARIAS en vez de OTC:")
print("  python connect_iq.py (y luego cambia los simbolos)")
