class TradeModel {
  final String id;
  final String symbol;
  final String direction;
  final double amount;
  final String result;
  final double? pnl;
  final double? entryPrice;
  final double? exitPrice;
  final String platform;
  final String accountType;
  final String strategyUsed;
  final double confidence;
  final DateTime timestamp;
  final String? expirationTime;
  final int? expirationMinutes;
  final String? orderIdPlatform;
  final bool? isSynced;

  const TradeModel({
    required this.id,
    required this.symbol,
    required this.direction,
    required this.amount,
    required this.result,
    this.pnl,
    this.entryPrice,
    this.exitPrice,
    this.platform = 'iqoption',
    this.accountType = 'DEMO',
    this.strategyUsed = '',
    this.confidence = 0,
    required this.timestamp,
    this.expirationTime,
    this.expirationMinutes,
    this.orderIdPlatform,
    this.isSynced,
  });

  bool get isWin => result == 'win';
  bool get isLoss => result == 'loss';
  bool get isPending => result == 'pending';
  bool get isSentToBroker => orderIdPlatform != null && orderIdPlatform!.isNotEmpty;

  String get resultLabel {
    switch (result) {
      case 'win':
        return '✅ GANADA';
      case 'loss':
        return '❌ PERDIDA';
      default:
        return '⏳ ACTIVA';
    }
  }

  String get directionLabel => direction.toUpperCase();

  DateTime? get expiresAt {
    if (expirationTime != null) {
      return DateTime.tryParse(expirationTime!);
    }
    if (expirationMinutes != null) {
      return timestamp.add(Duration(minutes: expirationMinutes!));
    }
    return timestamp.add(const Duration(minutes: 5));
  }

  Duration get timeRemaining {
    final exp = expiresAt;
    if (exp == null) return Duration.zero;
    final remaining = exp.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  factory TradeModel.fromJson(Map<String, dynamic> json) {
    return TradeModel(
      id: json['id']?.toString() ?? '',
      symbol: json['symbol']?.toString() ?? '',
      direction: json['direction']?.toString() ?? 'call',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      result: json['result']?.toString() ?? 'pending',
      pnl: (json['pnl'] as num?)?.toDouble(),
      entryPrice: (json['entry_price'] as num?)?.toDouble(),
      exitPrice: (json['exit_price'] as num?)?.toDouble(),
      platform: json['platform']?.toString() ?? 'iqoption',
      accountType: json['account_type']?.toString() ?? 'DEMO',
      strategyUsed: json['strategy_used']?.toString() ?? '',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
      expirationTime: json['expiration_time']?.toString(),
      expirationMinutes: (json['expiration_minutes'] as num?)?.toInt(),
      orderIdPlatform: json['order_id_platform']?.toString(),
      isSynced: json['is_synced'] as bool?,
    );
  }
}
