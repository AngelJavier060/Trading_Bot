"""
Test: Scan mercado con la nueva estrategia EMA Trend Continuation via API
"""
import urllib.request
import json
import time

def test():
    print("=" * 70)
    print("TEST: ESCANEO con Estrategia EMA Trend Continuation")
    print("=" * 70)
    
    # Usar el endpoint de scan (que usa datos reales de IQ Option)
    scan_data = json.dumps({
        "symbols": ["EURUSD-OTC", "GBPUSD-OTC", "USDJPY-OTC"],
        "strategies": ["ema_trend_continuation"],
        "timeframe": "5m"
    }).encode()
    
    req = urllib.request.Request('http://127.0.0.1:5000/api/live/scan', data=scan_data, method="POST")
    req.add_header("Content-Type", "application/json")
    
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
        
        print("Status:", data.get("status"))
        print("Total escaneados:", data.get("total_scanned"))
        print("Senales encontradas:", data.get("signals_found"))
        print()
        
        signals = data.get("signals", [])
        for s in signals:
            print("---")
            print("Simbolo:", s.get("symbol"))
            print("Direccion:", s.get("direction"))
            print("Confianza:", s.get("confidence"), "%")
            print("Estrategia:", s.get("strategy"))
            print("Indicadores:")
            ind = s.get("indicators", {})
            for k in ["ema_fast", "ema_slow", "rsi", "adx", "step1_trend", "step2_pullback", "step3_adx", "step4_rsi", "step5_candle"]:
                if k in ind:
                    v = ind[k]
                    if isinstance(v, float):
                        print(f"  {k}: {v:.4f}")
                    else:
                        print(f"  {k}: {v}")
            if s.get("reasons"):
                print("Razones:")
                for r in s["reasons"][:5]:
                    if isinstance(r, dict):
                        condition = r.get("condition", "")
                        indicator = r.get("indicator", "")
                        met = r.get("met", False)
                        icon = "+" if met else "-"
                        if condition:
                            print(f"  {icon} {indicator}: {condition[:80]}")
                    else:
                        print(f"  - {str(r)[:80]}")
            print()
            
    except Exception as e:
        err = str(e).encode("ascii", errors="replace").decode()[:300]
        print("ERROR:", err)
        if hasattr(e, 'read'):
            try:
                body = e.read().decode()[:500]
                print("Response:", body)
            except:
                pass

if __name__ == "__main__":
    test()
