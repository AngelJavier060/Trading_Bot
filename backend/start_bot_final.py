"""
Script final: reconectar IQ Option DENTRO del servidor e iniciar bot
"""
import urllib.request
import json
import time

print("=== PASO 1: Forzar reconexion dentro del servidor ===")
data = json.dumps({"platform": "iqoption"}).encode()
req = urllib.request.Request("http://127.0.0.1:5000/api/auto-connect/connect-now", data=data, method="POST")
req.add_header("Content-Type", "application/json")
resp = urllib.request.urlopen(req, timeout=30)
result = json.loads(resp.read())
print("  Status:", result.get("status"))

print("\n=== PASO 2: Verificar conexion (esperar 8s) ===")
time.sleep(8)

req2 = urllib.request.Request("http://127.0.0.1:5000/api/auto-connect/status")
resp2 = urllib.request.urlopen(req2, timeout=10)
data2 = json.loads(resp2.read())
ac = data2.get("auto_connect", {})
iq_status = ac.get("platforms", {}).get("iqoption", {})
print("  IQ connected:", iq_status.get("connected"))
print("  Balance:", iq_status.get("balance"))

# Verificar trading_service
req3 = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
resp3 = urllib.request.urlopen(req3, timeout=10)
data3 = json.loads(resp3.read())
pf = data3.get("platforms", {})
cs = pf.get("connection_status", {})
print("  TradingService IQ:", cs.get("iqoption", {}).get("connected"))

print("\n=== PASO 3: Iniciar bot ===")
bot_data = json.dumps({
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

req4 = urllib.request.Request("http://127.0.0.1:5000/api/platforms/start", data=bot_data, method="POST")
req4.add_header("Content-Type", "application/json")
resp4 = urllib.request.urlopen(req4, timeout=10)
result4 = json.loads(resp4.read())
status = result4.get("instance_status", {})
print("  Corriendo:", status.get("is_running"))
print("  Confianza min:", status.get("min_confidence"))
print("  Simbolos:", status.get("symbols"))

print("\n=== PASO 4: Monitorear por 80 segundos (1 escaneo) ===")
for i in range(8):
    time.sleep(10)
    try:
        # Ver status
        req5 = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
        resp5 = urllib.request.urlopen(req5, timeout=5)
        data5 = json.loads(resp5.read())
        iq5 = data5.get("platforms", {}).get("instances", {}).get("iqoption", {})
        scans = iq5.get("trades_count", 0)
        errors = iq5.get("errors", [])
        
        # Ver trades
        try:
            req6 = urllib.request.Request("http://127.0.0.1:5000/api/live/history?limit=3")
            resp6 = urllib.request.urlopen(req6, timeout=5)
            data6 = json.loads(resp6.read())
            trades = data6.get("trades", [])
        except:
            trades = []
        
        print(f"  [{i*10}s] Escaneos: {scans} | Errores: {len(errors)} | Trades: {len(trades)}")
        if errors:
            print(f"    Error: {errors[-1]}")
        if trades:
            for t in trades[-2:]:
                sym = t.get("symbol", "")
                dire = t.get("direction", "")
                amt = t.get("amount", 0)
                conf = t.get("confidence_level", "")
                res = t.get("result", "")
                print(f"    TRADE: {sym} {dire} ${amt} conf={conf} res={res}")
    except Exception as e:
        print(f"  [{i*10}s] Error: {str(e)[:100]}")

print("\n=== RESUMEN FINAL ===")
try:
    req7 = urllib.request.Request("http://127.0.0.1:5000/api/platforms/status")
    resp7 = urllib.request.urlopen(req7, timeout=5)
    data7 = json.loads(resp7.read())
    iq7 = data7.get("platforms", {}).get("instances", {}).get("iqoption", {})
    print("  Escaneos totales:", iq7.get("trades_count"))
    print("  Errores:", iq7.get("errors"))
    
    req8 = urllib.request.Request("http://127.0.0.1:5000/api/live/history?limit=10")
    resp8 = urllib.request.urlopen(req8, timeout=5)
    data8 = json.loads(resp8.read())
    trades = data8.get("trades", [])
    print("  Trades totales en historial:", len(trades))
    for t in trades:
        print(f"    {t.get('symbol')} {t.get('direction')} ${t.get('amount')} conf={t.get('confidence_level','')} res={t.get('result')}")
except Exception as e:
    print("  Error obteniendo resumen:", str(e)[:200])
