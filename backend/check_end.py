"""Check the end of live_trading_service.py"""
with open('services/trading/live_trading_service.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
print(f"Total lines: {len(lines)}")
for i in range(max(0, len(lines)-15), len(lines)):
    print(f"{i+1}: {lines[i].rstrip()[:100]}")
