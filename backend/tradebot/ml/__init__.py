"""Machine Learning como filtro de señales.

La estrategia propone una operación; el modelo estima la probabilidad de que
termine en ganancia según el contexto del mercado; solo se ejecutan las que
superan `ml_threshold`. Las etiquetas para entrenar salen de simular cada señal
histórica con las mismas reglas de SL/TP/tiempo que usa el bot.
"""
