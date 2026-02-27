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

    def check_connect(self):
        if self.connection:
            return self.connection.check_connect()
        return False

    def buy(self, amount, active, action, expiration):
        if not self.connection:
            return False, "Not connected"
        return self.connection.buy(amount, active, action, expiration)

    def check_win_v4(self, id_number):
        if not self.connection:
            return None, None
        return self.connection.check_win_v4(id_number)

    def is_asset_open(self, asset_name):
        """Check if asset is currently open for trading."""
        if not self.connection:
            return False
        
        try:
            # get_all_open_time returns a dict of schedules
            # We need to check if the specific asset is open now
            # This is a simplified check, relying on the API's asset info if available
            # Or we can try to get candles - if we get recent candles, it's likely open
            # But a more robust way using the library:
            
            # Use 'binary' or 'turbo' or 'digital' depending on what we trade.
            # Assuming 'binary' or 'turbo' for now.
            
            # Quick check: try to get 1 candle. If it fails or is old, might be closed.
            # Better: check schedule.
            
            times = self.connection.get_all_open_time()
            # times structure: { 'turbo': { 'EURUSD': { 'open': True, ... } }, ... }
            
            for type_name in ['turbo', 'binary', 'digital']:
                if type_name in times:
                    if asset_name in times[type_name]:
                        return times[type_name][asset_name]['open']
            
            # If not found in those lists, maybe it's OTC or crypto?
            # Let's assume false if not explicitly found open
            return False
        except Exception as e:
            print(f"Error checking if asset open: {e}")
            # Fallback to true to let the buy method try and fail if closed
            return True
