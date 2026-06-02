class AccountModel {
  final bool connected;
  final double balance;
  final String currency;
  final String accountType;
  final String platform;
  final String? email;

  const AccountModel({
    required this.connected,
    required this.balance,
    this.currency = 'USD',
    this.accountType = 'DEMO',
    this.platform = 'iqoption',
    this.email,
  });

  factory AccountModel.disconnected() => const AccountModel(
        connected: false,
        balance: 0,
      );

  factory AccountModel.fromJson(Map<String, dynamic> json) {
    // El backend Flask envuelve datos en `accountInfo` (misma forma que la web).
    final nested = json['accountInfo'];
    final Map<String, dynamic> flat = Map<String, dynamic>.from(json);
    if (nested is Map) {
      nested.forEach((k, v) {
        flat[k.toString()] = v;
      });
    }
    return AccountModel(
      connected: (flat['connected'] as bool?) == true ||
          flat['status'] == 'connected' ||
          json['status'] == 'connected',
      balance: (flat['balance'] as num?)?.toDouble() ?? 0,
      currency: flat['currency']?.toString() ?? 'USD',
      accountType: flat['account_type']?.toString() ?? 'DEMO',
      platform: flat['platform']?.toString() ?? 'iqoption',
      email: flat['email']?.toString(),
    );
  }
}
