import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

class AppConfig {
  /// Marca que indica “aún no configuraste producción”: la app usará red local/emulador.
  static const String productionUrlUnset = 'CHANGE_ME_PRODUCTION_URL';

  /// Backend detrás de Nginx Proxy Manager (sin `/api` ni `/` final).
  /// Si aún no tienes SSL en el proxy, cambia a `http://api-trading.improvement-solution.com`.
  static const String productionServerUrl =
      'https://api-trading.improvement-solution.com';

  static const String _envBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String get _localDevBase {
    if (kIsWeb) return 'http://localhost:5000';
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:5000';
    } catch (_) {}
    return 'http://localhost:5000';
  }

  /// `true` si hay URL de producción real (entorno o constante editada).
  static bool get isProductionConfigured {
    final env = _envBaseUrl.trim();
    if (env.isNotEmpty) return true;
    final p = productionServerUrl.trim();
    return p.isNotEmpty && p != productionUrlUnset;
  }

  /// Base URL del API (host solo) coherente con emulador / web / iOS / producción.
  static String get resolvedBaseUrl {
    final env = _envBaseUrl.trim();
    if (env.isNotEmpty) {
      return env.replaceAll(RegExp(r'/$'), '');
    }
    final p = productionServerUrl.trim();
    if (p.isNotEmpty && p != productionUrlUnset) {
      return p.replaceAll(RegExp(r'/$'), '');
    }
    return _localDevBase;
  }

  static String get apiBase => '$resolvedBaseUrl/api';

  // Polling intervals (ms)
  static const int statusPollMs = 3000;
  static const int historyPollMs = 5000;
  static const int fastPollMs = 2000;

  // Request timeout
  static const Duration timeout = Duration(seconds: 15);
}
