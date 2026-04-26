# Trading Bot — App Móvil Flutter

App móvil profesional para controlar y monitorear el trading bot desde el teléfono.

## Estructura

```
lib/
├── main.dart                    # Entry point
├── config/
│   ├── app_config.dart          # URL base, timeouts, intervalos de polling
│   └── app_theme.dart           # Tema oscuro profesional (colores, tipografía)
├── models/
│   ├── trade_model.dart         # Modelo de operación
│   ├── bot_status_model.dart    # Estado del bot
│   ├── signal_model.dart        # Señales de mercado
│   └── account_model.dart       # Cuenta IQ Option
├── services/
│   └── api_service.dart         # Cliente HTTP para el backend
├── providers/
│   ├── trading_provider.dart    # Estado global + polling + acciones
│   └── settings_provider.dart  # Configuración persistente (URL servidor)
├── screens/
│   ├── splash_screen.dart       # Carga inicial
│   ├── main_shell.dart          # Navegación inferior (5 tabs)
│   ├── dashboard_screen.dart    # Métricas, balance, operaciones activas
│   ├── trading_screen.dart      # Ejecución manual + señales automáticas
│   ├── history_screen.dart      # Historial filtrable con gráficos
│   ├── analysis_screen.dart     # P&L chart, pie chart, por símbolo
│   └── settings_screen.dart     # Conexión IQ, URL servidor, config trading
└── widgets/
    ├── metric_card.dart         # Tarjeta de métrica
    ├── trade_card.dart          # Tarjeta de operación con countdown
    ├── signal_card.dart         # Señal con botones ejecutar/ignorar
    ├── countdown_widget.dart    # Temporizador regresivo en tiempo real
    └── connection_banner.dart   # Banner de modo simulación
```

## Instalación

### Requisitos
- Flutter 3.16+ / Dart 3.2+
- Android SDK 21+ / iOS 12+

### Pasos

```bash
cd apptrading
flutter pub get
flutter run
```

### Para producción (APK)

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://tu-dominio.com
```

### Para iOS

```bash
flutter build ipa --dart-define=API_BASE_URL=https://tu-dominio.com
```

## Configuración del servidor

Al abrir la app por primera vez, ve a **Config** → introduce la URL de tu servidor backend.

| Entorno | URL |
|---------|-----|
| Local Android Emulator | `http://10.0.2.2:5000` |
| Local red WiFi | `http://192.168.X.X:5000` |
| Producción | `https://api-trading.tu-dominio.com` |

## Funcionalidades

### Dashboard
- Balance en tiempo real
- Estado del bot (activo/inactivo)
- Métricas: total operaciones, win rate, P&L diario y total
- Operaciones activas con countdown regresivo
- Operaciones recientes con resultado WIN/LOSS

### Trading
**Manual:**
- Selector de par (EURUSD, GBPUSD, USDJPY, etc.)
- Slider de monto (\$1–\$500) con accesos rápidos
- Selector de expiración (1, 2, 3, 5, 10, 15 min)
- Botones CALL ▲ y PUT ▼ con feedback inmediato

**Auto / Señales:**
- Escaneo de mercado on-demand
- Tarjetas de señal con confianza, razones, acciones
- Toggle de inicio/parada del bot automático

### Historial
- Lista completa filtrable: Todas | Ganadas | Perdidas | Activas
- Agrupación por fecha
- Resumen de win rate y P&L

### Análisis
- Gráfica de P&L acumulado (fl_chart)
- Pie chart win/loss
- Rendimiento por símbolo
- Log de señales recientes
- Activación/desactivación de estrategias

### Configuración
- URL del servidor con test de conectividad
- Conexión/desconexión de IQ Option (PRACTICE / REAL)
- Monto, expiración, confianza mínima
- Límites de riesgo (máx. concurrentes, máx. diarias)
- Modo manual / automático

## Badges de operaciones

| Badge | Significado |
|-------|------------|
| 🔗 IQ | Ejecutada en IQ Option (broker conectado) |
| 🔸 SIM | Simulación local (sin broker) |
| ✅ GANADA | Resultado ganado |
| ❌ PERDIDA | Resultado perdido |
| ⏳ ACTIVA | En curso (muestra countdown) |
