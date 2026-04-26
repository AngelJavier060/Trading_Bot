import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsProvider extends ChangeNotifier {
  static const String _urlKey = 'server_url';
  static const String _defaultUrl = 'http://192.168.0.102:5000';

  String _serverUrl = _defaultUrl;
  bool _loaded = false;

  String get serverUrl => _serverUrl;
  bool get loaded => _loaded;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _serverUrl = prefs.getString(_urlKey) ?? _defaultUrl;
    _loaded = true;
    notifyListeners();
  }

  Future<void> setServerUrl(String url) async {
    _serverUrl = url.trimRight().replaceAll(RegExp(r'/$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_urlKey, _serverUrl);
    notifyListeners();
  }
}
