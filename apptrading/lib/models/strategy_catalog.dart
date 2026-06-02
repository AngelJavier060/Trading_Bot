/// Catálogo de estrategias alineado con el dashboard web (`TradingDashboard.tsx`):
/// — IQ Option: nombres y descripciones como en la pestaña IQ.
/// — MT5: mismas 4 opciones que la web; cada una se mapea a un motor del backend
///   (`AVAILABLE_STRATEGIES` en Flask) para ejecución real del bot.
class PlatformStrategyDef {
  final String engineId;
  final String title;
  final String description;
  final String riskLabel;

  const PlatformStrategyDef({
    required this.engineId,
    required this.title,
    required this.description,
    required this.riskLabel,
  });
}

abstract final class StrategyCatalog {
  /// Pestaña IQ Option — títulos coinciden con `iqStrategies` en la web.
  static const List<PlatformStrategyDef> iqOption = [
    PlatformStrategyDef(
      engineId: 'ema_rsi',
      title: 'EMA + RSI',
      description:
          'Tendencia con confirmación de sobreventa/sobrecompra',
      riskLabel: 'Bajo',
    ),
    PlatformStrategyDef(
      engineId: 'macd',
      title: 'MACD',
      description: 'Cruce de medias rápidas para scalping de 1 min',
      riskLabel: 'Volátil',
    ),
    PlatformStrategyDef(
      engineId: 'bollinger',
      title: 'Bollinger Bands',
      description: 'Operativa en volatilidad extrema y ruptura de bandas',
      riskLabel: 'Volátil',
    ),
    PlatformStrategyDef(
      engineId: 'rsi_divergence',
      title: 'RSI Divergence',
      description: 'Divergencias de RSI para reversiones de precio',
      riskLabel: 'Medio',
    ),
  ];

  /// Pestaña MT5 — títulos coinciden con `mt5Strategies` en la web.
  /// Mapeo a motor: cada etiqueta corresponde a una estrategia implementada en backend.
  static const List<PlatformStrategyDef> mt5 = [
    PlatformStrategyDef(
      engineId: 'ichimoku',
      title: 'Ichimoku Cloud',
      description:
          'Tendencia multi-timeframe con soporte y resistencia dinámica',
      riskLabel: 'Medio',
    ),
    PlatformStrategyDef(
      engineId: 'ema_rsi',
      title: 'Swing Trading',
      description:
          'Captura de movimientos intermedios con gestión de posición',
      riskLabel: 'Bajo',
    ),
    PlatformStrategyDef(
      engineId: 'bollinger',
      title: 'Grid Trading',
      description:
          'Sistema de rejilla para mercados laterales y ranging',
      riskLabel: 'Medio',
    ),
    PlatformStrategyDef(
      engineId: 'macd',
      title: 'Trend Following',
      description:
          'Seguimiento de tendencia con múltiples confirmaciones',
      riskLabel: 'Bajo',
    ),
  ];

  static Set<String> defaultMt5Selection() => {
        'Ichimoku Cloud',
        'Swing Trading',
      };

  static List<String> mt5LabelsToEngineIds(Set<String> labels) {
    final out = <String>{};
    for (final opt in mt5) {
      if (labels.contains(opt.title)) {
        out.add(opt.engineId);
      }
    }
    return out.toList();
  }

  /// Recupera etiquetas MT5 conocidas a partir de IDs del motor (config antigua).
  static Set<String> engineIdsToMt5Labels(Iterable<String> engineIds) {
    final ids = engineIds.map((e) => e.toLowerCase().trim()).toSet();
    final out = <String>{};
    for (final opt in mt5) {
      if (ids.contains(opt.engineId)) {
        out.add(opt.title);
      }
    }
    return out;
  }

  static List<String> iqEngineIdsToWebLabels(List<String> engineIds) {
    final map = {for (final o in iqOption) o.engineId: o.title};
    return engineIds
        .map((id) => map[id.toLowerCase().trim()] ?? id)
        .toList();
  }

  static String normalizeEngineId(String id) {
    final s = id.toLowerCase().trim();
    if (s == 'macd_scalper') return 'macd';
    return s;
  }
}
