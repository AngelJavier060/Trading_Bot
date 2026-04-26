import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String _baseUrl = AppConfig.apiBase;

  void setBaseUrl(String url) {
    _baseUrl = '$url/api';
  }

  String get currentBaseUrl => _baseUrl.replaceAll('/api', '');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  Future<Map<String, dynamic>> _get(String path) async {
    final uri = Uri.parse('$_baseUrl$path');
    try {
      final response = await http.get(uri, headers: _headers).timeout(AppConfig.timeout);
      return _parse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('No se pudo conectar al servidor: $e');
    }
  }

  Future<Map<String, dynamic>> _post(String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('$_baseUrl$path');
    try {
      final response = await http
          .post(uri, headers: _headers, body: body != null ? jsonEncode(body) : null)
          .timeout(AppConfig.timeout);
      return _parse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('No se pudo conectar al servidor: $e');
    }
  }

  Map<String, dynamic> _parse(http.Response response) {
    try {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) {
        throw ApiException(
          data['message']?.toString() ?? 'Error del servidor',
          statusCode: response.statusCode,
        );
      }
      return data;
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Respuesta inválida del servidor');
    }
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> checkConnection() => _get('/trading/check-connection');

  Future<Map<String, dynamic>> connect({
    required String email,
    required String password,
    String accountType = 'PRACTICE',
  }) =>
      _post('/trading/connect', {
        'platform': 'iqoption',
        'email': email,
        'password': password,
        'account_type': accountType,
        'accountType': accountType, // some backends accept camelCase
      });

  Future<Map<String, dynamic>> disconnect() => _post('/trading/disconnect');

  Future<Map<String, dynamic>> getAccountInfo() => _get('/trading/account-info');

  // ─── Unified Broker API (preferred) ───────────────────────────────────────

  Future<Map<String, dynamic>> brokerStatus() => _get('/broker/status');

  Future<Map<String, dynamic>> brokerConnect({
    required String platform, // 'iqoption' | 'mt5'
    required Map<String, dynamic> credentials,
  }) =>
      _post('/broker/connect', {
        'platform': platform,
        ...credentials,
      });

  Future<Map<String, dynamic>> brokerDisconnect() => _post('/broker/disconnect');

  Future<Map<String, dynamic>> brokerAccount() => _get('/broker/account');

  Future<Map<String, dynamic>> brokerSwitchAccount(String accountType) =>
      _post('/broker/switch-account', {
        'account_type': accountType,
        'accountType': accountType,
      });

  // ─── Bot ────────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getLiveStatus() => _get('/live/status');

  Future<Map<String, dynamic>> startBot(Map<String, dynamic> config) =>
      _post('/live/start', config);

  Future<Map<String, dynamic>> stopBot() => _post('/live/stop');

  // ─── Trading ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> scanMarket({
    String platform = 'iqoption',
    List<String> symbols = const ['EURUSD', 'GBPUSD', 'USDJPY'],
    List<String> strategies = const ['ema_rsi'],
  }) =>
      _post('/live/scan', {
        'platform': platform,
        'symbols': symbols,
        'strategies': strategies,
      });

  Future<Map<String, dynamic>> executeTrade({
    required String symbol,
    required String direction,
    required double amount,
    String strategy = 'ema_rsi',
    double confidence = 70,
    String platform = 'iqoption',
    String accountType = 'PRACTICE',
    int expiration = 5,
    Map<String, dynamic>? indicators,
    List<String>? reasons,
  }) =>
      _post('/live/execute', {
        'symbol': symbol,
        'direction': direction,
        'amount': amount,
        'strategy': strategy,
        'confidence': confidence,
        'platform': platform,
        'account_type': accountType,
        'expiration': expiration,
        'indicators': indicators ?? {},
        'reasons': reasons ?? ['Manual trade'],
      });

  // ─── History ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getHistory({int limit = 20}) =>
      _get('/live/history?limit=$limit');

  Future<Map<String, dynamic>> getSignals() => _get('/live/signals');

  Future<Map<String, dynamic>> getLossAnalysis() => _get('/live/loss-analysis');

  Future<Map<String, dynamic>> getStrategyRanking() => _get('/live/strategy-ranking');

  // ─── Strategies ─────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getStrategies() => _get('/strategies/');

  // ─── Test ────────────────────────────────────────────────────────────────────

  Future<bool> ping() async {
    try {
      final uri = Uri.parse('${_baseUrl.replaceAll('/api', '')}/test');
      final response = await http.get(uri).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
