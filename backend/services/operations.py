def comprar(api, activo, cantidad, direccion, expiracion):
    """Ejecuta una operación de compra."""
    try:
        resultado = api.buy(cantidad, activo, direccion, expiracion)
        return resultado
    except Exception as e:
        print(f"Error al comprar: {e}")
        return False

def vender(api, id_operacion):
    """Ejecuta una operación de venta."""
    try:
        resultado = api.sell_option(id_operacion)
        return resultado
    except Exception as e:
        print(f"Error al vender: {e}")
        return False
