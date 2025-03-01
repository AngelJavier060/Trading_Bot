from iqoptionapi import IQ_Option

class IQOptionService:
    def __init__(self, username, password, account_type="Demo"):
        self.username = username
        self.password = password
        self.account_type = account_type
        self.connection = None

    def connect(self):
        try:
            self.connection = IQ_Option(self.username, self.password)
            is_logged_in, reason = self.connection.connect()

            if is_logged_in:
                if self.account_type == "Real":
                    self.connection.change_balance("REAL")
                else:
                    self.connection.change_balance("PRACTICE")
                return True, None
            else:
                return False, reason
        except Exception as e:
            return False, str(e)

    def get_balance(self):
        if not self.connection:
            raise Exception("No conectado a la cuenta")
        return self.connection.get_balance()

    def get_balance_mode(self):
        return self.account_type
