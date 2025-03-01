from flask import jsonify, request
import logging
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

class QuotexController:
    def __init__(self):
        self.driver = None
        self.connected = False
        self.current_account_type = "PRACTICE"

    def connect(self):
        try:
            data = request.json
            credentials = data.get('credentials', {})
            account_type = data.get('account_type', 'PRACTICE')
            
            email = credentials.get('email')
            password = credentials.get('password')

            if not email or not password:
                return jsonify({'error': 'Credenciales incompletas'}), 400

            # Configurar Chrome
            chrome_options = Options()
            chrome_options.add_argument('--headless')  # Ejecutar en modo headless
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')

            # Inicializar el driver
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)

            # Navegar a Quotex
            self.driver.get('https://qxbroker.com/en/sign-in')
            
            # Esperar y encontrar elementos
            wait = WebDriverWait(self.driver, 10)
            
            # Login
            email_input = wait.until(EC.presence_of_element_located((By.NAME, "email")))
            password_input = self.driver.find_element(By.NAME, "password")
            
            email_input.send_keys(email)
            password_input.send_keys(password)
            
            # Click en login
            login_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            login_button.click()
            
            # Esperar a que cargue la página principal
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".trading-platform")))
            
            # Cambiar tipo de cuenta si es necesario
            if account_type == "REAL":
                account_switch = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".switch-account")))
                account_switch.click()

            # Obtener balance
            balance_element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".balance")))
            balance = float(balance_element.text.replace("$", "").strip())

            self.connected = True
            self.current_account_type = account_type

            return jsonify({
                'status': 'connected',
                'message': 'Conexión exitosa con Quotex',
                'accountInfo': {
                    'account_type': account_type,
                    'balance': balance,
                    'currency': 'USD',
                    'email': email
                }
            })

        except Exception as e:
            logging.error(f"Error en la conexión Quotex: {str(e)}")
            if self.driver:
                self.driver.quit()
            return jsonify({
                'status': 'error',
                'message': f'Error al conectar: {str(e)}'
            }), 500

    def disconnect(self):
        try:
            if self.driver:
                self.driver.quit()
            self.connected = False
            return jsonify({
                'status': 'success',
                'message': 'Desconexión exitosa'
            })
        except Exception as e:
            logging.error(f"Error al desconectar: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def check_connection(self):
        try:
            if not self.connected or not self.driver:
                return jsonify({
                    'status': 'disconnected',
                    'message': 'No hay conexión activa'
                })

            # Verificar si seguimos conectados
            self.driver.current_url
            return jsonify({
                'status': 'connected',
                'message': 'Conexión activa',
                'accountInfo': {
                    'account_type': self.current_account_type
                }
            })
        except:
            return jsonify({
                'status': 'disconnected',
                'message': 'Conexión perdida'
            }) 