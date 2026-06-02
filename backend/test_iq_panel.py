"""Test IQ Panel: candles, orders, and balance"""
import urllib.request
import json
import time

def test_all():
    print("=== TEST 1: Velas para el grafico ===")
    now = int(time.time())
    req = urllib.request.Request(
        'http://127.0.0.1:5000/api/tv/history'
        '?symbol=EURUSD-OTC&resolution=5'
        '&from=' + str(now - 86400) + '&to=' + str(now) + '&countback=100'
    )
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read())
    print("Status:", data.get("s"))
    print("Cant velas:", len(data.get("t", [])))
    if data.get("t"):
        print("  Primera vela close:", data["c"][0])
        print("  Ultima vela close:", data["c"][-1])
    print()

    print("=== TEST 2: Balance actual ===")
    req2 = urllib.request.Request('http://127.0.0.1:5000/api/trading/account')
    resp2 = urllib.request.urlopen(req2, timeout=10)
    d2 = json.loads(resp2.read())
    balance_before = d2.get("balance", 0)
    print("Balance antes:", balance_before)
    print()

    print("=== TEST 3: Orden CALL manual ===")
    order = json.dumps({
        "symbol": "EURUSD-OTC",
        "direction": "call",
        "amount": 2,
        "expiration": 1,
        "strategy": "manual",
        "explanation": "Test manual IQ Panel"
    }).encode()
    req3 = urllib.request.Request('http://127.0.0.1:5000/api/trading/order', data=order, method="POST")
    req3.add_header("Content-Type", "application/json")
    resp3 = urllib.request.urlopen(req3, timeout=20)
    d3 = json.loads(resp3.read())
    print("Status:", d3.get("status"))
    order_id = d3.get("order_id") or d3.get("order", {}).get("id") or d3.get("id")
    print("Order ID:", order_id)
    print("Respuesta completa:", json.dumps(d3, indent=2)[:300])
    print()

    if not order_id:
        print("ERROR: No se obtuvo order_id!")
        return

    print("=== TEST 4: Balance despues de orden ===")
    req4 = urllib.request.Request('http://127.0.0.1:5000/api/trading/account')
    resp4 = urllib.request.urlopen(req4, timeout=10)
    d4 = json.loads(resp4.read())
    print("Balance despues:", d4.get("balance"))
    print("Diferencia:", balance_before - d4.get("balance", 0))
    print()

    print("=== TEST 5: Monitoreando resultado (80s max) ===")
    for i in range(16):
        time.sleep(5)
        try:
            req5 = urllib.request.Request(
                'http://127.0.0.1:5000/api/trading/order/' + str(order_id)
            )
            resp5 = urllib.request.urlopen(req5, timeout=5)
            d5 = json.loads(resp5.read())
            status = d5.get("status")
            result = d5.get("result")
            profit = d5.get("profit")
            
            if status == "closed":
                emoji = "WIN" if result == "win" else "LOSS"
                print(f"  [{i*5}s] CERRADO: {emoji} profit={profit}")
                break
            else:
                print(f"  [{i*5}s] Pendiente... status={status}")
        except Exception as ex:
            err = str(ex).encode("ascii", errors="replace").decode()[:100]
            print(f"  [{i*5}s] Error: {err}")

    print()
    print("=== TEST COMPLETADO ===")
    
    # Show final balance
    try:
        req6 = urllib.request.Request('http://127.0.0.1:5000/api/trading/account')
        resp6 = urllib.request.urlopen(req6, timeout=5)
        d6 = json.loads(resp6.read())
        print("Balance final:", d6.get("balance"))
    except:
        pass

if __name__ == "__main__":
    test_all()
