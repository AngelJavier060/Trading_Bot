# TradeBot MT5 — Frontend (Next.js)

Panel web del sistema. Consume la API del backend (`backend/`); no accede a MT5 ni
a la base de datos directamente.

## Puesta en marcha

```powershell
cd frontend
npm install
copy NUL .env.local          # y escribe: NEXT_PUBLIC_API_URL=http://127.0.0.1:5000
npm run dev                  # desarrollo: http://localhost:3000
npm run build; npm run start # producción
```

`NEXT_PUBLIC_API_URL` se fija al compilar: si cambias la URL del backend, vuelve a ejecutar `npm run build`.
El backend debe incluir el origen del panel en `FRONTEND_ORIGINS` (CORS).

## Páginas

| Ruta | Qué hace |
|---|---|
| `/login` | Inicio de sesión. La primera vez, crea el usuario administrador |
| `/` | Resumen: cuenta, P&L, equity, posiciones, último análisis por símbolo (en vivo) |
| `/estrategia` | Elegir, configurar, probar (backtest), validar (walk-forward) e iniciar el bot |
| `/grafico` | Velas de MT5 con las señales del bot y los niveles SL/TP |
| `/senales`, `/operaciones` | Historial de señales (en vivo) y operaciones con su resultado |
| `/pruebas`, `/experimentos` | Walk-forward, vivo contra backtest, veredictos y aprobación de cambios |
| `/cuenta` | Conectar o cambiar la cuenta MT5 (demo/real, cuentas guardadas) |
| `/eventos`, `/ajustes` | Diario del sistema; contraseña, usuarios y configuración en JSON |

## Estructura

```
src/lib/api.ts       cliente de la API (token de sesión, errores, tareas en segundo plano)
src/lib/system.tsx   estado en vivo compartido (canal /api/stream, Server-Sent Events)
src/lib/types.ts     tipos de los datos del backend
src/components/      interfaz reutilizable y gráficos (lightweight-charts de TradingView)
src/app/login/       inicio de sesión
src/app/(panel)/     páginas protegidas con el menú lateral
```

Comprobaciones: `npm run lint` y `npm run build` (incluye la verificación de tipos de TypeScript).
