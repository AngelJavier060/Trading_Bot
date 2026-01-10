from iqoptionapi.stable_api import IQ_Option

def connect_to_iq_option(username, password):
    try:
        iq_option = IQ_Option(username, password)
        iq_option.connect()
        if iq_option.check_connect():
            print("Conectado exitosamente a IQ Option")
            return iq_option
        else:
            print("Error al conectar a IQ Option")
            print("Estado de la conexión:", iq_option.check_connect())
    except Exception as e:
        print("Ocurrió un error:", str(e))
    return None

def get_account_info(iq_option):
    try:
        profile = iq_option.get_profile_ansyc()
        balances = iq_option.get_balances()
        for balance in balances:
            if balance["type"] == 1:  # Tipo de cuenta real
                real_balance = balance["amount"]
            elif balance["type"] == 4:  # Tipo de cuenta demo
                demo_balance = balance["amount"]
        account_type = profile["balance_type"]
        if account_type == 1:
            return real_balance, account_type
        else:
            return demo_balance, account_type
    except Exception as e:
        print("Ocurrió un error al obtener la información de la cuenta:", str(e))
        return None, None
