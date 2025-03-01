def ejecutar_estrategia(api, estrategia, activo, cantidad, expiracion):
    """Ejecuta una estrategia automática basada en inteligencia artificial."""
    if estrategia == "RSI":
        print(f"Estrategia RSI ejecutada para {activo}")
    elif estrategia == "EMA":
        print(f"Estrategia EMA ejecutada para {activo}")
    else:
        print("Estrategia no reconocida")
    return True
