"""
Conectar a IQ Option con credenciales del usuario
"""
import sys, os
sys.path.insert(0, '.')
os.environ['PYTHONIOENCODING'] = 'utf-8'

from services.trading.auto_connector import auto_connector
import json
from pathlib import Path

email = 'javierangelmsn@outlook.es'
password = 'Alexandra1'
account_type = 'PRACTICE'

# 1. Guardar credenciales
creds = {
    'iqoption_email': email,
    'iqoption_password': password,
    'iqoption_account_type': account_type,
}
saved = auto_connector.save_credentials(creds)
if saved:
    print('OK - Credenciales guardadas cifradas')
else:
    print('ERROR: No se pudieron guardar las credenciales')
    sys.exit(1)

# 2. Configurar auto-inicio del bot
config_data = {
    'auto_start_bot': True,
    'bot_config': {
        'mode': 'auto',
        'symbols': ['EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC'],
        'strategies': ['ema_rsi'],
        'amount': 10.0,
        'min_confidence': 65.0,
        'expiration': 5,
        'max_concurrent': 3,
        'max_daily_trades': 50,
    },
}
Path('data').mkdir(parents=True, exist_ok=True)
Path('data/auto_start_config.json').write_text(json.dumps(config_data, indent=2), encoding='utf-8')
print('OK - Configuracion de auto-inicio guardada')

# 3. Conectar a IQ Option ahora
print('Conectando a IQ Option... (30 segundos max)')
print()
result = auto_connector._connect_iqoption(email, password, account_type)

if result.get('success'):
    info = result.get('account_info', {})
    balance = info.get('balance', 0)
    currency = info.get('currency', 'USD')
    acct_type = info.get('account_type', 'PRACTICE')
    print()
    print('=' * 50)
    print('  CONEXION EXITOSA A IQ OPTION!')
    print('=' * 50)
    print(f'  Balance: ${balance:.2f} {currency}')
    print(f'  Tipo: {acct_type}')
    print(f'  Email: {email}')
    print()
    print('  Proximo paso: Inicia el bot desde el frontend')
    print('  o ejecuta: curl -X POST http://localhost:5000/api/live/start')
    print()
else:
    error = result.get('error', 'Error desconocido')
    print()
    print('=' * 50)
    print('  ERROR DE CONEXION')
    print('=' * 50)
    print(f'  {error}')
    print()
    print('  Posibles causas:')
    print('  1. Credenciales incorrectas (revisa email/password)')
    print('  2. 2FA activado - Desactivar desde app IQ Option')
    print('  3. Cuenta bloqueada temporalmente')
    print('  4. IQ Option caido en este momento')
    print()
    print('  Solucion:')
    print('  - Verifica que puedas entrar en https://iqoption.com')
    print('  - Si tienes 2FA, desactivalo temporalmente')
    print('  - Prueba de nuevo en unos minutos')
    print()
