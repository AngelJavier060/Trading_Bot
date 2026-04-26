import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/trading_provider.dart';
import '../widgets/signal_card.dart';
import '../widgets/connection_banner.dart';
import 'settings_screen.dart';
import '../providers/auth_provider.dart';

const _symbols = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURJPY', 'GBPJPY',
];

class TradingScreen extends StatefulWidget {
  const TradingScreen({super.key});

  @override
  State<TradingScreen> createState() => _TradingScreenState();
}

class _TradingScreenState extends State<TradingScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  String _selectedSymbol = 'EURUSD';
  double _amount = 10;
  int _expiration = 5;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<TradingProvider>();
      _amount = p.betAmount;
      _expiration = p.expiration;
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Trading'),
        backgroundColor: AppColors.bg,
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: AppColors.primary,
          indicatorSize: TabBarIndicatorSize.label,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          labelStyle:
              const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          tabs: const [
            Tab(text: 'Manual'),
            Tab(text: 'Auto / Señales'),
          ],
        ),
        actions: [
          // Bot toggle
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: _BotToggleChip(provider: p),
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _ManualTab(
            provider: p,
            loggedIn: auth.loggedIn,
            selectedSymbol: _selectedSymbol,
            amount: _amount,
            expiration: _expiration,
            onSymbolChanged: (s) => setState(() => _selectedSymbol = s),
            onAmountChanged: (v) => setState(() => _amount = v),
            onExpirationChanged: (v) => setState(() => _expiration = v),
          ),
          _AutoTab(provider: p),
        ],
      ),
    );
  }
}

// ─── Manual Tab ──────────────────────────────────────────────────────────────

class _ManualTab extends StatelessWidget {
  final TradingProvider provider;
  final bool loggedIn;
  final String selectedSymbol;
  final double amount;
  final int expiration;
  final ValueChanged<String> onSymbolChanged;
  final ValueChanged<double> onAmountChanged;
  final ValueChanged<int> onExpirationChanged;

  const _ManualTab({
    required this.provider,
    required this.loggedIn,
    required this.selectedSymbol,
    required this.amount,
    required this.expiration,
    required this.onSymbolChanged,
    required this.onAmountChanged,
    required this.onExpirationChanged,
  });

  void _execute(BuildContext context, String direction) {
    provider.executeTrade(
      symbol: selectedSymbol,
      direction: direction,
      amount: amount,
      confidence: 70,
    );
    ScaffoldMessenger.of(context).clearSnackBars();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!loggedIn)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.loss.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.loss.withOpacity(0.4)),
              ),
              child: const Text(
                'Debes iniciar sesión (Paso 0) para operar. Ve a la pestaña Configuración para ingresar.',
                style: TextStyle(color: AppColors.loss, fontSize: 12),
              ),
            ),
          ConnectionBanner(
            isConnected: provider.isConnected,
            onConnect: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),

          // Symbol picker
          _SectionLabel(label: 'Par / Activo'),
          _SymbolPicker(
            selected: selectedSymbol,
            onChanged: onSymbolChanged,
          ),
          const SizedBox(height: 20),

          // Amount
          _SectionLabel(label: 'Monto de inversión'),
          _AmountSlider(amount: amount, onChanged: onAmountChanged),
          const SizedBox(height: 20),

          // Expiration
          _SectionLabel(label: 'Expiración (minutos)'),
          _ExpirationPicker(selected: expiration, onChanged: onExpirationChanged),
          const SizedBox(height: 28),

          // Execute buttons
          Row(
            children: [
              Expanded(
                child: _ExecuteButton(
                  direction: 'call',
                  symbol: selectedSymbol,
                  amount: amount,
                  isLoading: provider.isExecutingTrade || !loggedIn,
                  onTap: () {
                    if (!loggedIn) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Inicia sesión en la app para operar'),
                        backgroundColor: AppColors.loss,
                      ));
                      return;
                    }
                    _execute(context, 'call');
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _ExecuteButton(
                  direction: 'put',
                  symbol: selectedSymbol,
                  amount: amount,
                  isLoading: provider.isExecutingTrade || !loggedIn,
                  onTap: () {
                    if (!loggedIn) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Inicia sesión en la app para operar'),
                        backgroundColor: AppColors.loss,
                      ));
                      return;
                    }
                    _execute(context, 'put');
                  },
                ),
              ),
            ],
          ),

          // Feedback
          if (provider.lastError != null)
            _FeedbackBanner(message: provider.lastError!, isError: true),
          if (provider.lastSuccess != null)
            _FeedbackBanner(message: provider.lastSuccess!, isError: false),
        ],
      ),
    );
  }
}

// ─── Auto Tab ────────────────────────────────────────────────────────────────

class _AutoTab extends StatelessWidget {
  final TradingProvider provider;
  const _AutoTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.primary,
      backgroundColor: AppColors.card,
      onRefresh: () => provider.scanMarket(),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Scan button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: provider.isScanning ? null : provider.scanMarket,
                icon: provider.isScanning
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.radar, size: 18),
                label: Text(provider.isScanning ? 'Escaneando...' : 'Escanear Mercado'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 20),

            if (provider.signals.isEmpty && !provider.isScanning)
              _EmptySignals(onScan: provider.scanMarket)
            else ...[
              Row(
                children: [
                  Text(
                    'Señales (${provider.signals.length})',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Min. confianza: ${provider.minConfidence.toStringAsFixed(0)}%',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ...provider.signals.map((signal) => SignalCard(
                    signal: signal,
                    onExecute: () {
                      provider.executeTrade(
                        symbol: signal.symbol,
                        direction: signal.direction,
                        confidence: signal.confidence,
                        strategy: signal.strategy,
                      );
                    },
                    onIgnore: () {
                      provider.signals.remove(signal);
                    },
                  )),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

class _BotToggleChip extends StatelessWidget {
  final TradingProvider provider;
  const _BotToggleChip({required this.provider});

  @override
  Widget build(BuildContext context) {
    final running = provider.botStatus.isRunning;
    return GestureDetector(
      onTap: provider.isTogglingBot ? null : provider.toggleBot,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: running
              ? AppColors.win.withOpacity(0.15)
              : AppColors.loss.withOpacity(0.15),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: running
                ? AppColors.win.withOpacity(0.5)
                : AppColors.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (provider.isTogglingBot)
              const SizedBox(
                width: 10,
                height: 10,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
              )
            else
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: running ? AppColors.win : AppColors.textMuted,
                  shape: BoxShape.circle,
                ),
              ),
            const SizedBox(width: 6),
            Text(
              running ? 'Detener' : 'Iniciar Bot',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: running ? AppColors.win : AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.textSecondary,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _SymbolPicker extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;
  const _SymbolPicker({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _symbols
          .map((s) => GestureDetector(
                onTap: () => onChanged(s),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected == s
                        ? AppColors.primary.withOpacity(0.2)
                        : AppColors.card,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: selected == s ? AppColors.primary : AppColors.border,
                      width: selected == s ? 1.5 : 1,
                    ),
                  ),
                  child: Text(
                    s,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color:
                          selected == s ? AppColors.primary : AppColors.textPrimary,
                    ),
                  ),
                ),
              ))
          .toList(),
    );
  }
}

class _AmountSlider extends StatelessWidget {
  final double amount;
  final ValueChanged<double> onChanged;
  const _AmountSlider({required this.amount, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('\$1', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
              Text(
                '\$${amount.toStringAsFixed(0)}',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                ),
              ),
              const Text('\$500', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
            ],
          ),
          SliderTheme(
            data: SliderThemeData(
              trackHeight: 3,
              activeTrackColor: AppColors.primary,
              inactiveTrackColor: AppColors.border,
              thumbColor: AppColors.primary,
              overlayColor: AppColors.primary.withOpacity(0.1),
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
            ),
            child: Slider(
              value: amount.clamp(1, 500),
              min: 1,
              max: 500,
              divisions: 499,
              onChanged: onChanged,
            ),
          ),
          // Quick amounts
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [5, 10, 25, 50, 100]
                .map((v) => GestureDetector(
                      onTap: () => onChanged(v.toDouble()),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: amount == v
                              ? AppColors.primary.withOpacity(0.2)
                              : AppColors.cardAlt,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: amount == v
                                ? AppColors.primary
                                : AppColors.borderLight,
                          ),
                        ),
                        child: Text(
                          '\$$v',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: amount == v
                                ? AppColors.primary
                                : AppColors.textSecondary,
                          ),
                        ),
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _ExpirationPicker extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;
  const _ExpirationPicker({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [1, 2, 3, 5, 10, 15]
          .map((v) => Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(v),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: selected == v
                          ? AppColors.primary.withOpacity(0.2)
                          : AppColors.card,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: selected == v ? AppColors.primary : AppColors.border,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '$v',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: selected == v
                                ? AppColors.primary
                                : AppColors.textPrimary,
                          ),
                        ),
                        Text(
                          'min',
                          style: TextStyle(
                            fontSize: 9,
                            color: selected == v
                                ? AppColors.primary
                                : AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ))
          .toList(),
    );
  }
}

class _ExecuteButton extends StatelessWidget {
  final String direction;
  final String symbol;
  final double amount;
  final bool isLoading;
  final VoidCallback onTap;

  const _ExecuteButton({
    required this.direction,
    required this.symbol,
    required this.amount,
    required this.isLoading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isBuy = direction == 'call';
    final color = isBuy ? AppColors.win : AppColors.loss;
    final label = isBuy ? 'CALL ▲' : 'PUT ▼';

    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color, color.withOpacity(0.8)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
                color: color.withOpacity(0.3),
                blurRadius: 12,
                offset: const Offset(0, 4))
          ],
        ),
        child: isLoading
            ? const Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                ),
              )
            : Column(
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(
                    '\$${amount.toStringAsFixed(0)} · $symbol',
                    style: const TextStyle(
                        fontSize: 11, color: Colors.white70),
                  ),
                ],
              ),
      ),
    );
  }
}

class _FeedbackBanner extends StatelessWidget {
  final String message;
  final bool isError;
  const _FeedbackBanner({required this.message, required this.isError});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: (isError ? AppColors.loss : AppColors.win).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: (isError ? AppColors.loss : AppColors.win).withOpacity(0.4),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isError ? Icons.error_outline : Icons.check_circle_outline,
            color: isError ? AppColors.loss : AppColors.win,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                color: isError ? AppColors.loss : AppColors.win,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptySignals extends StatelessWidget {
  final VoidCallback onScan;
  const _EmptySignals({required this.onScan});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          children: [
            const Icon(Icons.radar, size: 56, color: AppColors.textMuted),
            const SizedBox(height: 12),
            const Text(
              'Sin señales activas',
              style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            const Text(
              'Toca escanear para analizar el mercado',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onScan,
              icon: const Icon(Icons.search, size: 16),
              label: const Text('Escanear ahora'),
            ),
          ],
        ),
      ),
    );
  }
}
