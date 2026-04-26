import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/trading_provider.dart';
import '../providers/settings_provider.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _urlCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _mt5ServerCtrl = TextEditingController();
  final _mt5LoginCtrl = TextEditingController();
  final _mt5PassCtrl = TextEditingController();
  bool _obscurePass = true;
  bool _isTesting = false;
  bool _isConnecting = false;
  String? _testResult;
  String _selectedPlatform = 'iqoption'; // 'iqoption' | 'mt5'

  @override
  void initState() {
    super.initState();
    final settings = context.read<SettingsProvider>();
    _urlCtrl.text = settings.serverUrl;
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _mt5ServerCtrl.dispose();
    _mt5LoginCtrl.dispose();
    _mt5PassCtrl.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _testResult = null;
    });
    final p = context.read<TradingProvider>();
    p.setServerUrl(_urlCtrl.text.trim());
    final ok = await p.pingServer();
    setState(() {
      _isTesting = false;
      _testResult = ok ? '✅ Servidor alcanzable' : '❌ Sin respuesta del servidor';
    });
  }

  Future<void> _saveUrl() async {
    final url = _urlCtrl.text.trim();
    if (url.isEmpty) return;
    final settings = context.read<SettingsProvider>();
    await settings.setServerUrl(url);
    final p = context.read<TradingProvider>();
    p.setServerUrl(url);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('URL del servidor guardada'),
        backgroundColor: AppColors.win,
      ));
    }
  }

  Future<void> _connect() async {
    setState(() => _isConnecting = true);
    final p = context.read<TradingProvider>();
    Map<String, dynamic> credentials;
    if (_selectedPlatform == 'iqoption') {
      if (_emailCtrl.text.isEmpty || _passCtrl.text.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Email y contraseña de IQ Option requeridos'),
          backgroundColor: AppColors.loss,
        ));
        setState(() => _isConnecting = false);
        return;
      }
      credentials = {
        'email': _emailCtrl.text.trim(),
        'password': _passCtrl.text,
        'account_type': p.accountType,
      };
    } else {
      if (_mt5ServerCtrl.text.isEmpty || _mt5LoginCtrl.text.isEmpty || _mt5PassCtrl.text.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Servidor, login y contraseña de MT5 requeridos'),
          backgroundColor: AppColors.loss,
        ));
        setState(() => _isConnecting = false);
        return;
      }
      credentials = {
        'server': _mt5ServerCtrl.text.trim(),
        'login': _mt5LoginCtrl.text.trim(),
        'password': _mt5PassCtrl.text,
      };
    }

    final ok = await p.connectBroker(
      targetPlatform: _selectedPlatform,
      credentials: credentials,
      accType: p.accountType,
    );
    setState(() => _isConnecting = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? '✅ Conectado a ${_selectedPlatform.toUpperCase()}' : p.lastError ?? 'Error al conectar'),
        backgroundColor: ok ? AppColors.win : AppColors.loss,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final settings = context.watch<SettingsProvider>();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Configuración'),
        backgroundColor: AppColors.bg,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ─── Server URL ────────────────────────────────────────────────
            _SectionHeader(title: 'Paso 1 · Servidor Backend', icon: Icons.dns_outlined),
            const SizedBox(height: 10),
            TextField(
              controller: _urlCtrl,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'URL del servidor',
                hintText: 'http://192.168.0.102:5000',
                prefixIcon: const Icon(Icons.link, size: 18),
                suffixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_isTesting)
                      const Padding(
                        padding: EdgeInsets.only(right: 12),
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                        ),
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.wifi_find_outlined, size: 18),
                        onPressed: _testConnection,
                        tooltip: 'Probar conexión',
                        color: AppColors.textSecondary,
                      ),
                    IconButton(
                      icon: const Icon(Icons.save_outlined, size: 18),
                      onPressed: _saveUrl,
                      tooltip: 'Guardar',
                      color: AppColors.primary,
                    ),
                  ],
                ),
              ),
            ),
            if (_testResult != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _testResult!,
                  style: TextStyle(
                    fontSize: 12,
                    color: _testResult!.startsWith('✅')
                        ? AppColors.win
                        : AppColors.loss,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            const SizedBox(height: 24),

            // ─── IQ Option Connection ────────────────────────────────────
            _SectionHeader(
                title: 'Paso 2 · Conexión a Broker', icon: Icons.account_circle_outlined),
            const SizedBox(height: 10),

            // Status
            _ConnectionStatus(provider: p),
            const SizedBox(height: 14),

            if (!p.isConnected) ...[
              // Platform selector
              Row(
                children: ['iqoption', 'mt5'].map((pl) {
                  final sel = _selectedPlatform == pl;
                  final label = pl == 'iqoption' ? 'IQ Option' : 'MetaTrader 5';
                  return Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _selectedPlatform = pl),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        margin: EdgeInsets.only(right: pl == 'iqoption' ? 8 : 0),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: sel
                              ? AppColors.primary.withOpacity(0.2)
                              : AppColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: sel ? AppColors.primary : AppColors.border,
                          ),
                        ),
                        child: Center(
                          child: Text(label,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: sel
                                    ? AppColors.primary
                                    : AppColors.textPrimary,
                              )),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),

              if (_selectedPlatform == 'iqoption') ...[
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                style:
                    const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                decoration: const InputDecoration(
                  labelText: 'Email de IQ Option',
                  prefixIcon: Icon(Icons.email_outlined, size: 18),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passCtrl,
                obscureText: _obscurePass,
                style:
                    const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                decoration: InputDecoration(
                  labelText: 'Contraseña',
                  prefixIcon: const Icon(Icons.lock_outline, size: 18),
                  suffixIcon: IconButton(
                    icon: Icon(
                        _obscurePass
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 18),
                    onPressed: () =>
                        setState(() => _obscurePass = !_obscurePass),
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              ] else ...[
                TextField(
                  controller: _mt5ServerCtrl,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                  decoration: const InputDecoration(
                    labelText: 'Servidor MT5 (ej: MetaQuotes-Demo)',
                    prefixIcon: Icon(Icons.dns_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _mt5LoginCtrl,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                  decoration: const InputDecoration(
                    labelText: 'Login MT5',
                    prefixIcon: Icon(Icons.badge_outlined, size: 18),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _mt5PassCtrl,
                  obscureText: _obscurePass,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    labelText: 'Contraseña MT5',
                    prefixIcon: const Icon(Icons.lock_outline, size: 18),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePass ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        size: 18,
                      ),
                      onPressed: () => setState(() => _obscurePass = !_obscurePass),
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),

              // Account type
              Row(
                children: ['PRACTICE', 'REAL'].map((t) {
                  final sel = p.accountType == t;
                  return Expanded(
                    child: GestureDetector(
                      onTap: () => p.updateConfig(accType: t),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        margin: EdgeInsets.only(
                            right: t == 'PRACTICE' ? 8 : 0),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: sel
                              ? AppColors.primary.withOpacity(0.2)
                              : AppColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color:
                                sel ? AppColors.primary : AppColors.border,
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              t,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: sel
                                    ? AppColors.primary
                                    : AppColors.textPrimary,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            Text(
                              t == 'PRACTICE' ? 'Cuenta Demo' : 'Cuenta Real',
                              style: const TextStyle(
                                  fontSize: 10,
                                  color: AppColors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _isConnecting || settings.serverUrl.isEmpty ? null : _connect,
                  icon: _isConnecting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.link, size: 18),
                  label:
                      Text(_isConnecting ? 'Conectando...' : 'Conectar a IQ Option'),
                ),
              ),
            ] else ...[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: p.disconnect,
                  icon: const Icon(Icons.link_off, size: 18),
                  label: const Text('Desconectar'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.loss,
                    side: const BorderSide(color: AppColors.loss),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],

            const SizedBox(height: 28),

            // ─── Trading Config ──────────────────────────────────────────
            _SectionHeader(title: 'Paso 3 · Configuración de Trading', icon: Icons.tune),
            const SizedBox(height: 14),

            _ConfigRow(
              label: 'Monto por operación',
              value: '\$${p.betAmount.toStringAsFixed(0)}',
              child: Slider(
                value: p.betAmount.clamp(1, 500),
                min: 1,
                max: 500,
                divisions: 499,
                activeColor: AppColors.primary,
                inactiveColor: AppColors.border,
                onChanged: (v) => p.updateConfig(amount: v),
              ),
            ),
            _ConfigRow(
              label: 'Expiración (min)',
              value: '${p.expiration} min',
              child: Slider(
                value: p.expiration.toDouble(),
                min: 1,
                max: 60,
                divisions: 59,
                activeColor: AppColors.primary,
                inactiveColor: AppColors.border,
                onChanged: (v) => p.updateConfig(exp: v.toInt()),
              ),
            ),
            _ConfigRow(
              label: 'Confianza mínima',
              value: '${p.minConfidence.toStringAsFixed(0)}%',
              child: Slider(
                value: p.minConfidence.clamp(50, 95),
                min: 50,
                max: 95,
                divisions: 45,
                activeColor: AppColors.primary,
                inactiveColor: AppColors.border,
                onChanged: (v) => p.updateConfig(confidence: v),
              ),
            ),
            _ConfigRow(
              label: 'Máx. operaciones concurrentes',
              value: '${p.maxConcurrent}',
              child: Slider(
                value: p.maxConcurrent.toDouble(),
                min: 1,
                max: 10,
                divisions: 9,
                activeColor: AppColors.primary,
                inactiveColor: AppColors.border,
                onChanged: (v) => p.updateConfig(maxConc: v.toInt()),
              ),
            ),
            _ConfigRow(
              label: 'Máx. operaciones diarias',
              value: '${p.maxDailyTrades}',
              child: Slider(
                value: p.maxDailyTrades.toDouble(),
                min: 5,
                max: 200,
                divisions: 195,
                activeColor: AppColors.primary,
                inactiveColor: AppColors.border,
                onChanged: (v) => p.updateConfig(maxDaily: v.toInt()),
              ),
            ),

            const SizedBox(height: 24),

            // ─── Mode ─────────────────────────────────────────────────────
            _SectionHeader(title: 'Modo de Trading', icon: Icons.mode_standby),
            const SizedBox(height: 12),
            Row(
              children: ['manual', 'auto'].map((m) {
                final sel = p.tradingMode == m;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => p.updateConfig(mode: m),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      margin: EdgeInsets.only(right: m == 'manual' ? 8 : 0),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: sel
                            ? AppColors.primary.withOpacity(0.2)
                            : AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: sel ? AppColors.primary : AppColors.border,
                        ),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            m == 'manual'
                                ? Icons.touch_app_outlined
                                : Icons.smart_toy_outlined,
                            color:
                                sel ? AppColors.primary : AppColors.textMuted,
                            size: 24,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            m == 'manual' ? 'Manual' : 'Automático',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: sel
                                  ? AppColors.primary
                                  : AppColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 32),

            // ─── App info ─────────────────────────────────────────────────
            Center(
              child: Column(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      gradient: AppColors.primaryGradient,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.show_chart,
                        color: Colors.white, size: 24),
                  ),
                  const SizedBox(height: 8),
                  const Text('Trading Bot v1.0.0',
                      style: TextStyle(
                          color: AppColors.textSecondary, fontSize: 12)),
                  Text(
                    settings.serverUrl,
                    style: const TextStyle(
                        color: AppColors.textMuted, fontSize: 10),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.primary),
        const SizedBox(width: 8),
        Text(title,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary)),
      ],
    );
  }
}

class _ConnectionStatus extends StatelessWidget {
  final TradingProvider provider;
  const _ConnectionStatus({required this.provider});

  @override
  Widget build(BuildContext context) {
    final connected = provider.isConnected;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (connected ? AppColors.win : AppColors.textMuted).withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: (connected ? AppColors.win : AppColors.border).withOpacity(0.5),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: connected ? AppColors.win : AppColors.textMuted,
              shape: BoxShape.circle,
              boxShadow: connected
                  ? [
                      BoxShadow(
                          color: AppColors.win.withOpacity(0.4),
                          blurRadius: 6,
                          spreadRadius: 1)
                    ]
                  : null,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  connected ? 'Conectado a IQ Option' : 'Desconectado',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: connected ? AppColors.win : AppColors.textPrimary,
                  ),
                ),
                if (connected)
                  Text(
                    '${provider.account.accountType} · Balance: \$${provider.account.balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.textSecondary),
                  )
                else
                  const Text(
                    'Modo simulación activo',
                    style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfigRow extends StatelessWidget {
  final String label;
  final String value;
  final Widget child;
  const _ConfigRow(
      {required this.label, required this.value, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w500)),
              Text(value,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary)),
            ],
          ),
          child,
        ],
      ),
    );
  }
}

