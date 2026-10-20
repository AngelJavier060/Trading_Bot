# Despliegue 24/7 en un VPS Windows

El objetivo: que el sistema funcione aunque tu PC esté apagado. En el VPS corren el
terminal MT5 (con tu cuenta), PostgreSQL, el backend y el frontend. Tú lo miras desde
el panel web (a través de un túnel cifrado), desde el MT5 de tu PC/móvil (misma cuenta)
o por Telegram.

```
 VPS Windows: MT5 ◄─► backend :5000 (solo local) ◄─ /api ─ frontend :3000 ◄── túnel ── tu navegador
                        └─ PostgreSQL :5432 (solo local)
```

```
 VPS Windows (24/7)                                  Tu PC / móvil (cuando quieras)
 ┌──────────────────────────────────────────┐        ┌──────────────────────────────┐
 │ MT5 terminal ◄──API Python──► TradeBot   │        │ Navegador → panel web        │
 │   (cuenta broker)            ├ bot       │◄─túnel─┤ MT5 (misma cuenta) + EA       │
 │   indicador TradeBotMonitor  ├ API/panel │ cifrado│   TradeBotRemote (señales)    │
 │                              └ SQLite    │        │ Telegram (alertas)            │
 └──────────────────────────────────────────┘        └──────────────────────────────┘
```

## 1. Elegir el VPS

- **Windows Server 2019/2022**, 2 vCPU, 4 GB de RAM, 60 GB de SSD como mínimo.
- Mejor si está cerca del servidor del broker (la mayoría de brokers europeos operan en Londres).
- Pregunta a tu broker si ofrece VPS gratis o con descuento por volumen.
- No sirve el "Virtual Hosting" que se contrata dentro de MT5: solo ejecuta programas MQL5, no Python.

## 2. Preparar Windows (por Escritorio remoto)

1. Instala **MetaTrader 5** desde la web de tu broker e inicia sesión en la cuenta (empieza con DEMO).
2. En MT5:
   - Activa el botón **Algo Trading**.
   - *Herramientas > Opciones > Gráficos > Máx. barras en gráfico*: "Ilimitado" (para tener histórico largo).
   - *Herramientas > Opciones > Asesores Expertos*: marca "Permitir el trading algorítmico".
3. Instala **Python 3.12+** (python.org, marca "Add python.exe to PATH"), **Node.js LTS**
   (nodejs.org) y **Git**.
4. Instala **PostgreSQL 16 o 17** (instalador de EDB). Anota la contraseña del usuario
   `postgres` y crea la base: abre *SQL Shell (psql)* y ejecuta `CREATE DATABASE tradebot;`
5. Copia el proyecto: `git clone <tu repositorio>` (carpetas `backend` y `frontend`).

## 3. Instalar el TradeBot

```powershell
cd C:\TradeBot\backend
powershell -ExecutionPolicy Bypass -File deploy\install.ps1
```

Crea `.venv`, instala dependencias, pasa los tests, crea `.env`, comprueba la conexión
con MT5, instala/compila el indicador y los EAs, e instala y compila el frontend. Revisa `.env`:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:CLAVE@127.0.0.1:5432/tradebot` |
| `API_TOKEN` | Token de servicio para el EA TradeBotRemote y el vigilante. |
| `SECRET_KEY` | Opcional: firma de las sesiones (si falta, se genera y se guarda en la base). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alertas (ver sección 6). |
| `INSTANCE_NAME` | Prefijo de las alertas, p. ej. `VPS-1`. |
| `ALLOW_REAL_ACCOUNT` | Déjalo en `false` hasta validar en demo. |

## 4. Arranque automático

MT5 necesita una sesión de Windows abierta (no funciona como servicio). Por eso:

1. **Inicio de sesión automático**: descarga *Autologon* de Microsoft Sysinternals,
   ejecútalo e introduce el usuario y la contraseña de Windows. Tras cada reinicio
   (p. ej. por actualizaciones) la sesión se abrirá sola.
2. **Tareas programadas** (PowerShell como administrador):
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\register_tasks.ps1
   ```
   - `TradeBot-MT5`: abre MT5 al iniciar sesión.
   - `TradeBot-Sistema`: lanza el backend 60 s después y lo relanza si se cierra.
   - `TradeBot-Frontend`: lanza el panel web (puerto 3000) 90 s después y lo relanza si se cae.
   - `TradeBot-Vigilante`: cada 5 min reabre MT5 si se cerró y reinicia el sistema si
     `/api/health` falla 3 veces seguidas (p. ej. el bot se quedó colgado).
3. Abre el panel (http://localhost:3000), crea el usuario administrador, conecta la cuenta
   en *Cuenta MT5* y arranca el bot en *Estrategia* en modo **Simulación**.
   La configuración queda guardada: tras cualquier reinicio el supervisor lo retoma solo.

Prueba de fuego: reinicia el VPS y comprueba que en 2–3 minutos el panel muestra
"Bot en marcha" y llega la alerta "Sistema iniciado — retomando el bot".

## 5. Acceso remoto seguro (sin abrir puertos)

El backend y PostgreSQL escuchan solo en `127.0.0.1`. Desde fuera solo hace falta llegar al
**frontend (puerto 3000)**: el propio frontend reenvía `/api` al backend. Usa un túnel cifrado.

**Opción recomendada: Tailscale (red privada)**
1. Instala Tailscale en el VPS y en tu PC/móvil, con la misma cuenta.
2. En el VPS: `tailscale serve --bg 3000`
3. Abre `https://<nombre-del-vps>.<tu-tailnet>.ts.net` desde tus dispositivos.
   Solo tus dispositivos ven esa dirección. El panel pide usuario y contraseña.

**Alternativa: Cloudflare Tunnel** con Cloudflare Access (URL pública protegida por
inicio de sesión). Útil si quieres compartir el panel con otra persona.

No abras los puertos 5000 ni 5432 en el firewall. Si sirves el panel con otro nombre
(p. ej. el del túnel), no hace falta tocar CORS: el navegador solo habla con el frontend.

## 6. Alertas por Telegram

1. En Telegram habla con **@BotFather** → `/newbot` → copia el token.
2. Escribe cualquier mensaje a tu bot nuevo.
3. Abre `https://api.telegram.org/bot<TOKEN>/getUpdates` y copia `chat.id`.
4. Pon ambos en `.env` y reinicia el sistema.

Recibirás aperturas, cierres con su resultado, errores, desconexiones/reconexiones de
MT5, el resumen diario y los avisos del supervisor.

## 7. Ver el sistema desde MT5

- **En el VPS**: arrastra *Indicadores > TradeBot > TradeBotMonitor* a cada gráfico.
  Muestra el panel de estado y las señales (verde/rojo abiertas, azul simuladas,
  gris bloqueadas, naranja filtradas por ML) con SL/TP.
- **En tu PC o móvil**: inicia sesión en la **misma cuenta**: ves las operaciones del
  bot en tiempo real (comentario `bot <estrategia>`).
- **Señales en tu PC**: instala los EAs (`scripts\mt5_tester.py install` en tu PC),
  añade la URL del túnel en *Opciones > Asesores Expertos > Permitir WebRequest* y
  arrastra el EA *TradeBotRemote* al gráfico con `InpUrl` = URL del túnel e `InpToken` = API_TOKEN.

## 8. Probador de Estrategias automático (opcional)

Para que `scripts\mt5_tester.py run` lance el Probador sin intervención hace falta
un **segundo MT5** dedicado (el que opera no admite configuraciones del Probador mientras está abierto):

1. Copia la carpeta de MT5 a `C:\MT5Tester`.
2. Ábrelo una vez con `C:\MT5Tester\terminal64.exe /portable`, inicia sesión en la
   cuenta demo y deja que descargue el histórico.
3. En `.env`: `MT5_TESTER_PATH=C:\MT5Tester\terminal64.exe`
4. `.venv\Scripts\python scripts\mt5_tester.py install` (instala los EAs también ahí).

Sin esto, `mt5_tester.py run --manual` exporta las entradas y te indica qué poner en el Probador.

## 9. Mantenimiento

| Qué | Dónde |
|---|---|
| Logs del sistema | `data\logs\bot.log` (rota a 5 MB), `runner.log`, `watchdog.log` |
| Base de datos | `data\tradebot.db` (señales, operaciones, equity, experimentos). Haz copia periódica. |
| Actualizar el código | `git pull` → `deploy\install.ps1` → `Stop-ScheduledTask TradeBot-Sistema; Start-ScheduledTask TradeBot-Sistema` |
| Quitar el arranque automático | `deploy\register_tasks.ps1 -Remove` |
