class AppConfig {
  // Change this to your production URL when deploying
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000',
  );

  static const String apiBase = '$baseUrl/api';

  // Polling intervals (ms)
  static const int statusPollMs = 3000;
  static const int historyPollMs = 5000;
  static const int fastPollMs = 2000;

  // Request timeout
  static const Duration timeout = Duration(seconds: 15);
}
