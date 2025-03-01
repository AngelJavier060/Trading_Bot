from iqoptionapi.stable_api import IQ_Option

# Credenciales de IQ Option
USERNAME = "javierangelmsn@outlook.es"  # Reemplaza con tu correo
PASSWORD = "Alexandra1"  # Reemplaza con tu contraseña

def test_connection():
    try:
        print("Intentando conectar con IQ Option...")
        iq = IQ_Option(USERNAME, PASSWORD)
        check, reason = iq.connect()
        if check:
            print("Conexión exitosa con IQ Option.")
        else:
            print(f"Error al conectar: {reason}")
    except Exception as e:
        print(f"Error inesperado: {e}")

if __name__ == "__main__":
    test_connection()
