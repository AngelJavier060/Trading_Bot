# TradeBot MT5 — Backend

Sistema de trading autónomo conectado a **MetaTrader 5**:
- estrategias técnicas y filtro de Machine Learning;
- gestión de riesgo por ATR;
- backtesting propio y repetición en el Probador de Estrategias de MT5;
- validación walk-forward y registro de experimentos;
- API REST + tiempo real para el frontend Next.js (`../frontend`), alertas por Telegram y visualización dentro de MT5;
- PostgreSQL para usuarios, cuentas, señales, operaciones, equity y experimentos;
- pensado para correr 24/7 en un VPS Windows (ver [deploy/README_VPS.md](deploy/README_VPS.md)).

## Arquitectura

```
                 ┌───────────────────────── run.py ─────────────────────────┐
 MT5 terminal ◄──┤ broker/   conexión, símbolos (EURUSD→EURUSD-T), velas, órdenes │
 (cuenta)        │ live/     bot (ciclo por vela cerrada) + supervisor (reanuda,  │
                 │           reconecta, detecta bloqueos)                        │
                 │ planner   señal → filtro ML → riesgo → plan (SL/TP ATR, lote) │◄─ mismo código
                 │ storage   PostgreSQL: usuarios, señales, operaciones, equity… │   en backtest
                 │ bridge    estado/señales → Common\Files\TradeBot (indicador)  │
                 │ api/      API REST + /api/stream (tiempo real) + login        │
                 │ notify    Telegram                                            │
                 └───────────────────────────────────────────────────────────────┘
 Investigación (scripts/):  backtest · walk-forward · ML · Probador MT5 · vivo vs backtest
```

Principio rector: **la lógica que se prueba es la que se ejecuta**. El backtest, el
etiquetado del ML, el walk-forward y el bot en vivo comparten `planner.py`,
`risk/` y `ml/features.py`; los tests verifican que coinciden.

## Puesta en marcha (PC o VPS Windows)

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File deploy\install.ps1   # venv, dependencias, tests, MQL5
.venv\Scripts\python run.py                                     # API en http://127.0.0.1:5000
```

Antes, crea la base en PostgreSQL y pon `DATABASE_URL` en `.env`
(`scripts\migrate_sqlite_to_pg.py` copia datos de una base SQLite anterior).
El panel es el frontend (`../frontend`, http://localhost:3000): en la página *Estrategia*
arranca el bot en modo simulación. La configuración
se guarda y el supervisor la retoma tras cualquier reinicio. Para 24/7 sigue
[deploy/README_VPS.md](deploy/README_VPS.md) (arranque automático, vigilante, túnel, Telegram).

## Flujo de trabajo para mejorar el sistema

1. **Idea** → backtest rápido:
   `scripts\backtest.py --symbol EURUSD --timeframe H1 --strategy all --days 365`
2. **Validación fuera de muestra** (walk-forward, queda registrada como experimento):
   `scripts\walkforward.py --symbol EURUSD --timeframe H1 --strategy macd --days 730`
   - optimizar SL/TP: `--mode optimize --grid "sl_atr_mult=1,1.5,2;tp_atr_mult=1.5,2.5,3.5"`
   - filtro ML: `--mode ml --ml-threshold 0.5`
3. **Contraste con MT5**: `scripts\mt5_tester.py run ...` repite las mismas entradas en el
   Probador de Estrategias (ticks reales) y compara operación por operación.
4. **Demo en vivo** con `dry_run` y luego operando; cada cierto tiempo
   `scripts\reconcile.py --days 14` compara lo que hizo el bot con lo que dice el backtest.
5. **Decisión**: `scripts\experiments.py list / compare A B / promote ID`.
   Un cambio solo se aprueba si, fuera de muestra, mejora a la referencia en PF y R medio,
   sin disparar el drawdown, con suficientes operaciones y P(ventaja real) ≥ 80 %.

## Scripts

| Script | Qué hace |
|---|---|
| `check_mt5.py` | Diagnóstico de conexión, cuenta, símbolos (solo lectura) |
| `backtest.py` | Backtest de una o todas las estrategias (`--ml-model` para usar un filtro) |
| `walkforward.py` | Validación walk-forward fija / optimizada / ML + registro y veredicto |
| `train_model.py` | Entrena el filtro ML con varios símbolos y lo guarda en `data/models` |
| `mt5_tester.py` | `install` (compila MQL5), `run` (Probador), `import`, `analyze` (cualquier EA) |
| `reconcile.py` | Vivo contra backtest (señales y operaciones) |
| `experiments.py` | Listar, ver, comparar, aprobar o rechazar experimentos |
| `demo_trade.py` | Orden real de 0.01 en DEMO con SL/TP y cierre (prueba de ejecución) |

## Programas MQL5 (`mql5/`, se instalan con `mt5_tester.py install`)

| Programa | Uso |
|---|---|
| Indicador `TradeBotMonitor` | En el mismo equipo que el bot: panel de estado + señales con SL/TP en el gráfico |
| EA `TradeBotRemote` | En otro PC: lo mismo consultando la API por HTTP (no opera) |
| EA `TradeBotReplay` | Probador: ejecuta las entradas exportadas por nuestro backtest |
| `TradeBotRecorder.mqh` | Incluible en cualquier EA para exportar sus resultados y analizarlos aquí |

## Machine Learning

El modelo **no genera señales: las filtra**. Para cada señal de la estrategia estima la
probabilidad de que termine en ganancia según el contexto: volatilidad, tendencia,
RSI, ADX, posición en el rango, hora, spread, etc. Las etiquetas salen de simular cada
señal histórica con las mismas reglas de salida del bot. El modelo queda atado a la
estrategia y al SL/TP con que se entrenó: el bot se niega a usarlo con otros.
Solo debe activarse si `walkforward.py --mode ml` lo aprueba.

## Seguridad

- `dry_run` por defecto; cuentas reales bloqueadas salvo `ALLOW_REAL_ACCOUNT=true`.
- El bot solo toca sus posiciones (`BOT_MAGIC`).
- Usuarios con contraseña (hash) y sesión firmada que caduca; bloqueo tras 5 intentos fallidos;
  rol de solo lectura. `API_TOKEN` es un token de servicio para el EA remoto y el vigilante.
- La API escucha en `127.0.0.1` y solo acepta peticiones del navegador desde `FRONTEND_ORIGINS` (CORS).
- Límites: riesgo por operación, pérdida diaria, posiciones abiertas, operaciones por día, spread.

## Datos (`data/`)

La base de datos es PostgreSQL (`DATABASE_URL`). En `data/` quedan `logs/`, `cache/` (histórico),
`models/` y `backtests/`.

## API

Autenticación: `POST /api/auth/login` → `Authorization: Bearer <token>`. Público: `/api/health`,
`/api/auth/status`, `/api/auth/setup` (crea el primer administrador). Tiempo real: `GET /api/stream?token=`
(Server-Sent Events con estado, señales y eventos). Resto: `/api/mt5/*`, `/api/bot/*`, `/api/strategies`,
`/api/backtest`, `/api/jobs/*`, `/api/experiments`, `/api/signals`, `/api/trades`, `/api/stats`, `/api/users`.

## Tests

`.venv\Scripts\python -m pytest`: 127 tests con un MT5 simulado; no necesitan el terminal.
