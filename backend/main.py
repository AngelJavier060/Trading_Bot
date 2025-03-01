import logging
from iqoptionapi.stable_api import IQ_Option
from operations import comprar, vender
import time

logging.basicConfig(level=logging.INFO)

def conectar_api():
    """Conecta a la API de IQ Option."""
    usuario = "javierangelmsn@outlook.es"
    contraseña = "Alexandra1"
    api = IQ_Option(usuario, contraseña)

    try:
        # Intentamos la conexión
        conectado, _ = api.connect()
        if conectado:
            logging.info("Conexión exitosa a IQ Option.")
            return api
        else:
            logging.error("Error al conectar con IQ Option.")
            return None
    except Exception as e:
        logging.error(f"Error al conectar con IQ Option: {e}")
        return None

def seleccionar_cuenta(api):
    """Permite al usuario seleccionar una cuenta demo o real."""
    tipo_cuenta = input("Seleccione el tipo de cuenta ('demo' o 'real'): ").lower()
    if tipo_cuenta == 'demo':
        api.change_balance("PRACTICE")
        print("Cuenta demo seleccionada.")
        return "Demo"
    elif tipo_cuenta == 'real':
        api.change_balance("REAL")
        print("Cuenta real seleccionada.")
        return "Real"
    else:
        print("Tipo de cuenta no válido. Se usará la cuenta demo por defecto.")
        api.change_balance("PRACTICE")
        return "Demo"

def mostrar_menu():
    """Muestra el menú principal."""
    print("\n--- Menú de opciones ---")
    print("1. Ejecutar estrategia automática")
    print("2. Compra manual")
    print("3. Venta manual")
    print("4. Seleccionar estrategia")
    print("5. Salir")

def mostrar_seleccion_estrategia():
    """Permite al usuario seleccionar una estrategia."""
    print("\nSeleccione una estrategia:")
    print("1. Estrategia Call")
    print("2. Estrategia Put")
    seleccion = input("Ingrese el número de la estrategia: ")
    return seleccion

def mostrar_actividad(activo, estrategia, direccion, resultado):
    """Muestra el resultado de una operación."""
    print(f"\nEstrategia: {estrategia}, Activo: {activo}, Dirección: {direccion}, Resultado: {resultado}")

def mostrar_estado_operacion(cuenta, activo, cantidad, direccion, expiracion):
    """Muestra el estado de la operación manual antes de ejecutarla."""
    print(f"\nCuenta: {cuenta}, Activo: {activo}, Cantidad: {cantidad}, Dirección: {direccion}, Expiración: {expiracion} minutos")

# Bucle principal
api = conectar_api()
if api:
    cuenta = seleccionar_cuenta(api)

    while True:
        mostrar_menu()
        opcion = input("Seleccione una opción: ")

        if opcion == "1":
            activo = input("Ingrese el activo (ej. EURUSD): ")
            estrategia = mostrar_seleccion_estrategia()
            direccion = "call" if estrategia == "1" else "put"  # Simplificación
            cantidad = 10
            expiracion = 5
            resultado = comprar(api, activo, cantidad, direccion, expiracion)
            mostrar_actividad(activo, estrategia, direccion, "WIN" if resultado else "LOSS")

        elif opcion == "2":
            activo = input("Ingrese el activo (ej. EURUSD): ")
            cantidad = float(input("Ingrese la cantidad: "))
            direccion = input("Ingrese la dirección ('call' o 'put'): ").lower()
            expiracion = int(input("Ingrese la expiración (en minutos): "))
            mostrar_estado_operacion(cuenta, activo, cantidad, direccion, expiracion)
            comprar(api, activo, cantidad, direccion, expiracion)
        
        elif opcion == "3":
            id_operacion = int(input("Ingrese la ID de la operación a vender: "))
            vender(api, id_operacion)
        
        elif opcion == "4":
            estrategia = mostrar_seleccion_estrategia()
            print(f"Estrategia seleccionada: {estrategia}")

        elif opcion == "5":
            print("Saliendo...")
            break
        
        else:
            print("Opción no válida. Intente de nuevo.")

        time.sleep(1)  # Pausa breve entre operaciones
