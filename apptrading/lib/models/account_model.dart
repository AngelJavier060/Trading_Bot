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
    return AccountModel(
      connected: json['connected'] as bool? ?? json['status'] == 'connected',
      balance: (json['balance'] as num?)?.toDouble() ?? 0,
      currency: json['currency']?.toString() ?? 'USD',
      accountType: json['account_type']?.toString() ?? 'DEMO',
      platform: json['platform']?.toString() ?? 'iqoption',
      email: json['email']?.toString(),
    );
  }
}
