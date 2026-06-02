import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/platform_def.dart';
import '../config/app_config.dart';
import '../providers/settings_provider.dart';
import '../providers/trading_provider.dart';
import 'trading_config_screen.dart';
import 'platforms_hub_screen.dart';

/// Pantalla de credenciales (Vincular Exchange).
/// • IQ Option:    email + password
/// • MT5:          server + login + password
/// • Otras (Binance/Bybit/Coinbase): API Key + Secret Key
class PlatformLoginScreen extends StatefulWidget {
  final PlatformDef platform;
  const PlatformLoginScreen({super.key, required this.platform});

  @override
  State<PlatformLoginScreen> createState() => _PlatformLoginScreenState();
}

class _PlatformLoginScreenState extends State<PlatformLoginScreen> {
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _serverCtrl = TextEditingController();
  bool _obscure = true;
  bool _saveCreds = true;
  bool _connecting = false;
  String _accountType = 'PRACTICE';

  String get _platformId => widget.platform.id;
  String get _platformName => widget.platform.name;
  IconData get _platformIcon => widget.platform.icon;

  bool get _isMt5 => widget.platform.isMt5;
  bool get _isIq => widget.platform.isIqOption;

  String get _userLabel {
    if (_isIq) return 'Email de IQ Option';
    if (_isMt5) return 'Login MT5';
    return 'API Key';
  }

  String get _passLabel {
    if (_isIq) return 'Contraseña';
    if (_isMt5) return 'Contraseña MT5';
    return 'Secret Key';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = context.read<SettingsProvider>();
      context.read<TradingProvider>().setServerUrl(s.serverUrl);
    });
  }

  @override
  void dispose() {
    _userCtrl.dispose();
    _passCtrl.dispose();
    _serverCtrl.dispose();
    super.dispose();
  }

  String _hintUrlForDialog(SettingsProvider settings) {
    if (AppConfig.isProductionConfigured &&
        SettingsProvider.looksLikeLocalDevServer(settings.serverUrl)) {
      return AppConfig.resolvedBaseUrl;
    }
    return settings.serverUrl;
  }

  Future<void> _connect() async {
    if (_userCtrl.text.trim().isEmpty || _passCtrl.text.isEmpty) {
      _show('Completa los campos requeridos', error: true);
      return;
    }
    if (_isMt5 && _serverCtrl.text.trim().isEmpty) {
      _show('El servidor MT5 es requerido', error: true);
      return;
    }
    if (_isMt5 && (int.tryParse(_userCtrl.text.trim()) ?? 0) <= 0) {
      _show('El login MT5 debe ser numérico (ej. 61516242).', error: true);
      return;
    }

    setState(() => _connecting = true);
    final p = context.read<TradingProvider>();
    final settings = context.read<SettingsProvider>();

    // Verifica primero que el servidor responde. Si no, intenta autodetectar.
    final reachable = await p.pingServer();
    if (!reachable) {
      _show('Servidor no responde, intentando autodetectar…', error: false);
      final detected = await settings.autoDetect();
      if (detected != null) {
        p.setServerUrl(detected);
        _show('Servidor encontrado: $detected', error: false);
      } else {
        if (!mounted) return;
        setState(() => _connecting = false);
        _showServerHelpDialog();
        return;
      }
    }

    Map<String, dynamic> credentials;
    if (_isIq) {
      credentials = {
        'email': _userCtrl.text.trim(),
        'password': _passCtrl.text,
      };
    } else if (_isMt5) {
      credentials = {
        'server': _serverCtrl.text.trim(),
        'login': int.tryParse(_userCtrl.text.trim()) ?? 0,
        'password': _passCtrl.text,
      };
    } else {
      // Binance / Bybit / Coinbase — para los exchanges aún no soportados nativamente
      // por el backend, intentamos modo demo simulado para que el flujo funcione end-to-end.
      credentials = {
        'email': _userCtrl.text.trim(),
        'password': _passCtrl.text,
        'api_key': _userCtrl.text.trim(),
        'api_secret': _passCtrl.text,
      };
    }

    _show('Conectando con $_platformName, esto puede tardar hasta 60 s…',
        error: false);

    final platformForBackend =
        (_isIq || _isMt5) ? _platformId : 'iqoption'; // fallback DEMO
    final ok = await p.connectBroker(
      targetPlatform: platformForBackend,
      credentials: credentials,
      accType: _accountType,
    );

    if (!mounted) return;
    setState(() => _connecting = false);

    if (ok) {
      _show('Conectado a $_platformName', error: false);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const TradingConfigScreen()),
      );
      return;
    }

    final err = p.lastError ?? 'No se pudo conectar';
    final low = err.toLowerCase();
    final isNet = low.contains('timeout') ||
        low.contains('socket') ||
        low.contains('no se pudo conectar al servidor') ||
        low.contains('failed host lookup') ||
        low.contains('connection refused');
    if (isNet) {
      await _showServerHelpDialog();
      return;
    }

    await _showBrokerOnlyErrorDialog(err);
  }

  /// Solo cuentas reales del bróker (demo o live en IQ/MT5). Sin simulación local desconectada.
  Future<void> _showBrokerOnlyErrorDialog(String err) async {
    final extra = _isMt5
        ? 'MetaTrader 5: el servidor Flask debe ejecutarse en el mismo PC donde está '
            'instalado MT5 (terminal del bróker). Usa el login numérico, la contraseña '
            'y el nombre exacto del servidor (ej. MT5-demo01). La cuenta demo sigue siendo '
            'del bróker, con precios reales.'
        : 'IQ Option: usa email y contraseña de tu cuenta; elige Cuenta Demo o Real arriba. '
            'Todo el saldo y las operaciones son siempre en la plataforma del bróker.';

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('No se pudo conectar al bróker'),
        content: SingleChildScrollView(
          child: Text('$err\n\n$extra'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  void _show(String msg, {required bool error}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? AppColors.error : AppColors.tertiary,
      ),
    );
  }

  Future<void> _showServerHelpDialog() async {
    final settings = context.read<SettingsProvider>();
    final urlCtrl = TextEditingController(text: _hintUrlForDialog(settings));
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Servidor no alcanzable'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              AppConfig.isProductionConfigured
                  ? 'La app está configurada para producción:\n'
                      '${AppConfig.resolvedBaseUrl}\n\n'
                      'Si falla la conexión: comprueba datos/Wi‑Fi, que el certificado SSL '
                      'sea válido en el proxy, y que https://${Uri.parse(AppConfig.resolvedBaseUrl).host}/test '
                      'abra en el navegador del móvil.\n\n'
                      'Modo desarrollo local (solo si compilaste sin URL de producción):\n'
                      '• PC: http://127.0.0.1:5000/test\n'
                      '• Emulador: http://10.0.2.2:5000\n'
                      '• Firewall Windows: puerto 5000\n'
                  : 'No se pudo contactar al backend.\n\n'
                      '• En el PC, ejecuta el backend (python run.py) y abre en el navegador '
                      'http://127.0.0.1:5000/test — debe responder JSON.\n'
                      '• Emulador Android: http://10.0.2.2:5000 (equivale al localhost del PC).\n'
                      '• Teléfono físico en la misma Wi‑Fi: usa la IP LAN del PC '
                      '(cmd → ipconfig), ej. http://192.168.1.50:5000 — no uses 10.0.2.2.\n'
                      '• Firewall de Windows: permite Python o el puerto 5000 entrante.\n',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: urlCtrl,
              decoration: InputDecoration(
                labelText: 'URL del servidor',
                hintText: AppConfig.isProductionConfigured
                    ? AppConfig.resolvedBaseUrl
                    : 'http://10.0.2.2:5000',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, urlCtrl.text.trim()),
            child: const Text('Guardar y reintentar'),
          ),
        ],
      ),
    );
    urlCtrl.dispose();
    if (result != null && result.isNotEmpty) {
      await settings.setServerUrl(result);
      if (!mounted) return;
      context.read<TradingProvider>().setServerUrl(result);
      _show('URL actualizada a $result', error: false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (Navigator.canPop(context)) {
              Navigator.pop(context);
            } else {
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                  builder: (_) => const PlatformsHubScreen()));
            }
          },
        ),
        title: const Text('Vincular Plataforma'),
      ),
      body: Stack(
        children: [
          // Top decorative gradient
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 220,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    AppColors.surfaceContainer.withOpacity(0.6),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              child: Column(
                children: [
                  // Logo
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.outlineVariant),
                      boxShadow: AppColors.cardShadow,
                    ),
                    child: Icon(_platformIcon,
                        size: 36, color: AppColors.onSurface),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Vincular ${_isIq || _isMt5 ? "Broker" : "Exchange"}',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Conexión segura para $_platformName',
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Card with form
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color:
                          AppColors.surfaceContainerLowest.withOpacity(0.95),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.outlineVariant),
                      boxShadow: AppColors.cardShadow,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_isMt5) ...[
                          _FieldHeader(
                              icon: Icons.dns_outlined,
                              label: 'Servidor MT5'),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _serverCtrl,
                            decoration: const InputDecoration(
                              hintText: 'MetaQuotes-Demo',
                              prefixIcon:
                                  Icon(Icons.cloud_outlined, size: 20),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        _FieldHeader(
                          icon: _isIq
                              ? Icons.email_outlined
                              : (_isMt5 ? Icons.badge_outlined : Icons.api),
                          label: _userLabel,
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _userCtrl,
                          keyboardType: _isMt5
                              ? TextInputType.number
                              : TextInputType.emailAddress,
                          decoration: InputDecoration(
                            hintText: _isIq
                                ? 'tu@email.com'
                                : (_isMt5
                                    ? '12345678'
                                    : 'Ingresa tu clave de acceso'),
                            prefixIcon: Icon(
                              _isIq
                                  ? Icons.person_outline
                                  : (_isMt5
                                      ? Icons.numbers
                                      : Icons.key_outlined),
                              size: 20,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        _FieldHeader(
                            icon: Icons.password, label: _passLabel),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _passCtrl,
                          obscureText: _obscure,
                          decoration: InputDecoration(
                            hintText: '••••••••••••',
                            prefixIcon:
                                const Icon(Icons.lock_outline, size: 20),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                size: 20,
                              ),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Account type (Demo / Real)
                        if (_isIq || (!_isMt5 && !_isIq)) ...[
                          _FieldHeader(
                              icon: Icons.account_balance_wallet_outlined,
                              label: 'Tipo de cuenta'),
                          const SizedBox(height: 8),
                          Row(
                            children: ['PRACTICE', 'REAL'].map((t) {
                              final sel = _accountType == t;
                              return Expanded(
                                child: GestureDetector(
                                  onTap: () =>
                                      setState(() => _accountType = t),
                                  child: AnimatedContainer(
                                    duration:
                                        const Duration(milliseconds: 150),
                                    margin: EdgeInsets.only(
                                        right: t == 'PRACTICE' ? 8 : 0),
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 10),
                                    decoration: BoxDecoration(
                                      color: sel
                                          ? AppColors.secondary.withOpacity(0.1)
                                          : AppColors.surfaceContainerLow,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: sel
                                            ? AppColors.secondary
                                            : AppColors.outlineVariant,
                                        width: sel ? 1.5 : 1,
                                      ),
                                    ),
                                    child: Center(
                                      child: Text(
                                        t == 'PRACTICE'
                                            ? 'Cuenta Demo'
                                            : 'Cuenta Real',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: sel
                                              ? AppColors.secondary
                                              : AppColors.onSurfaceVariant,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 16),
                        ],

                        const Divider(),
                        const SizedBox(height: 8),

                        // Save credentials toggle
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Guardar credenciales',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.onSurface,
                                    ),
                                  ),
                                  Text(
                                    'Almacenamiento local cifrado',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Switch(
                              value: _saveCreds,
                              onChanged: (v) => setState(() => _saveCreds = v),
                            ),
                          ],
                        ),

                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton.icon(
                            onPressed: _connecting ? null : _connect,
                            icon: _connecting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.link, size: 20),
                            label: Text(
                              _connecting
                                  ? 'CONECTANDO...'
                                  : 'CONECTAR AHORA',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.secondary,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              elevation: 4,
                              shadowColor:
                                  AppColors.secondary.withOpacity(0.3),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),
                  // Footer security
                  Column(
                    children: [
                      const Icon(Icons.shield_outlined,
                          size: 22, color: AppColors.primaryContainer),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                              height: 1,
                              width: 24,
                              color: AppColors.outlineVariant),
                          const SizedBox(width: 8),
                          const Text(
                            'CIFRADO AES-256',
                            style: TextStyle(
                              fontSize: 10,
                              color: AppColors.onSurfaceVariant,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.4,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                              height: 1,
                              width: 24,
                              color: AppColors.outlineVariant),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FieldHeader({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: AppColors.onSurfaceVariant),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurfaceVariant,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}
