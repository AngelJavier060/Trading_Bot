# ai_module.py

import random

def decision_de_ia():
    """
    Toma una decisión de IA usando un modelo simple. Puede mejorarse usando ML.
    """
    decision = random.choice(["comprar", "vender", "esperar"])
    print(f"Decisión de IA: {decision}")
    return decision

def predecir_direccion():
    """
    Predice la dirección probable para la próxima operación.
    """
    return random.choice(["call", "put"])
