import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthProvider extends ChangeNotifier {
  static const _kLoggedIn = 'auth_logged_in';
  static const _kUsername = 'auth_username';

  bool _loaded = false;
  bool _loggedIn = false;
  String _username = '';

  bool get loaded => _loaded;
  bool get loggedIn => _loggedIn;
  String get username => _username;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _loggedIn = prefs.getBool(_kLoggedIn) ?? false;
    _username = prefs.getString(_kUsername) ?? '';
    _loaded = true;
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    if (username.isEmpty || password.isEmpty) return false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kLoggedIn, true);
    await prefs.setString(_kUsername, username);
    _loggedIn = true;
    _username = username;
    notifyListeners();
    return true;
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kLoggedIn, false);
    await prefs.remove(_kUsername);
    _loggedIn = false;
    _username = '';
    notifyListeners();
  }
}
