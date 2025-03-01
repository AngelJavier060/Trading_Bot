import pytest
from iqoptionapi.stable_api import IQ_Option

@pytest.fixture(scope="module")
def iq_instance():
    """
    Configura una instancia de IQ Option para todas las pruebas.
    """
    USERNAME = "tu_correo"  # Reemplaza con tus credenciales
    PASSWORD = "tu_contraseña"
    iq = IQ_Option(USERNAME, PASSWORD)
    connected, reason = iq.connect()
    assert connected, f"No se pudo conectar a IQ Option: {reason}"
    return iq
