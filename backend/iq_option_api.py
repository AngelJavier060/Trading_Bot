from iqoptionapi.stable_api import IQ_Option
import logging
import time

# Configuración para mostrar mensajes detallados de depuración
logging.basicConfig(level=logging.DEBUG)

def conectar_api():
    usuario = "javierangelmsn@outlook.es"
    contraseña = "Alexandra1"
    api = IQ_Option(usuario, contraseña)
    
    # Intenta conectar y obtiene un mensaje de error en caso de fallo
    conectado, mensaje_error = api.connect()
    
    if conectado:
        print("Conexión exitosa a IQ Option.")
        return api
    else:
        print("Error al conectar con IQ Option:", mensaje_error)
        return None

def seleccionar_cuenta(api):
    tipo_cuenta = input("Seleccione el tipo de cuenta ('demo' o 'real'): ").lower()
    
    if tipo_cuenta == 'demo':
        api.change_balance("PRACTICE")
        print("Cuenta demo seleccionada.")
    elif tipo_cuenta == 'real':
        api.change_balance("REAL")
        print("Cuenta real seleccionada.")
    else:
        print("Tipo de cuenta no válido. Se usará la cuenta demo por defecto.")
        api.change_balance("PRACTICE")
