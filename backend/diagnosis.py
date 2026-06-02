"""
Diagnostico rapido - Por que el bot no tradea?
"""
import sys, os
sys.path.insert(0, '.')
os.environ['PYTHONIOENCODING'] = 'utf-8'

from api import create_app
app = create_app()
client = app.test_client()

# 1. Conexion
r = client.get('/api/auto-connect/status')
d = r.get_json()
ac = d.get('auto_connect', {})
print('=== 1. CONEXION A IQ OPTION ===')
conectado = ac.get('current_iq_connected', False)
print(f'Conectado: {conectado}')
if not conectado:
    print('>>> PROBLEMA: No hay conexion activa con IQ Option!')
    print('>>> Solucion: Usa /api/auto-connect/connect-now para conectar')
else:
    print('OK - Conexion activa')

# 2. Verificar si el bot principal esta corriendo
r2 = client.get('/api/live/status')
d2 = r2.get_json()
print()
print('=== 2. ESTADO DEL BOT ===')
print(f'Respuesta cruda: {d2}')
bot_status = d2 if isinstance(d2, dict) else {}
is_running = bot_status.get('is_running', False)
print(f'Bot corriendo: {is_running}')
print(f'Modo: {bot_status.get("mode")}')
print(f'Plataforma: {bot_status.get("platform")}')

if is_running:
    print(f'Balance: {bot_status.get("balance")}')
    print(f'Total trades: {bot_status.get("total_trades")}')
    print(f'Winning: {bot_status.get("winning_trades")}')
    print(f'Losing: {bot_status.get("losing_trades")}')
    print(f'Win rate: {bot_status.get("win_rate")}')
    print(f'Simbolo actual: {bot_status.get("current_symbol")}')
    print(f'Errores recientes: {bot_status.get("errors", [])[-3:]}')
else:
    print('>>> Bot NO esta corriendo')

# 3. Verificar el risk manager
r3 = client.get('/api/trading/risk-state')
d3 = r3.get_json()
print()
print('=== 3. ESTADO DE RIESGO ===')
print(f'Respuesta: {d3}')
risk_state = d3.get('state', d3)
if isinstance(risk_state, dict):
    print(f'Daily trades: {risk_state.get("daily_trades")}')
    print(f'Daily amount: {risk_state.get("daily_amount")}')
    print(f'Consecutive losses: {risk_state.get("consecutive_losses")}')

# 4. Verificar configuracion guardada
import json
from pathlib import Path
print()
print('=== 4. CONFIGURACION GUARDADA ===')
config_path = Path('data/user_config.json')
if config_path.exists():
    config = json.loads(config_path.read_text(encoding='utf-8'))
    print(f'Risk: {config.get("risk")}')
    print(f'Strategy: {config.get("strategy")}')
    print(f'Timeframe: {config.get("timeframe")}')
    print(f'Max daily trades: {config.get("max_daily_trades")}')
    print(f'Max daily risk: {config.get("max_daily_risk_amount")}')
else:
    print('No hay user_config.json')

# 5. Verificar el log de trades recientes
print()
print('=== 5. TRADES RECIENTES (log) ===')
log_path = Path('data/trade_log.jsonl')
if log_path.exists():
    lines = log_path.read_text(encoding='utf-8').strip().split('\n')
    trades = []
    for line in lines[-10:]:
        try:
            trades.append(json.loads(line))
        except:
            pass
    for t in reversed(trades):
        print(f'  [{t.get("event_type")}] {t.get("asset")} {t.get("direction","")} ${t.get("amount","")} - {t.get("source")}')
else:
    print('No hay trade_log.jsonl')

print()
print('=== DIAGNOSTICO COMPLETADO ===')
print('Posibles causas de que no tradee:')
print('1. No hay conexion con IQ Option')
print('2. El bot no esta iniciado en modo AUTO')
print('3. La confianza minima es muy alta y no se generan senales')
print('4. El Risk Manager bloqueo las operaciones (limite diario)')
print('5. Las estrategias EMA+RSI no detectan condiciones en OTC ahora')
print('6. No hay suficientes velas cargadas para analizar')
