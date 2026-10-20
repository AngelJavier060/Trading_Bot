"""Trading bot para MetaTrader 5.

Paquetes:
    broker      Conexión con el terminal MT5 (cuenta, símbolos, velas, órdenes).
    strategies  Estrategias técnicas que generan señales BUY/SELL.
    risk        Tamaño de lote, stops por ATR y límites de riesgo.
    planner     Convierte una señal en un plan de operación (misma lógica en vivo y backtest).
    backtest    Simulación bar a bar con datos históricos de MT5.
    live        Bot en vivo (bucle de escaneo, gestión de posiciones, diario).
    api         API HTTP (Flask) para controlar todo lo anterior.
"""

__version__ = "2.0.0"
