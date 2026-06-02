class SignalModel {
  final String symbol;
  final String direction;
  final double confidence;
  final String strategy;
  final List<String> reasons;
  final Map<String, dynamic> indicators;
  final DateTime timestamp;

  const SignalModel({
    required this.symbol,
    required this.direction,
    required this.confidence,
    required this.strategy,
    required this.reasons,
    required this.indicators,
    required this.timestamp,
  });

  bool get isBullish => direction.toLowerCase() == 'call';
  bool get isStrong => confidence >= 75;

  String get confidenceLabel {
    if (confidence >= 80) return 'Muy Alta';
    if (confidence >= 70) return 'Alta';
    if (confidence >= 60) return 'Media';
    return 'Baja';
  }

  factory SignalModel.fromJson(Map<String, dynamic> json) {
    return SignalModel(
      symbol: json['symbol']?.toString() ?? '',
      direction: json['direction']?.toString() ?? 'call',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      strategy: json['strategy']?.toString() ?? '',
      reasons: (json['reasons'] as List?)?.map((e) => e.toString()).toList() ?? [],
      indicators: json['indicators'] as Map<String, dynamic>? ?? {},
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
