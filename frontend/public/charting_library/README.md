# TradingView Advanced Charts Library

Esta carpeta es un *placeholder*. La librería **no está incluida** en este
repositorio porque TradingView la distribuye bajo un acuerdo de licencia que
exige solicitarla manualmente.

## Pasos para activar el motor "TV Pro" en el dashboard

1. **Solicita acceso (gratis)** en
   [https://www.tradingview.com/charting-library/](https://www.tradingview.com/charting-library/).
   En unos días recibirás una invitación al repositorio privado de GitHub
   `tradingview/charting_library`.

2. **Descarga el contenido** del repositorio (carpeta `charting_library/`) y
   **cópialo dentro de esta carpeta** (`frontend/public/charting_library/`).
   Al terminar deberías tener archivos como:

   ```
   frontend/public/charting_library/
   ├── charting_library.standalone.js   ← obligatorio
   ├── charting_library.js
   ├── bundles/
   ├── static/
   └── ...
   ```

3. Reinicia el frontend (`npm run dev`).

4. En el dashboard de **Trading en Vivo** elige el motor **TV Pro** desde el
   selector "Lightweight / TV Pro" arriba del gráfico.

## Cómo funciona la integración

- El componente `frontend/components/charts/TradingViewProChart.tsx` carga
  dinámicamente `/charting_library/charting_library.standalone.js`. Si la
  librería falta, muestra un cartel guía y deja activo el modo Lightweight.
- El datafeed personalizado vive en `frontend/utils/tvDatafeed.ts` y consume
  los endpoints UDF expuestos por el backend Flask en `/api/tv/*`
  (`config`, `symbols`, `search`, `history`, `time`).
- Cuando el bot abre operaciones, sus entradas se dibujan automáticamente con
  `chart.createShape()` (flecha verde para BUY, roja para SELL, con la
  confianza encima) y las líneas de TP/SL se dibujan con
  `chart.createOrderLine()`.

## Notas

- No hace falta tocar el backend cuando bajes la librería: ya está expuesto
  el datafeed UDF en `/api/tv/*`.
- Las actualizaciones en vivo usan polling adaptativo (cada 5–30 segundos
  según el timeframe) sobre `/api/tv/history` para evitar mantener una
  conexión SSE/WebSocket dedicada por chart.
- El selector de motor se persiste en `localStorage` con la clave
  `chartEngine`.
