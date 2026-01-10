# operations.py

import logging
import time


def comprar(api, activo, cantidad, direccion, expiracion):
    """Realiza una compra en IQ Option y devuelve True/False según resultado."""
    direccion = direccion.lower()
    if direccion not in ['call', 'put']:
        print("Dirección inválida. Use 'call' o 'put'.")
        return False

    try:
        status, id_compra = api.buy(cantidad, activo, direccion, expiracion)
    except Exception as e:
        logging.error(f"Error al ejecutar la compra: {e}")
        return False

    if status and id_compra:
        print(
            f"Compra ejecutada: Activo={activo}, Cantidad={cantidad}, "
            f"Dirección={direccion.capitalize()}, Expiración={expiracion} minutos."
        )
        return True
    else:
        print("Error al ejecutar la compra.")
        return False

def ejecutar_operacion(api):
    """
    Ejecuta una operación automática de ejemplo.
    """
    activo = "EURUSD"
    cantidad = 10
    direccion = "call"
    expiracion = 1

    status, id_operacion = api.buy(cantidad, activo, direccion, expiracion)
    if status and id_operacion:
        print(
            f"Operación automática ejecutada: Activo={activo}, Cantidad={cantidad}, "
            f"Dirección={direccion.capitalize()}, Expiración={expiracion} minuto."
        )
        return True
    else:
        print("Error al ejecutar la operación automática.")
        return False

def vender(api, id_operacion):
    """Realiza una operación de venta en IQ Option utilizando el ID de la operación."""
    try:
        resultado = api.sell_option(id_operacion)
    except Exception as e:
        logging.error(f"Error al ejecutar la venta: {e}")
        return False

    if resultado:
        print(f"Operación de venta ejecutada para la ID de operación: {id_operacion}")
        return True
    else:
        print("Error al ejecutar la operación de venta.")
        return False


