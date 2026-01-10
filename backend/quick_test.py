import requests
import time
import os

def test_api():
    BASE_URL = 'http://127.0.0.1:5000'
    
    def try_request(endpoint, method='get', data=None):
        url = f"{BASE_URL}{endpoint}"
        print(f"\n🔍 Probando {method.upper()} {url}")
        try:
            if method.lower() == 'post':
                response = requests.post(url, json=data)
            else:
                response = requests.get(url)
            
            print(f"📡 Status Code: {response.status_code}")
            print(f"📄 Respuesta: {response.json()}")
            return response
        except requests.exceptions.ConnectionError:
            print("❌ Error: No se pudo conectar al servidor")
            return None
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return None

    # 1. Probar ruta raíz
    try_request('/')

    # 2. Probar ruta de test
    try_request('/test')

    # 3. Probar ruta de test de trading
    try_request('/api/trading/test')

    # 4. Probar conexión a IQ Option
    email = os.getenv("IQ_OPTION_EMAIL")
    password = os.getenv("IQ_OPTION_PASSWORD")

    if not email or not password:
        print("⚠️ Credenciales IQ_OPTION_EMAIL/IQ_OPTION_PASSWORD no configuradas. "
              "No se probará la conexión a IQ Option.")
    else:
        credentials = {
            "platform": "iqoption",
            "credentials": {
                "email": email,
                "password": password
            },
            "platform_type": "iqoption"
        }
        
        try_request('/api/trading/connect', 'post', credentials)

if __name__ == "__main__":
    test_api()