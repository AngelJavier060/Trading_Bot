# Trading Bot — MetaTrader 5

Sistema de trading autónomo conectado a MetaTrader 5, en dos partes independientes:

```
Trading_Bot/
  backend/    Python · bot, conexión MT5, estrategias, riesgo, ML, backtesting · API REST + tiempo real
              PostgreSQL · usuarios, cuentas, señales, operaciones, equity, experimentos
  frontend/   Next.js + TypeScript · panel web (login, estrategia, gráficos, pruebas, experimentos)
```

| Parte | Corre en | Documentación |
|---|---|---|
| Backend | Windows con MT5 abierto (PC o VPS), puerto 5000 | [backend/README.md](backend/README.md) |
| Frontend | Cualquier máquina con Node.js, puerto 3000 | [frontend/README.md](frontend/README.md) |
| Despliegue 24/7 | VPS Windows | [backend/deploy/README_VPS.md](backend/deploy/README_VPS.md) |

**Arranque local con un clic:** acceso directo **TradeBot MT5** del escritorio
(`backend\deploy\create_shortcut.ps1`). Abre MT5, el backend y el frontend, y luego
el panel en http://localhost:3000. La primera vez el panel pide crear el usuario administrador.
