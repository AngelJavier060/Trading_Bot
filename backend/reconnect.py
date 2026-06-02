"""
Reconectar a IQ Option
"""
import sys, os
sys.path.insert(0, '.')
os.environ['PYTHONIOENCODING'] = 'utf-8'

from services.trading.auto_connector import auto_connector

creds = auto_connector.load_credentials()
email = creds.get('iqoption_email', '')
password = creds.get('iqoption_password', '')
acct_type = creds.get('iqoption_account_type', 'PRACTICE')

print('Reconectando a IQ Option (' + email + ')...')
result = auto_connector._connect_iqoption(email, password, acct_type)

if result.get('success'):
    info = result.get('account_info', {})
    balance = info.get('balance', 0)
    print('RECONECTADO! Balance: $' + str(balance) + ' USD')
else:
    print('Error: ' + result.get('error', 'desconocido'))
