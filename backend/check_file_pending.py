"""Check pending trades in file"""
import json

with open('data/trades/trade_history.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

trades = data if isinstance(data, list) else data.get('trades', [])
pending = [t for t in trades if t.get('result') == 'pending']

print("Total trades:", len(trades))
print("Pending:", len(pending))

if pending:
    print("First 3 pending:")
    for t in pending[:3]:
        print(" ", t.get('id'), t.get('symbol'), t.get('direction'), "ext_id=", t.get('external_id'))
else:
    print("No pending! Latest 3 results:")
    for t in trades[-3:]:
        print(" ", t.get('id'), t.get('symbol'), t.get('direction'),
              "result=", t.get('result'), "profit=", t.get('profit'))
