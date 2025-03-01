import logging

def obtener_cuenta(api):
    try:
        balance = api.profile.balance
        tipo_cuenta = "REAL" if api.profile.balance_type == 1 else "PRACTICE"
        return {"status": "success", "account_type": tipo_cuenta, "balance": balance}, 200
    except Exception as e:
        logging.exception("Error al obtener información de la cuenta")
        return {"status": "error", "message": str(e)}, 500
