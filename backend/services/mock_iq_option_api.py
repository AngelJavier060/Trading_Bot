class IQOptionAPI:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.logged_in = False

    def is_logged_in(self):
        # Simula que siempre inicia sesión correctamente
        return self.logged_in

    def login(self):
        # Simulación de inicio de sesión
        if self.username and self.password:
            self.logged_in = True
            return True
        else:
            self.logged_in = False
            return False

    def change_balance(self, balance_type):
        # Simula el cambio entre cuenta DEMO y REAL
        print(f"Balance cambiado a {balance_type}")

    def get_balance(self):
        # Devuelve un balance simulado
        return 1000.00
