"""Check trade results after manual order"""
import urllib.request
import json
import time

print("Esperando 15s para que se liquide...")
time.sleep(15)

# Check history
req = urllib.request.Request('http://127.0.0.1:5000/api/live/history?limit=10')
resp = urllib.request.urlopen(req, timeout=10)
data = json.loads(resp.read())
trades = data.get("trades", [])

print(f"Trades en historial: {len(trades)}")
for t in trades:
    sym = t.get("symbol", "?")
    dire = t.get("direction", "?")
    amt = t.get("amount", 0)
    res = t.get("result", "?")
    prof = t.get("profit", "?")
    entry = t.get("entry_price", "?")
    print(f"  {sym} {dire} ${amt} entry={entry} result={res} profit={prof}")

# Check balance
req2 = urllib.request.Request('http://127.0.0.1:5000/api/trading/account')
resp2 = urllib.request.urlopen(req2, timeout=10)
data2 = json.loads(resp2.read())
ai = data2.get("accountInfo", {})
print(f"\nBalance: ${ai.get('balance')}")
print(f"Tipo: {ai.get('account_type')}")
