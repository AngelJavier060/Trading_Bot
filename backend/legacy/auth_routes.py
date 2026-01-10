from flask import Blueprint, request, jsonify

# Crear un Blueprint para manejar rutas de autenticación
auth_bp = Blueprint('auth', __name__)

# Ruta para el login
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # Lógica simulada de autenticación (puedes reemplazar esto por tu lógica real)
    if username == "admin" and password == "1234":  # Cambia según tus credenciales reales
        return jsonify({"message": "Autenticación exitosa", "token": "mock_token"}), 200
    else:
        return jsonify({"error": "Credenciales incorrectas"}), 401





