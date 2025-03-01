# operations.py

import logging
import time

def comprar(api, activo, cantidad, direccion, expiracion):
    """
    Realiza una compra en IQ Option.
    """
    direccion = direccion.lower()
    if direccion not in ['call', 'put']:
        print("Dirección inválida. Use 'call' o 'put'.")
        return

    _, id_compra = api.buy(cantidad, activo, direccion, expiracion)
    if id_compra:
        print(f"Compra ejecutada: Activo={activo}, Cantidad={cantidad}, Dirección={direccion.capitalize()}, Expiración={expiracion} minutos.")
    else:
        print("Error al ejecutar la compra.")

def ejecutar_operacion(api):
    """
    Ejecuta una operación automática de ejemplo.
    """
    activo = "EURUSD"
    cantidad = 10
    direccion = "call"
    expiracion = 1

    _, id_operacion = api.buy(cantidad, activo, direccion, expiracion)
    if id_operacion:
        print(f"Operación automática ejecutada: Activo={activo}, Cantidad={cantidad}, Dirección={direccion.capitalize()}, Expiración={expiracion} minuto.")
    else:
        print("Error al ejecutar la operación automática.")

def vender(api, id_operacion):
    """
    Realiza una operación de venta en IQ Option utilizando el ID de la operación.
    """
    # Aquí se usa el método sell_option o un método similar si está disponible en la API.
    resultado = api.sell_option(id_operacion)
    if resultado:
        print(f"Operación de venta ejecutada para la ID de operación: {id_operacion}")
    else:
        print("Error al ejecutar la operación de venta.")


