# Arquitectura del Backend - Trading Bot

Este documento describe la estructura y el flujo de datos del backend del bot de trading.

## 1. Estructura de Carpetas

```text
backend/
├── api/                    # Capa de transporte (Flask)
│   ├── controllers/        # Lógica de orquestación de peticiones
│   ├── routes/             # Definición de endpoints y blueprints
│   └── utils/              # Helpers para la API (validadores, etc.)
├── models/                 # Definiciones de datos y esquemas
│   └── schemas.py          # Validaciones Pydantic para la API
├── services/               # Capa de lógica de negocio
│   ├── ai/                 # Estrategias y predicciones técnicas
│   ├── risk_manager.py     # Gestión de límites diarios y capital
│   ├── trade_logger.py     # Registro estructurado de eventos en JSONL
│   └── trading_service.py  # Singleton para gestionar sesiones (IQ, MT5, QX)
├── data/                   # Almacenamiento persistente simple (JSON/JSONL)
├── legacy/                 # Archivos antiguos mantenidos como referencia
└── run.py                  # Punto de entrada principal de la aplicación
```

## 2. Flujo de una Petición

1.  **Request**: El frontend envía una petición a un endpoint (ej. `POST /api/trading/order`).
2.  **Ruta**: `api/routes/trading_routes.py` recibe la petición y la pasa al controlador.
3.  **Validación**: El decorador `@validate_schema` en el controlador usa Pydantic (`models/schemas.py`) para asegurar que los datos sean correctos.
4.  **Controlador**: `api/controllers/trading_controller.py` interactúa con el `TradingService` para obtener la sesión activa.
5.  **Servicio de Riesgo**: Antes de operar, se consulta a `services/risk_manager.py`.
6.  **Ejecución**: Se llama al provider correspondiente (IQ Option, MT5, etc.).
7.  **Logging**: Cada evento se guarda en `data/trade_log.jsonl` vía `services/trade_logger.py`.
8.  **Response**: El controlador devuelve una respuesta JSON consistente.

## 3. Componentes Clave

### TradingService (Singleton)
Gestiona el estado global de las conexiones. Asegura que no se dupliquen sesiones y permite que diferentes controladores compartan el acceso a las plataformas de trading.

### Estrategia Explicable (EMA + RSI)
Ubicada en `services/ai/prediction_service.py`, esta lógica no solo devuelve una señal (CALL/PUT), sino que genera un objeto `decision` con:
-   **Reasons**: Lista de razones en texto humano.
-   **Confidence**: Nivel de confianza basado en la fuerza de la tendencia.
-   **Indicators**: Valores exactos de RSI y EMAs en el momento del análisis.

### Gestión de Riesgo
El `risk_manager.py` rastrea:
-   Monto total invertido en el día.
-   Número de operaciones realizadas.
-   Reseteo automático al cambiar de fecha.

## 4. Endpoints Principales

-   `GET /api/trading/scan`: Escaneo multiactivo en tiempo real.
-   `GET /api/trading/trades`: Historial estructurado de operaciones y análisis.
-   `POST /api/trading/basic-strategy`: Ejecución manual o automática de la estrategia IA.
-   `GET /api/trading/risk-state`: Estado actual del capital y límites diarios.

## 5. Cómo Añadir una Nueva Estrategia

1.  Crear la función de análisis en `services/ai/prediction_service.py`. Debe devolver un diccionario con `signal`, `confidence`, `reasons` e `indicators`.
2.  Añadir el nombre de la estrategia en `models/schemas.py` si es necesario.
3.  Llamar a la nueva función desde `TradingController` o crear un nuevo endpoint en `trading_routes.py`.
