import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/trade_model.dart';
import '../providers/trading_provider.dart';
import 'history_screen.dart';
import 'main_shell.dart';

/// Pantalla de Operaciones en vivo.
///
/// • Muestra solo los activos seleccionados en la configuración.
/// • Lleva una cuenta de **iteraciones** (operaciones cerradas).
/// • Tras 10 iteraciones, redirige automáticamente al Historial completo
///   y reinicia el contador (replicando el flujo "envía a la hoja dos").
class LiveOperationsScreen extends StatefulWidget {
  const LiveOperationsScreen({super.key});

  @override
  State<LiveOperationsScreen> createState() => _LiveOperationsScreenState();
}

class _LiveOperationsScreenState extends State<LiveOperationsScreen> {
  static const int kMaxIterations = 10;

  Timer? _refreshTimer;
  int _completedSinceStart = 0;
  int _seenCompletedIds = 0;
  final Set<String> _seenIds = {};
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final p = context.read<TradingProvider>();
      await p.refreshTrades();
      _seenCompletedIds = p.completedTrades.length;
      _refreshTimer = Timer.periodic(
        const Duration(seconds: 5),
        (_) => _tick(),
      );
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    if (!mounted) return;
    final p = context.read<TradingProvider>();
    await p.refreshTrades();

    // Detecta nuevas operaciones completadas para incrementar el contador.
    final completed = p.completedTrades;
    var newClosed = 0;
    for (final t in completed) {
      if (!_seenIds.contains(t.id)) {
        _seenIds.add(t.id);
        if (_seenCompletedIds > 0) {
          // Solo cuenta nuevas (no las que ya estaban al iniciar).
          newClosed += 1;
        }
      }
    }
    _seenCompletedIds = completed.length;

    if (newClosed > 0) {
      setState(() => _completedSinceStart += newClosed);
    }

    if (_completedSinceStart >= kMaxIterations) {
      _refreshTimer?.cancel();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              '10 iteraciones alcanzadas. Enviando al historial...'),
          backgroundColor: AppColors.tertiary,
        ),
      );
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;
      _goToHistory();
      // Reinicia el contador para una nueva tanda de 10.
      setState(() => _completedSinceStart = 0);
    }
  }

  void _goToHistory() {
    final scope =
        context.dependOnInheritedWidgetOfExactType<MainShellScope>();
    if (scope != null) {
      MainShell.goToTab(context, 1);
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const HistoryScreen()),
      );
    }
  }

  Future<void> _toggleBot() async {
    setState(() => _starting = true);
    await context.read<TradingProvider>().toggleBot();
    if (mounted) setState(() => _starting = false);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final selectedSymbols =
        p.selectedSymbols.map((s) => s.toUpperCase()).toSet();
    final activeTrades = p.pendingTrades
        .where((t) =>
            selectedSymbols.isEmpty ||
            selectedSymbols.contains(t.symbol.toUpperCase()))
        .toList();
    final recentClosed = p.completedTrades
        .where((t) =>
            selectedSymbols.isEmpty ||
            selectedSymbols.contains(t.symbol.toUpperCase()))
        .take(kMaxIterations)
        .toList();

    final wins = recentClosed.where((t) => t.isWin).length;
    final losses = recentClosed.where((t) => t.isLoss).length;
    final pnl = recentClosed.fold<double>(0, (s, t) => s + (t.pnl ?? 0));
    final progress = (_completedSinceStart / kMaxIterations).clamp(0.0, 1.0);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Operaciones en Vivo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'Ir al historial',
            onPressed: _goToHistory,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Bot status + start/stop
          _BotControlCard(
            isRunning: p.botStatus.isRunning,
            mode: p.botStatus.isRunning ? p.botStatus.mode : p.tradingMode,
            platform: p.connectedPlatform.isEmpty
                ? p.platform
                : p.connectedPlatform,
            accountType: p.accountType,
            loading: _starting || p.isTogglingBot,
            onToggle: _toggleBot,
          ),
          if (p.botStatus.isRunning && p.botStatus.mode == 'manual') ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withOpacity(0.35),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.outlineVariant),
              ),
              child: const Text(
                'Estás en modo manual: el servidor analiza el mercado pero no envía órdenes '
                'automáticas a IQ Option. Para operar solo, activa modo Automático en la pestaña Config.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),

          // Iteration progress
          _IterationCard(
            current: _completedSinceStart,
            max: kMaxIterations,
            progress: progress,
            wins: wins,
            losses: losses,
            pnl: pnl,
            balance: p.botStatus.balance,
            currency: p.account.currency,
          ),
          const SizedBox(height: 16),

          // Active operations
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Operaciones Activas',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${activeTrades.length}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (activeTrades.isEmpty)
            _EmptyState(
              icon: Icons.bolt_outlined,
              title: 'Sin operaciones activas',
              subtitle: p.botStatus.isRunning
                  ? 'Esperando señales del bot…'
                  : 'Inicia el bot para comenzar a operar',
            )
          else
            for (final t in activeTrades) _ActiveTradeCard(trade: t),
          const SizedBox(height: 24),

          // Recent results (últimas 10)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Últimas Iteraciones',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              Text(
                '${recentClosed.length}/$kMaxIterations',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.outline,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (recentClosed.isEmpty)
            _EmptyState(
              icon: Icons.history_toggle_off,
              title: 'Sin resultados aún',
              subtitle: 'Las operaciones cerradas aparecerán aquí',
            )
          else
            for (final t in recentClosed) _ClosedTradeCard(trade: t),
        ],
      ),
    );
  }
}

class _BotControlCard extends StatelessWidget {
  final bool isRunning;
  final String mode;
  final String platform;
  final String accountType;
  final bool loading;
  final VoidCallback onToggle;
  const _BotControlCard({
    required this.isRunning,
    required this.mode,
    required this.platform,
    required this.accountType,
    required this.loading,
    required this.onToggle,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: isRunning
            ? LinearGradient(
                colors: [
                  AppColors.tertiary.withOpacity(0.95),
                  AppColors.tertiary.withOpacity(0.75),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: isRunning ? null : AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isRunning
              ? AppColors.tertiary
              : AppColors.outlineVariant,
        ),
        boxShadow: AppColors.cardShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: (isRunning ? Colors.white : AppColors.tertiaryFixed)
                  .withOpacity(0.4),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isRunning ? Icons.smart_toy : Icons.smart_toy_outlined,
              color: isRunning ? Colors.white : AppColors.tertiary,
              size: 26,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isRunning ? 'Bot operando' : 'Bot detenido',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: isRunning ? Colors.white : AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${platform.toUpperCase()} · $accountType · ${mode.toUpperCase()}',
                  style: TextStyle(
                    fontSize: 11,
                    color: isRunning
                        ? Colors.white.withOpacity(0.85)
                        : AppColors.outline,
                    letterSpacing: 0.6,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: loading ? null : onToggle,
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  isRunning ? Colors.white : AppColors.onSurface,
              foregroundColor:
                  isRunning ? AppColors.tertiary : Colors.white,
              elevation: 2,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child: loading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : Text(isRunning ? 'PARAR' : 'INICIAR',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    )),
          ),
        ],
      ),
    );
  }
}

class _IterationCard extends StatelessWidget {
  final int current;
  final int max;
  final double progress;
  final int wins;
  final int losses;
  final double pnl;
  final double balance;
  final String currency;
  const _IterationCard({
    required this.current,
    required this.max,
    required this.progress,
    required this.wins,
    required this.losses,
    required this.pnl,
    required this.balance,
    required this.currency,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.repeat, color: AppColors.secondary, size: 18),
              const SizedBox(width: 6),
              const Text(
                'Iteraciones de la sesión',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              const Spacer(),
              Text(
                '$current / $max',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: AppColors.surfaceContainerHigh,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.secondary),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.secondary.withOpacity(0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.secondary.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined,
                    size: 18, color: AppColors.secondary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Saldo en cuenta (${currency.toUpperCase()})',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                          color: AppColors.onSurfaceVariant.withOpacity(0.9),
                        ),
                      ),
                      Text(
                        balance.toStringAsFixed(2),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  currency.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.secondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StatPill(
                  label: 'GANADAS',
                  value: '$wins',
                  color: AppColors.tertiary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatPill(
                  label: 'PERDIDAS',
                  value: '$losses',
                  color: AppColors.error,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatPill(
                  label: 'P&L',
                  value: '${pnl >= 0 ? '+' : ''}\$${pnl.toStringAsFixed(2)}',
                  color: pnl >= 0 ? AppColors.tertiary : AppColors.error,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatPill({
    required this.label,
    required this.value,
    required this.color,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: color.withOpacity(0.85),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActiveTradeCard extends StatelessWidget {
  final TradeModel trade;
  const _ActiveTradeCard({required this.trade});
  @override
  Widget build(BuildContext context) {
    final isCall = trade.direction.toLowerCase() == 'call';
    final time = trade.timeRemaining;
    final mins = time.inMinutes;
    final secs = time.inSeconds % 60;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: (isCall ? AppColors.tertiary : AppColors.error)
                  .withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isCall ? Icons.trending_up : Icons.trending_down,
              color: isCall ? AppColors.tertiary : AppColors.error,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      trade.symbol.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: (isCall
                                ? AppColors.tertiaryFixed
                                : AppColors.errorContainer)
                            .withOpacity(0.6),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        isCall ? 'CALL' : 'PUT',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: isCall
                              ? AppColors.onTertiaryFixedVariant
                              : AppColors.onErrorContainer,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '\$${trade.amount.toStringAsFixed(2)} · ${trade.strategyUsed.isEmpty ? "manual" : trade.strategyUsed}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.outline,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                'EXPIRA EN',
                style: TextStyle(
                  fontSize: 9,
                  color: AppColors.outline,
                  letterSpacing: 0.6,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.secondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ClosedTradeCard extends StatelessWidget {
  final TradeModel trade;
  const _ClosedTradeCard({required this.trade});
  @override
  Widget build(BuildContext context) {
    final isWin = trade.isWin;
    final color = isWin ? AppColors.tertiary : AppColors.error;
    final pnl = trade.pnl ?? 0;
    final time = DateFormat('HH:mm:ss').format(trade.timestamp.toLocal());
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.outlineVariant.withOpacity(0.6)),
      ),
      child: Row(
        children: [
          Icon(
            isWin ? Icons.check_circle : Icons.cancel,
            color: color,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  trade.symbol.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  '${trade.directionLabel} · \$${trade.amount.toStringAsFixed(2)} · $time',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.outline,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${pnl >= 0 ? '+' : ''}\$${pnl.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.outlineVariant.withOpacity(0.6),
          style: BorderStyle.solid,
        ),
      ),
      child: Column(
        children: [
          Icon(icon, size: 32, color: AppColors.outline),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.outline,
            ),
          ),
        ],
      ),
    );
  }
}
