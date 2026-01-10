import requests
from dotenv import load_dotenv
import os

# Cargar variables de entorno
load_dotenv()

BASE_URL = "http://127.0.0.1:5000"

def test_iqoption_connection():
    # Obtener credenciales desde variables de entorno
    test_data = {
        "platform": "iqoption",
        "credentials": {
            "email": os.getenv("IQ_OPTION_EMAIL"),
            "password": os.getenv("IQ_OPTION_PASSWORD")
        },
        "platform_type": "iqoption"
    }

    try:
        print(f"Usando email: {test_data['credentials']['email']}")  # Para verificar
        
        # Intenta conectar
        print("Intentando conectar...")
        response = requests.post(f"{BASE_URL}/api/trading/connect", json=test_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

    except requests.exceptions.ConnectionError:
        print("""
ERROR: El servidor Flask no está corriendo.

Para iniciar el servidor:
1. Abre una nueva terminal
2. Navega al directorio backend:
   cd backend
3. Activa el entorno virtual si no está activado:
   .\\venv\\Scripts\\activate  # En Windows
   source venv/bin/activate    # En Linux/Mac
4. Ejecuta el servidor:
   python run.py

El servidor debe estar corriendo en http://127.0.0.1:5000
        """)
    except Exception as e:
        print(f"Error inesperado: {str(e)}")

if __name__ == "__main__":
    test_iqoption_connection()
