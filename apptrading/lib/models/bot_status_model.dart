class BotStatusModel {
  final bool isRunning;
  final bool isScanning;
  final String mode;
  final String platform;
  final String accountType;
  final double balance;
  final int totalTrades;
  final int winningTrades;
  final int losingTrades;
  final double winRate;
  final double totalPnl;
  final List<Map<String, dynamic>> activeTrades;
  final List<String> errors;
  final Map<String, dynamic>? lastSignal;
  final Map<String, dynamic>? lastTrade;

  const BotStatusModel({
    required this.isRunning,
    required this.isScanning,
    required this.mode,
    required this.platform,
    required this.accountType,
    required this.balance,
    required this.totalTrades,
    required this.winningTrades,
    required this.losingTrades,
    required this.winRate,
    required this.totalPnl,
    required this.activeTrades,
    required this.errors,
    this.lastSignal,
    this.lastTrade,
  });

  int get activeCount => activeTrades.length;

  factory BotStatusModel.empty() => const BotStatusModel(
        isRunning: false,
        isScanning: false,
        mode: 'manual',
        platform: 'iqoption',
        accountType: 'DEMO',
        balance: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        activeTrades: [],
        errors: [],
      );

  factory BotStatusModel.fromJson(Map<String, dynamic> json) {
    final raw = json['bot_status'] ?? json;
    return BotStatusModel(
      isRunning: raw['is_running'] as bool? ?? false,
      isScanning: raw['is_scanning'] as bool? ?? false,
      mode: raw['mode']?.toString() ?? 'manual',
      platform: raw['platform']?.toString() ?? 'iqoption',
      accountType: raw['account_type']?.toString() ?? 'DEMO',
      balance: (raw['balance'] as num?)?.toDouble() ?? 0,
      totalTrades: (raw['total_trades'] as num?)?.toInt() ?? 0,
      winningTrades: (raw['winning_trades'] as num?)?.toInt() ?? 0,
      losingTrades: (raw['losing_trades'] as num?)?.toInt() ?? 0,
      winRate: (raw['win_rate'] as num?)?.toDouble() ?? 0,
      totalPnl: (raw['total_pnl'] as num?)?.toDouble() ?? 0,
      activeTrades: (raw['active_trades'] as List?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          [],
      errors: (raw['errors'] as List?)?.map((e) => e.toString()).toList() ?? [],
      lastSignal: raw['last_signal'] as Map<String, dynamic>?,
      lastTrade: raw['last_trade'] as Map<String, dynamic>?,
    );
  }
}
