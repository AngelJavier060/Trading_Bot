import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class SettingsProvider extends ChangeNotifier {
  static const String _urlKey = 'server_url';
  /// Al subir este número, las apps con producción en [AppConfig] resetean la URL
  /// guardada una vez (evita quedar pegados en 10.0.2.2 tras instalar APK viejo).
  static const String _urlRevisionKey = 'server_url_config_revision';
  static const int _currentUrlRevision = 3;
  static const int _defaultPort = 5000;

  /// Producción si está configurada; si no, mismo criterio que [AppConfig.resolvedBaseUrl]
  /// (emulador Android, localhost en iOS/web/desktop).
  static String get _defaultUrl => AppConfig.resolvedBaseUrl;

  /// URLs candidatas que se prueban en orden cuando el servidor no responde.
  static List<String> get _candidates {
    final list = <String>[
      'http://10.0.2.2:$_defaultPort', // Android emulator
      'http://localhost:$_defaultPort',
      'http://127.0.0.1:$_defaultPort',
      // IPs típicas en redes domésticas
      'http://192.168.0.102:$_defaultPort',
      'http://192.168.1.102:$_defaultPort',
      'http://192.168.0.100:$_defaultPort',
      'http://192.168.1.100:$_defaultPort',
    ];
    return list;
  }

  String _serverUrl = _defaultUrl;
  bool _loaded = false;

  String get serverUrl => _serverUrl;
  bool get loaded => _loaded;

  static bool looksLikeLocalDevServer(String url) {
    final u = url.toLowerCase().trim();
    return u.contains('10.0.2.2') ||
        u.contains('127.0.0.1') ||
        u.contains('localhost');
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final rev = prefs.getInt(_urlRevisionKey) ?? 0;

    if (AppConfig.isProductionConfigured && rev < _currentUrlRevision) {
      await prefs.setString(_urlKey, AppConfig.resolvedBaseUrl);
      await prefs.setInt(_urlRevisionKey, _currentUrlRevision);
      _serverUrl = AppConfig.resolvedBaseUrl;
      _loaded = true;
      notifyListeners();
      return;
    }

    var url = prefs.getString(_urlKey) ?? _defaultUrl;
    // Si ya publicamos URL de producción en AppConfig pero el usuario tenía
    // guardada una URL de emulador/PC local, pasar a producción.
    if (AppConfig.isProductionConfigured &&
        url.isNotEmpty &&
        looksLikeLocalDevServer(url)) {
      url = AppConfig.resolvedBaseUrl;
      await prefs.setString(_urlKey, url);
    }
    _serverUrl = url;
    _loaded = true;
    notifyListeners();
  }

  Future<void> setServerUrl(String url) async {
    _serverUrl = url.trimRight().replaceAll(RegExp(r'/$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_urlKey, _serverUrl);
    notifyListeners();
  }

  /// Prueba varias URLs candidatas y persiste la primera que responda.
  /// Devuelve la URL elegida o `null` si ninguna respondió.
  ///
  /// Si [AppConfig.isProductionConfigured], **no** se hace fallback a emulador/LAN:
  /// evita que un Flask local “robe” la URL y la app deje de ver el mismo backend
  /// que la web en producción (sesión IQ / historial / bot desincronizados).
  Future<String?> autoDetect({Duration perTry = const Duration(seconds: 2)}) async {
    final tried = <String>{};

    Future<bool> tryUrl(String url, Duration timeout) async {
      if (tried.contains(url)) return false;
      tried.add(url);
      try {
        // El backend Flask expone /test sin auth (ver backend/api/__init__.py).
        final res = await http.get(
          Uri.parse('$url/test'),
          headers: const {
            'Accept': 'application/json',
            'User-Agent': 'apptrading/1.0 (autoDetect)',
          },
        ).timeout(timeout);
        if (res.statusCode == 200) {
          await setServerUrl(url);
          return true;
        }
      } catch (_) {}
      return false;
    }

    final queue = <String>[];
    if (AppConfig.isProductionConfigured) {
      queue.add(AppConfig.resolvedBaseUrl);
      // URL guardada solo si no es claramente dev (evita repetir 10.0.2.2).
      if (_serverUrl.isNotEmpty &&
          !looksLikeLocalDevServer(_serverUrl) &&
          !queue.contains(_serverUrl)) {
        queue.add(_serverUrl);
      }
      final prodTimeout = perTry.inMilliseconds >= 5000
          ? perTry
          : const Duration(seconds: 15);
      for (final url in queue) {
        if (await tryUrl(url, prodTimeout)) return _serverUrl;
      }
      return null;
    }

    if (!queue.contains(_serverUrl)) queue.add(_serverUrl);
    for (final c in _candidates) {
      if (!queue.contains(c)) queue.add(c);
    }
    for (final url in queue) {
      if (await tryUrl(url, perTry)) return _serverUrl;
    }
    return null;
  }
}
