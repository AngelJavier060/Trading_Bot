import pytest
from iqoptionapi.stable_api import IQ_Option

USERNAME = "tu_correo"  # Reemplaza con tus credenciales
PASSWORD = "tu_contraseña"


def test_connection():
    """
    Prueba la conexión con la API de IQ Option.
    """
    iq = IQ_Option(USERNAME, PASSWORD)
    check, reason = iq.connect()

    assert check, f"Error al conectar con IQ Option: {reason}"


def test_invalid_credentials():
    """
    Prueba conexión con credenciales inválidas.
    """
    iq = IQ_Option("correo_invalido", "contraseña_invalida")
    check, reason = iq.connect()

    assert not check, "Conexión exitosa con credenciales inválidas, lo cual es incorrecto."
    assert reason == "BAD_USERNAME_OR_PASSWORD", "El error esperado es BAD_USERNAME_OR_PASSWORD"
