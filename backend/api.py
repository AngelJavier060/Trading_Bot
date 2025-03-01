# api.py

from fastapi import FastAPI
from pydantic import BaseModel
from IQ_OPTION_BOT.backend.operations import comprar, vender  # Importa las funciones que ya tienes

app = FastAPI()

# Modelos de datos para recibir parámetros de compra/venta
class OperacionRequest(BaseModel):
    activo: str
    cantidad: float
    direccion: str
    expiracion: int

@app.get("/")
def read_root():
    return {"message": "API del bot de IQ Option está en funcionamiento"}

@app.post("/comprar")
def realizar_compra(operacion: OperacionRequest):
    # Ejecutar la función de compra usando los datos recibidos
    resultado = comprar(None, operacion.activo, operacion.cantidad, operacion.direccion, operacion.expiracion)
    return {"resultado": resultado}

@app.post("/vender")
def realizar_venta(id_operacion: int):
    # Ejecutar la función de venta
    resultado = vender(None, id_operacion)
    return {"resultado": resultado}
