"""
Verificar si IQ Option esta registrado en trading_service
"""
import sys, os, time
sys.path.insert(0, '.')
os.environ['PYTHONIOENCODING'] = 'utf-8'

from services.trading_service import trading_service

iq = trading_service.get_iq_option()
print('IQ Option en trading_service:', iq is not None)
if iq:
    try:
        check = iq.check_connect()
        print('Conectado:', check)
        # Probar obtener velas
        candles = iq.get_candles('EURUSD-OTC', 60, 5, time.time())
        print('Velas obtenidas:', len(candles) if candles else 0)
        if candles:
            print('Primera vela:', str(candles[0])[:100])
    except Exception as e:
        msg = str(e).encode('ascii', errors='replace').decode()
        print('Error:', msg[:200])
else:
    print('Todavia no registrado - necesita reconectar')
    
    # Reconectar desde auto_connector
    from services.trading.auto_connector import auto_connector
    creds = auto_connector.load_credentials()
    email = creds.get('iqoption_email', '')
    password = creds.get('iqoption_password', '')
    acct_type = creds.get('iqoption_account_type', 'PRACTICE')
    
    print('Reconectando...')
    result = auto_connector._connect_iqoption(email, password, acct_type)
    if result.get('success'):
        info = result.get('account_info', {})
        print('Reconectado! Balance: $' + str(info.get('balance', 0)))
        
        # Verificar de nuevo
        iq2 = trading_service.get_iq_option()
        print('IQ Option ahora:', iq2 is not None)
        if iq2:
            candles = iq2.get_candles('EURUSD-OTC', 60, 5, time.time())
            print('Velas obtenidas:', len(candles) if candles else 0)
    else:
        print('Error reconectando:', result.get('error', 'desconocido'))
