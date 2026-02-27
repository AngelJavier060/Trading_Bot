import os
import sys

# Add os import to mt5_controller.py
controller_path = os.path.join(os.path.dirname(__file__), 'api', 'controllers', 'mt5_controller.py')

with open(controller_path, 'r') as f:
    content = f.read()

# Add import os after pandas import
if 'import pandas as pd\nfrom services.trading_service' in content:
    content = content.replace(
        'import pandas as pd\nfrom services.trading_service',
        'import pandas as pd\nimport os\nfrom services.trading_service'
    )

# Replace the initialize section with fallback
old_init = '''            # Inicializar MT5
            if not mt5.initialize():
                return jsonify({
                    'status': 'error',
                    'message': 'Error al inicializar MT5. Asegúrate de que esté instalado correctamente.'
                }), 500'''

new_init = '''            # Inicializar MT5 (con fallback a rutas comunes de terminal)
            initialized = mt5.initialize()
            attempted_paths = []
            if not initialized:
                common_paths = [
                    r"C:\\Program Files\\MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files (x86)\\MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admiral Markets MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admirals MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admiral Markets MT5\\terminal64.exe",
                ]
                for path in common_paths:
                    if os.path.exists(path):
                        attempted_paths.append(path)
                        try:
                            if mt5.initialize(path=path):
                                initialized = True
                                logging.info(f"MT5 initialized using terminal at: {path}")
                                break
                        except Exception:
                            pass
                if not initialized:
                    last_err = mt5.last_error() if hasattr(mt5, 'last_error') else ('unknown', 'unknown')
                    return jsonify({
                        'status': 'error',
                        'message': 'No se pudo inicializar MetaTrader 5. Verifica que el terminal esté instalado y abierto.',
                        'last_error': str(last_err),
                        'attempted_paths': attempted_paths
                    }), 500'''

if old_init in content:
    content = content.replace(old_init, new_init)

# Update authorization error message
old_auth = '''                return jsonify({
                    'status': 'error',
                    'message': f'Error de autorización: {mt5.last_error()}. Verifica tus credenciales y el servidor.'
                }), 401'''

new_auth = '''                return jsonify({
                    'status': 'error',
                    'message': f'Error de autorización: {mt5.last_error()}. Verifica tus credenciales y el servidor ({server}).'
                }), 401'''

if old_auth in content:
    content = content.replace(old_auth, new_auth)

with open(controller_path, 'w') as f:
    f.write(content)

print("mt5_controller.py updated with fallback initialization and better error messages")
