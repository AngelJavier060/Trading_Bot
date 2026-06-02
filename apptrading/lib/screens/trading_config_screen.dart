import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/strategy_catalog.dart';
import '../providers/trading_provider.dart';
import '../services/api_service.dart';
import 'main_shell.dart';

/// Pantalla de Configuración de Trading (Riesgo, Activos, Estrategias).
/// Persiste la configuración en el backend (`/api/trading/save-config`)
/// y replica la lógica del frontend web (saveConfig + redirección).
class TradingConfigScreen extends StatefulWidget {
  const TradingConfigScreen({super.key});

  @override
  State<TradingConfigScreen> createState() => _TradingConfigScreenState();
}

class _TradingConfigScreenState extends State<TradingConfigScreen> {
  final _api = ApiService();

  // Risk
  final _amountCtrl = TextEditingController(text: '100');
  final _expirationCtrl = TextEditingController(text: '5');
  double _takeProfit = 85;
  double _stopLoss = 15;

  // Assets
  final List<_Asset> _assets = const [
    _Asset(symbol: 'EURUSD', label: 'EUR/USD', tag: 'EU', category: 'Forex'),
    _Asset(symbol: 'GBPUSD', label: 'GBP/USD', tag: 'GU', category: 'Forex'),
    _Asset(symbol: 'USDJPY', label: 'USD/JPY', tag: 'UJ', category: 'Forex'),
    _Asset(symbol: 'AUDUSD', label: 'AUD/USD', tag: 'AU', category: 'Forex'),
    _Asset(symbol: 'USDCAD', label: 'USD/CAD', tag: 'UC', category: 'Forex'),
    _Asset(symbol: 'EURJPY', label: 'EUR/JPY', tag: 'EJ', category: 'Forex'),
    _Asset(symbol: 'GBPJPY', label: 'GBP/JPY', tag: 'GJ', category: 'Forex'),
    _Asset(symbol: 'BTCUSD', label: 'BTC/USD', tag: 'BT', category: 'Crypto'),
    _Asset(symbol: 'ETHUSD', label: 'ETH/USD', tag: 'ET', category: 'Crypto'),
  ];
  Set<String> _selectedAssets = {'EURUSD', 'GBPUSD', 'USDJPY'};
  List<_Asset> _dynamicAssets = [];
  bool _loadingAssets = true;

  // Estrategias IQ (IDs = motor backend). MT5 usa nombres exactos de la web en `_selectedMt5StrategyNames`.
  Set<String> _selectedStrategies = {'ema_rsi', 'macd', 'bollinger'};
  Set<String> _selectedMt5StrategyNames = StrategyCatalog.defaultMt5Selection();

  bool _saving = false;

  bool _isMt5Platform(TradingProvider p) {
    final id = p.connectedPlatform.isEmpty ? p.platform : p.connectedPlatform;
    return id.toLowerCase() == 'mt5';
  }

  bool _noStrategiesSelected(bool isMt5) {
    if (isMt5) return _selectedMt5StrategyNames.isEmpty;
    return _selectedStrategies.isEmpty;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _hydrateFromProvider();
      await _loadAssets();
      if (mounted) {
        await context.read<TradingProvider>().refreshBrokerAccount();
      }
      await _loadServerConfig();
    });
  }

  Future<void> _hydrateFromProvider() async {
    final p = context.read<TradingProvider>();
    setState(() {
      _amountCtrl.text = p.betAmount.toStringAsFixed(0);
      _expirationCtrl.text = p.expiration.toString();
      _selectedAssets = p.selectedSymbols.toSet();
      if (!_isMt5Platform(p)) {
        _selectedStrategies =
            p.selectedStrategies.map(StrategyCatalog.normalizeEngineId).toSet();
      }
    });
  }

  Future<void> _loadAssets() async {
    try {
      final data = await _api.getAssets();
      final raw = (data['activos'] as Map?)?.cast<String, dynamic>() ?? {};
      final dyn = <_Asset>[];
      raw.forEach((symbol, info) {
        final isOpen = (info as Map?)?['open'] == true;
        if (isOpen) {
          final s = symbol.toString().toUpperCase();
          final tag = s.length >= 2 ? s.substring(0, 2) : s;
          dyn.add(_Asset(
            symbol: s,
            label: _prettySymbol(s),
            tag: tag,
            category: _categoryOf(s),
          ));
        }
      });
      if (mounted) {
        setState(() {
          _dynamicAssets = dyn.isEmpty ? _assets : dyn;
          _loadingAssets = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _dynamicAssets = _assets;
          _loadingAssets = false;
        });
      }
    }
  }

  Future<void> _loadServerConfig() async {
    try {
      final data = await _api.getTradingConfig();
      if (!mounted) return;
      final cfg = (data['config'] as Map?)?.cast<String, dynamic>() ?? data;
      if (cfg.isEmpty) return;
      final p = context.read<TradingProvider>();
      final isMt5 = _isMt5Platform(p);
      final modeRaw = cfg['mode']?.toString().toLowerCase();
      if (modeRaw == 'auto' || modeRaw == 'automatic') {
        p.updateConfig(mode: 'auto');
      } else if (modeRaw != null) {
        p.updateConfig(mode: 'manual');
      }
      setState(() {
        if (cfg['trade_amount'] != null) {
          _amountCtrl.text = (cfg['trade_amount'] as num).toString();
        }
        if (cfg['expiration_time'] != null) {
          _expirationCtrl.text = (cfg['expiration_time'] as num).toString();
        }
        if (cfg['profit_target'] != null) {
          _takeProfit = (cfg['profit_target'] as num).toDouble();
        }
        if (cfg['loss_limit'] != null) {
          _stopLoss = (cfg['loss_limit'] as num).toDouble();
        }
        if (cfg['symbols'] is List) {
          _selectedAssets = (cfg['symbols'] as List)
              .map((e) => e.toString().toUpperCase())
              .toSet();
        }
        if (isMt5) {
          if (cfg['mt5Strategies'] is List) {
            _selectedMt5StrategyNames = (cfg['mt5Strategies'] as List)
                .map((e) => e.toString())
                .toSet();
          } else if (cfg['strategies'] is List) {
            final inferred = StrategyCatalog.engineIdsToMt5Labels(
              (cfg['strategies'] as List).map((e) => e.toString()),
            );
            if (inferred.isNotEmpty) {
              _selectedMt5StrategyNames = inferred;
            }
          }
        } else {
          if (cfg['iqStrategies'] is List) {
            final labels = (cfg['iqStrategies'] as List)
                .map((e) => e.toString())
                .toSet();
            final ids = <String>{};
            for (final opt in StrategyCatalog.iqOption) {
              if (labels.contains(opt.title)) ids.add(opt.engineId);
            }
            if (ids.isNotEmpty) _selectedStrategies = ids;
          } else if (cfg['strategies'] is List) {
            _selectedStrategies = (cfg['strategies'] as List)
                .map((e) => StrategyCatalog.normalizeEngineId(e.toString()))
                .toSet();
          }
        }
      });
    } catch (_) {
      // Si el endpoint /config/get-config no responde, mantenemos los defaults.
    }
  }

  String _prettySymbol(String s) {
    if (s.length == 6) return '${s.substring(0, 3)}/${s.substring(3)}';
    if (s.contains('USDT')) return s.replaceAll('USDT', '/USDT');
    return s;
  }

  String _categoryOf(String s) {
    if (s.contains('BTC') || s.contains('ETH') || s.contains('USDT')) {
      return 'Crypto';
    }
    return 'Forex';
  }

  void _toggleAsset(String s) {
    setState(() {
      if (_selectedAssets.contains(s)) {
        _selectedAssets.remove(s);
      } else {
        _selectedAssets.add(s);
      }
    });
  }

  void _toggleStrategy(String id) {
    setState(() {
      if (_selectedStrategies.contains(id)) {
        _selectedStrategies.remove(id);
      } else {
        _selectedStrategies.add(id);
      }
    });
  }

  void _toggleMt5Strategy(String displayTitle) {
    setState(() {
      if (_selectedMt5StrategyNames.contains(displayTitle)) {
        _selectedMt5StrategyNames.remove(displayTitle);
      } else {
        _selectedMt5StrategyNames.add(displayTitle);
      }
    });
  }

  List<String> _normalizedStrategiesList() {
    return _selectedStrategies.map(StrategyCatalog.normalizeEngineId).toList();
  }

  Future<void> _save() async {
    final p = context.read<TradingProvider>();
    final amount = double.tryParse(_amountCtrl.text) ?? p.betAmount;
    final expiration = int.tryParse(_expirationCtrl.text) ?? p.expiration;

    final platform = p.connectedPlatform.isEmpty
        ? p.platform
        : p.connectedPlatform.toLowerCase();
    final isMt5 = platform == 'mt5';

    final strategiesForServer = isMt5
        ? StrategyCatalog.mt5LabelsToEngineIds(_selectedMt5StrategyNames)
        : _normalizedStrategiesList();

    if (_selectedAssets.isEmpty) {
      _toast('Selecciona al menos un activo', error: true);
      return;
    }
    if (_noStrategiesSelected(isMt5)) {
      _toast('Selecciona al menos una estrategia', error: true);
      return;
    }

    setState(() => _saving = true);

    final payload = {
      // Esquema canónico aceptado por save_config()
      'mode': p.tradingMode,
      'platform': platform,
      'account_type': p.accountType,
      'symbols': _selectedAssets.toList(),
      'strategies': strategiesForServer,
      'trade_amount': amount,
      'expiration_time': expiration,
      'profit_target': _takeProfit,
      'loss_limit': _stopLoss,
      'max_concurrent_trades': p.maxConcurrent,
      'analysis_interval': 30,
      'timeframe': '${expiration}m',
      // Compatibilidad con esquema legacy del frontend web
      'marketType': platform == 'iqoption' ? 'Binarias' : 'Forex',
      'risk': _stopLoss.toInt(),
      'timeframes': ['${expiration}m'],
      'profitTarget': _takeProfit,
      'lossLimit': _stopLoss,
      'tradingMode': p.accountType == 'REAL' ? 'Real' : 'Demo',
      'accountType': p.accountType,
      if (isMt5) 'mt5Strategies': _selectedMt5StrategyNames.toList(),
      if (!isMt5)
        'iqStrategies':
            StrategyCatalog.iqEngineIdsToWebLabels(strategiesForServer),
    };

    try {
      await _api.saveTradingConfig(payload);
      // Actualiza también el estado local
      p.updateConfig(
        amount: amount,
        exp: expiration,
        symbols: _selectedAssets.toList(),
        strategies: strategiesForServer,
      );
      if (!mounted) return;
      _toast('Configuración guardada', error: false);
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      // Si está dentro del MainShell (tras Configuración), cambia al tab de Operaciones.
      // Si está standalone (primer guardado tras conectar broker), entra al shell.
      final scope =
          context.dependOnInheritedWidgetOfExactType<MainShellScope>();
      if (scope != null) {
        MainShell.goToTab(context, 0);
      } else {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const MainShell(initialIndex: 0)),
        );
      }
    } catch (e) {
      _toast('Error al guardar: $e', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _reset() {
    final p = context.read<TradingProvider>();
    final isMt5 = _isMt5Platform(p);
    setState(() {
      _amountCtrl.text = '100';
      _expirationCtrl.text = '5';
      _takeProfit = 85;
      _stopLoss = 15;
      _selectedAssets = {'EURUSD', 'GBPUSD', 'USDJPY'};
      if (isMt5) {
        _selectedMt5StrategyNames = StrategyCatalog.defaultMt5Selection();
      } else {
        _selectedStrategies = {'ema_rsi', 'macd', 'bollinger'};
      }
    });
  }

  void _toast(String msg, {required bool error}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? AppColors.error : AppColors.tertiary,
      ),
    );
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _expirationCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final assetList = _dynamicAssets.isNotEmpty ? _dynamicAssets : _assets;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Row(
          children: const [
            Icon(Icons.terminal, size: 22),
            SizedBox(width: 8),
            Text('Javiercito Terminal',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4)),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                'Configuración',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ],
        backgroundColor: Colors.white,
        shape: const Border(
          bottom: BorderSide(color: AppColors.outlineVariant, width: 1),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Connected platform pill
          _PlatformPill(
            platform: p.connectedPlatform.isEmpty
                ? p.platform.toUpperCase()
                : p.connectedPlatform.toUpperCase(),
            accountType: p.accountType,
            brokerBalance: p.isConnected ? p.account.balance : null,
            brokerCurrency: p.isConnected ? p.account.currency : null,
          ),
          const SizedBox(height: 16),

          _SectionCard(
            icon: Icons.smart_toy_outlined,
            title: 'Modo de operación',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Debe coincidir con la web: en Manual el motor solo analiza; en Automático '
                  'el servidor envía órdenes a IQ Option cuando la señal supera la confianza mínima.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Manual'),
                        selected: p.tradingMode == 'manual',
                        onSelected: (_) {
                          context.read<TradingProvider>().updateConfig(mode: 'manual');
                          setState(() {});
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Automático'),
                        selected: p.tradingMode == 'auto',
                        onSelected: (_) {
                          context.read<TradingProvider>().updateConfig(mode: 'auto');
                          setState(() {});
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Risk Management
          _SectionCard(
            icon: Icons.security_outlined,
            title: 'Gestión de Riesgo',
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _LabeledField(
                        label: 'Monto por Operación (\$)',
                        child: TextField(
                          controller: _amountCtrl,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            prefixText: '\$ ',
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _LabeledField(
                        label: 'Expiración (min)',
                        child: TextField(
                          controller: _expirationCtrl,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            suffixText: 'min',
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _SliderRow(
                  label: 'Take Profit (%)',
                  value: _takeProfit,
                  color: AppColors.tertiary,
                  onChanged: (v) => setState(() => _takeProfit = v),
                ),
                const SizedBox(height: 12),
                _SliderRow(
                  label: 'Stop Loss (%)',
                  value: _stopLoss,
                  color: AppColors.error,
                  onChanged: (v) => setState(() => _stopLoss = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Assets
          _SectionCard(
            icon: Icons.currency_exchange,
            title: 'Activos Disponibles',
            trailing: _loadingAssets
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : Text(
                    '${_selectedAssets.length} seleccionados',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.outline,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.6,
                    ),
                  ),
            child: Column(
              children: [
                for (final a in assetList)
                  _AssetRow(
                    asset: a,
                    selected: _selectedAssets.contains(a.symbol),
                    onToggle: () => _toggleAsset(a.symbol),
                  ),
                if (assetList.isEmpty && !_loadingAssets)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No hay activos disponibles',
                      style: TextStyle(color: AppColors.outline),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Strategies (IQ Option vs MT5 — mismas opciones que el dashboard web)
          _SectionCard(
            icon: Icons.psychology_outlined,
            title: 'Estrategias activas',
            trailing: _isMt5Platform(p)
                ? const Text(
                    'Timeframes: 1H, 4H, 1D',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.outline,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : null,
            child: Column(
              children: [
                if (_isMt5Platform(p)) ...[
                  Text(
                    'MetaTrader 5: estrategias y textos alineados con la versión web.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: AppColors.onSurfaceVariant.withOpacity(0.9),
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (final opt in StrategyCatalog.mt5)
                    _StrategyCard(
                      strategy: _Strategy(
                        id: opt.engineId,
                        name: opt.title,
                        description: opt.description,
                        risk: opt.riskLabel,
                      ),
                      selected:
                          _selectedMt5StrategyNames.contains(opt.title),
                      onToggle: () => _toggleMt5Strategy(opt.title),
                    ),
                ] else ...[
                  for (final opt in StrategyCatalog.iqOption)
                    _StrategyCard(
                      strategy: _Strategy(
                        id: opt.engineId,
                        name: opt.title,
                        description: opt.description,
                        risk: opt.riskLabel,
                      ),
                      selected: _selectedStrategies.contains(opt.engineId),
                      onToggle: () => _toggleStrategy(opt.engineId),
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Actions
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving ? null : _reset,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.onSurfaceVariant,
                    side:
                        const BorderSide(color: AppColors.outlineVariant),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text(
                    'Restablecer',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        fontSize: 13),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.onSurface,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 4,
                    shadowColor: AppColors.onSurface.withOpacity(0.25),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text(
                          'GUARDAR CONFIGURACIÓN',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.7,
                              fontSize: 12),
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Models ────────────────────────────────────────────────────────────────

class _Asset {
  final String symbol;
  final String label;
  final String tag;
  final String category;
  const _Asset({
    required this.symbol,
    required this.label,
    required this.tag,
    required this.category,
  });
}

class _Strategy {
  final String id;
  final String name;
  final String description;
  final String risk;
  const _Strategy({
    required this.id,
    required this.name,
    required this.description,
    required this.risk,
  });
}

// ─── Widgets ───────────────────────────────────────────────────────────────

class _PlatformPill extends StatelessWidget {
  final String platform;
  final String accountType;
  final double? brokerBalance;
  final String? brokerCurrency;

  const _PlatformPill({
    required this.platform,
    required this.accountType,
    this.brokerBalance,
    this.brokerCurrency,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: AppColors.tertiary,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Plataforma activa: $platform',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: accountType == 'REAL'
                      ? AppColors.error.withOpacity(0.1)
                      : AppColors.secondary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  accountType,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: accountType == 'REAL'
                        ? AppColors.error
                        : AppColors.secondary,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ],
          ),
          if (brokerBalance != null) ...[
            const SizedBox(height: 10),
            Text(
              'Saldo en bróker: ${brokerBalance!.toStringAsFixed(2)} '
              '${(brokerCurrency ?? 'USD').toUpperCase()}',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.secondary,
              ),
            ),
            Text(
              'Dato en vivo desde la cuenta conectada (demo o real).',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.onSurfaceVariant.withOpacity(0.9),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final Widget? trailing;
  final Widget child;
  const _SectionCard({
    required this.icon,
    required this.title,
    this.trailing,
    required this.child,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: AppColors.onSurface),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _LabeledField extends StatelessWidget {
  final String label;
  final Widget child;
  const _LabeledField({required this.label, required this.child});
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.onSurfaceVariant,
              fontWeight: FontWeight.w500,
            )),
        const SizedBox(height: 6),
        child,
      ],
    );
  }
}

class _SliderRow extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final ValueChanged<double> onChanged;
  const _SliderRow({
    required this.label,
    required this.value,
    required this.color,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.onSurfaceVariant,
                    fontWeight: FontWeight.w500)),
            Text('${value.toInt()}%',
                style: TextStyle(
                  fontSize: 13,
                  color: color,
                  fontWeight: FontWeight.w700,
                )),
          ],
        ),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: color,
            thumbColor: color,
            overlayColor: color.withOpacity(0.1),
            trackHeight: 3,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
          ),
          child: Slider(
            value: value,
            min: 1,
            max: 100,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}

class _AssetRow extends StatelessWidget {
  final _Asset asset;
  final bool selected;
  final VoidCallback onToggle;
  const _AssetRow({
    required this.asset,
    required this.selected,
    required this.onToggle,
  });
  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onToggle,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  asset.tag,
                  style: const TextStyle(
                    color: AppColors.onPrimaryContainer,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.label,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurface,
                    ),
                  ),
                  Text(
                    asset.category.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 9,
                      color: AppColors.outline,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Checkbox(
              value: selected,
              onChanged: (_) => onToggle(),
              activeColor: AppColors.secondary,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(4)),
            ),
          ],
        ),
      ),
    );
  }
}

class _StrategyCard extends StatelessWidget {
  final _Strategy strategy;
  final bool selected;
  final VoidCallback onToggle;
  const _StrategyCard({
    required this.strategy,
    required this.selected,
    required this.onToggle,
  });

  Color get _riskColor {
    switch (strategy.risk) {
      case 'Bajo':
        return AppColors.tertiary;
      case 'Volátil':
        return AppColors.error;
      default:
        return AppColors.secondary;
    }
  }

  Color get _riskBg {
    switch (strategy.risk) {
      case 'Bajo':
        return AppColors.tertiaryFixed.withOpacity(0.5);
      case 'Volátil':
        return AppColors.errorContainer;
      default:
        return AppColors.surfaceContainerHigh;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selected
              ? AppColors.secondary.withOpacity(0.6)
              : AppColors.outlineVariant,
          width: selected ? 1.4 : 1,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  strategy.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  strategy.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _riskBg,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    strategy.risk.toUpperCase(),
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                      color: _riskColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: selected,
            onChanged: (_) => onToggle(),
            activeColor: Colors.white,
            activeTrackColor: AppColors.tertiary,
          ),
        ],
      ),
    );
  }
}
