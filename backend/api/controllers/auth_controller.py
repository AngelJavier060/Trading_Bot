from services.iq_option import IQOptionService
from dotenv import load_dotenv
import os

# Cargar las variables desde el archivo .env
load_dotenv()

USERNAME = os.getenv("IQOPTION_USERNAME")
PASSWORD = os.getenv("IQOPTION_PASSWORD")

def connect_to_iq_option():
    try:
        service = IQOptionService(USERNAME, PASSWORD)
        success, message = service.connect()

        if success:
            return {"message": message}, 200
        else:
            return {"error": message}, 400
    except Exception as e:
        return {"error": str(e)}, 500







