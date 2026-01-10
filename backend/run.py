from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from api import create_app

# Cargar variables de entorno desde .env (útil al ejecutar con python run.py)
load_dotenv()

app = create_app()
CORS(app)  # Esto es importante para permitir las peticiones desde el frontend

if __name__ == '__main__':
    print("🚀 Servidor iniciando...")
    print("📍 Rutas disponibles:")
    print("   - GET  http://127.0.0.1:5000/test")
    print("   - POST http://127.0.0.1:5000/api/trading/connect")
    print("   - GET  http://127.0.0.1:5000/api/trading/check-connection")
    app.run(debug=True, port=5000) 