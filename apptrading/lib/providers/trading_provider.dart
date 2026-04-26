import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/bot_status_model.dart';
import '../models/trade_model.dart';
import '../models/signal_model.dart';
import '../models/account_model.dart';
import '../services/api_service.dart';
import '../config/app_config.dart';

enum ConnectionStatus { unknown, checking, connected, disconnected }

class TradingProvider extends ChangeNotifier {
  final ApiService _api = ApiService();

  // ─── State ─────────────────────────────────────────────────────────────────
  ConnectionStatus connectionStatus = ConnectionStatus.unknown;
  AccountModel account = AccountModel.disconnected();
  String connectedPlatform = ''; // 'iqoption' | 'mt5' | ''
  BotStatusModel botStatus = BotStatusModel.empty();
  List<TradeModel> trades = [];
  List<SignalModel> signals = [];

  bool isLoadingTrades = false;
  bool isLoadingSignals = false;
  bool isExecutingTrade = false;
  bool isTogglingBot = false;
  bool isScanning = false;

  String? lastError;
  String? lastSuccess;

  // Config
  String _serverUrl = '';
  String tradingMode = 'manual';
  String platform = 'iqoption'; // default preferred
  String accountType = 'PRACTICE';
  double betAmount = 10;
  int expiration = 5;
  double minConfidence = 65;
  int maxConcurrent = 3;
  int maxDailyTrades = 50;
  List<String> selectedSymbols = ['EURUSD', 'GBPUSD', 'USDJPY'];
  List<String> selectedStrategies = ['ema_rsi'];

  // Timers
  Timer? _statusTimer;
  Timer? _historyTimer;

  // ─── Init / Dispose ────────────────────────────────────────────────────────

  void init(String serverUrl) {
    _serverUrl = serverUrl;
    _api.setBaseUrl(serverUrl);
    _startPolling();
    checkConnection();
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  void _startPolling() {
    _statusTimer?.cancel();
    _historyTimer?.cancel();

    final statusInterval = botStatus.isRunning
        ? AppConfig.statusPollMs
        : AppConfig.statusPollMs * 2;

    _statusTimer = Timer.periodic(Duration(milliseconds: statusInterval), (_) {
      _pollStatus();
    });

    _historyTimer = Timer.periodic(
      const Duration(milliseconds: AppConfig.historyPollMs),
      (_) => refreshTrades(),
    );
  }

  void _stopPolling() {
    _statusTimer?.cancel();
    _historyTimer?.cancel();
  }

  void _restartPolling() {
    _stopPolling();
    _startPolling();
  }

  Future<void> _pollStatus() async {
    try {
      final data = await _api.getLiveStatus();
      botStatus = BotStatusModel.fromJson(data);
      notifyListeners();
    } catch (_) {}
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  Future<void> checkConnection() async {
    connectionStatus = ConnectionStatus.checking;
    notifyListeners();
    try {
      // Prefer unified broker status when available
      Map<String, dynamic> data;
      try {
        data = await _api.brokerStatus();
      } catch (_) {
        data = await _api.checkConnection();
      }
      final connected = data['connected'] == true || data['status'] == 'connected';
      connectionStatus =
          connected ? ConnectionStatus.connected : ConnectionStatus.disconnected;
      if (connected) {
        connectedPlatform = (data['platform']?.toString() ?? platform).toLowerCase();
        await _loadAccountInfo();
      }
    } catch (_) {
      connectionStatus = ConnectionStatus.disconnected;
    }
    notifyListeners();
  }

  Future<bool> connectBroker({
    required String targetPlatform, // 'iqoption' | 'mt5'
    required Map<String, dynamic> credentials,
    String accType = 'PRACTICE',
  }) async {
    _clearMessages();
    connectionStatus = ConnectionStatus.checking;
    notifyListeners();
    try {
      Map<String, dynamic> data;
      try {
        data = await _api.brokerConnect(platform: targetPlatform, credentials: credentials);
      } catch (_) {
        // fallback legacy IQ endpoint
        data = await _api.connect(
          email: credentials['email']?.toString() ?? '',
          password: credentials['password']?.toString() ?? '',
          accountType: accType,
        );
      }
      if (data['status'] == 'success' || data['connected'] == true) {
        connectionStatus = ConnectionStatus.connected;
        accountType = accType;
        connectedPlatform = targetPlatform;
        await _loadAccountInfo();
        // try ensure account type
        if ((account.accountType.toUpperCase()) != accType.toUpperCase()) {
          try {
            await _api.brokerSwitchAccount(accType);
            await _loadAccountInfo();
          } catch (_) {}
        }
        _setSuccess('Conectado a ${targetPlatform.toUpperCase()}');
        notifyListeners();
        return true;
      } else {
        connectionStatus = ConnectionStatus.disconnected;
        _setError(data['message'] ?? 'Error al conectar');
        notifyListeners();
        return false;
      }
    } catch (e) {
      connectionStatus = ConnectionStatus.disconnected;
      _setError(e.toString());
      notifyListeners();
      return false;
    }
  }

  Future<void> disconnect() async {
    try {
      try {
        await _api.brokerDisconnect();
      } catch (_) {
        await _api.disconnect();
      }
    } catch (_) {}
    connectionStatus = ConnectionStatus.disconnected;
    account = AccountModel.disconnected();
    connectedPlatform = '';
    notifyListeners();
  }

  Future<void> _loadAccountInfo() async {
    try {
      Map<String, dynamic> data;
      try {
        data = await _api.brokerAccount();
      } catch (_) {
        data = await _api.getAccountInfo();
      }
      account = AccountModel.fromJson({
        ...data,
        'connected': true,
        'account_type': accountType,
        'platform': connectedPlatform.isNotEmpty ? connectedPlatform : platform,
      });
      notifyListeners();
    } catch (_) {}
  }

  // ─── Bot ────────────────────────────────────────────────────────────────────

  Future<void> toggleBot() async {
    isTogglingBot = true;
    _clearMessages();
    notifyListeners();
    try {
      if (botStatus.isRunning) {
        await _api.stopBot();
        _setSuccess('Bot detenido');
      } else {
        await _api.startBot({
          'mode': tradingMode,
          'platform': platform,
          'symbols': selectedSymbols,
          'strategies': selectedStrategies,
          'amount': betAmount,
          'min_confidence': minConfidence,
          'expiration': expiration,
          'max_concurrent': maxConcurrent,
          'max_daily_trades': maxDailyTrades,
        });
        _setSuccess('Bot iniciado en modo ${tradingMode.toUpperCase()}');
      }
      await _pollStatus();
      _restartPolling();
    } catch (e) {
      _setError(e.toString());
    }
    isTogglingBot = false;
    notifyListeners();
  }

  // ─── Trading ────────────────────────────────────────────────────────────────

  Future<TradeModel?> executeTrade({
    required String symbol,
    required String direction,
    double? amount,
    String? strategy,
    double confidence = 70,
  }) async {
    isExecutingTrade = true;
    _clearMessages();
    notifyListeners();
    try {
      final data = await _api.executeTrade(
        symbol: symbol,
        direction: direction,
        amount: amount ?? betAmount,
        strategy: strategy ?? (selectedStrategies.isNotEmpty ? selectedStrategies[0] : 'ema_rsi'),
        confidence: confidence,
        platform: platform,
        accountType: accountType,
        expiration: expiration,
      );

      final brokerConnected = connectionStatus == ConnectionStatus.connected;
      if (!brokerConnected) {
        _setSuccess('Operación simulada: $direction ${symbol.toUpperCase()}');
      } else {
        _setSuccess('✅ Operación ejecutada en IQ Option: $direction $symbol');
      }

      await refreshTrades();
      final trade = data['trade'] != null
          ? TradeModel.fromJson(data['trade'] as Map<String, dynamic>)
          : null;
      isExecutingTrade = false;
      notifyListeners();
      return trade;
    } catch (e) {
      _setError(e.toString());
      isExecutingTrade = false;
      notifyListeners();
      return null;
    }
  }

  Future<void> scanMarket() async {
    isScanning = true;
    _clearMessages();
    notifyListeners();
    try {
      final data = await _api.scanMarket(
        platform: platform,
        symbols: selectedSymbols,
        strategies: selectedStrategies,
      );
      final rawSignals = data['signals'] as List? ?? [];
      signals = rawSignals
          .map((e) => SignalModel.fromJson(e as Map<String, dynamic>))
          .where((s) => s.confidence >= minConfidence)
          .toList()
        ..sort((a, b) => b.confidence.compareTo(a.confidence));
    } catch (e) {
      _setError('Error al escanear: $e');
    }
    isScanning = false;
    notifyListeners();
  }

  // ─── History ────────────────────────────────────────────────────────────────

  Future<void> refreshTrades({int limit = 20}) async {
    isLoadingTrades = true;
    notifyListeners();
    try {
      final data = await _api.getHistory(limit: limit);
      final rawTrades = data['trades'] as List? ?? [];
      trades = rawTrades
          .map((e) => TradeModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {}
    isLoadingTrades = false;
    notifyListeners();
  }

  Future<void> refreshSignals() async {
    isLoadingSignals = true;
    notifyListeners();
    try {
      final data = await _api.getSignals();
      final rawSignals = data['signals'] as List? ?? [];
      signals = rawSignals
          .map((e) => SignalModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {}
    isLoadingSignals = false;
    notifyListeners();
  }

  // ─── Config helpers ─────────────────────────────────────────────────────────

  void updateConfig({
    String? mode,
    double? amount,
    int? exp,
    double? confidence,
    int? maxConc,
    int? maxDaily,
    List<String>? symbols,
    List<String>? strategies,
    String? accType,
  }) {
    if (mode != null) tradingMode = mode;
    if (amount != null) betAmount = amount;
    if (exp != null) expiration = exp;
    if (confidence != null) minConfidence = confidence;
    if (maxConc != null) maxConcurrent = maxConc;
    if (maxDaily != null) maxDailyTrades = maxDaily;
    if (symbols != null) selectedSymbols = symbols;
    if (strategies != null) selectedStrategies = strategies;
    if (accType != null) accountType = accType;
    notifyListeners();
  }

  void setServerUrl(String url) {
    _serverUrl = url;
    _api.setBaseUrl(url);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  List<TradeModel> get pendingTrades =>
      trades.where((t) => t.isPending).toList();

  List<TradeModel> get completedTrades =>
      trades.where((t) => !t.isPending).toList();

  int get todayWins {
    final today = DateTime.now();
    return trades.where((t) {
      final d = t.timestamp;
      return t.isWin && d.year == today.year && d.month == today.month && d.day == today.day;
    }).length;
  }

  int get todayLosses {
    final today = DateTime.now();
    return trades.where((t) {
      final d = t.timestamp;
      return t.isLoss && d.year == today.year && d.month == today.month && d.day == today.day;
    }).length;
  }

  double get todayPnl {
    final today = DateTime.now();
    return trades.where((t) {
      final d = t.timestamp;
      return !t.isPending && d.year == today.year && d.month == today.month && d.day == today.day;
    }).fold(0.0, (sum, t) => sum + (t.pnl ?? 0));
  }

  bool get isConnected => connectionStatus == ConnectionStatus.connected;

  void _setError(String msg) {
    lastError = msg;
    lastSuccess = null;
  }

  void _setSuccess(String msg) {
    lastSuccess = msg;
    lastError = null;
  }

  void _clearMessages() {
    lastError = null;
    lastSuccess = null;
  }

  void clearMessages() {
    _clearMessages();
    notifyListeners();
  }

  Future<bool> pingServer() => _api.ping();
}
