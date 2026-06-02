import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/trading_provider.dart';
import '../widgets/metric_card.dart';
import '../widgets/trade_card.dart';
import '../widgets/connection_banner.dart';
import 'settings_screen.dart';
import '../providers/auth_provider.dart';
import 'login_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TradingProvider>().refreshTrades();
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final auth = context.watch<AuthProvider>();
    final status = p.botStatus;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: CustomScrollView(
        slivers: [
          // App Bar
          SliverAppBar(
            floating: true,
            backgroundColor: AppColors.bg,
            titleSpacing: 20,
            title: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.show_chart, color: Colors.white, size: 18),
                ),
                const SizedBox(width: 10),
                const Text('Trading Bot',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
            actions: [
              // Connection dot
              Container(
                margin: const EdgeInsets.only(right: 4),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: p.isConnected
                      ? AppColors.win.withOpacity(0.15)
                      : AppColors.loss.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: p.isConnected
                        ? AppColors.win.withOpacity(0.4)
                        : AppColors.loss.withOpacity(0.4),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: p.isConnected ? AppColors.win : AppColors.loss,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      p.isConnected ? 'IQ Online' : 'Simulación',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: p.isConnected ? AppColors.win : AppColors.loss,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh_outlined, size: 20),
                onPressed: () {
                  p.refreshTrades();
                  p.checkConnection();
                },
                color: AppColors.textSecondary,
              ),
            ],
          ),

          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Login banner
                if (!auth.loggedIn)
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    ),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.primary.withOpacity(0.4)),
                      ),
                      child: Row(
                        children: const [
                          Icon(Icons.person_outline, color: AppColors.primary, size: 16),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Inicia sesión para guardar preferencias y habilitar IQ Option',
                              style: TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w500),
                            ),
                          ),
                          Icon(Icons.chevron_right, color: AppColors.primary, size: 18),
                        ],
                      ),
                    ),
                  ),

                // Connection banner
                ConnectionBanner(
                  isConnected: p.isConnected,
                  onConnect: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SettingsScreen()),
                  ),
                ),

                // Bot status card
                _BotStatusCard(provider: p),
                const SizedBox(height: 16),

                // Balance card
                _BalanceCard(provider: p),
                const SizedBox(height: 16),

                // Metrics grid
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.4,
                  children: [
                    MetricCard(
                      label: 'Total Operaciones',
                      value: status.totalTrades.toString(),
                      icon: Icons.receipt_long_outlined,
                      iconColor: AppColors.primary,
                    ),
                    MetricCard(
                      label: 'Win Rate',
                      value: '${status.winRate.toStringAsFixed(1)}%',
                      icon: Icons.percent,
                      iconColor: AppColors.win,
                      valueColor: status.winRate >= 50 ? AppColors.win : AppColors.loss,
                    ),
                    MetricCard(
                      label: 'Hoy Ganadas',
                      value: p.todayWins.toString(),
                      icon: Icons.check_circle_outline,
                      iconColor: AppColors.win,
                      valueColor: AppColors.win,
                    ),
                    MetricCard(
                      label: 'Hoy Perdidas',
                      value: p.todayLosses.toString(),
                      icon: Icons.cancel_outlined,
                      iconColor: AppColors.loss,
                      valueColor: AppColors.loss,
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // P&L today
                _PnlCard(pnl: p.todayPnl, totalPnl: status.totalPnl),
                const SizedBox(height: 20),

                // Active trades
                if (p.pendingTrades.isNotEmpty) ...[
                  Row(
                    children: [
                      const Text(
                        'Operaciones Activas',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.pending.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          p.pendingTrades.length.toString(),
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.pending,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ...p.pendingTrades.map((t) => TradeCard(trade: t)),
                  const SizedBox(height: 8),
                ],

                // Recent completed
                if (p.completedTrades.isNotEmpty) ...[
                  const Text(
                    'Recientes',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...p.completedTrades.take(5).map((t) => TradeCard(trade: t)),
                ],

                if (p.trades.isEmpty && !p.isLoadingTrades)
                  _EmptyState(onRefresh: () => p.refreshTrades()),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _BotStatusCard extends StatelessWidget {
  final TradingProvider provider;
  const _BotStatusCard({required this.provider});

  @override
  Widget build(BuildContext context) {
    final running = provider.botStatus.isRunning;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: running
            ? LinearGradient(
                colors: [
                  AppColors.win.withOpacity(0.15),
                  AppColors.primary.withOpacity(0.05)
                ],
              )
            : null,
        color: running ? null : AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: running
              ? AppColors.win.withOpacity(0.4)
              : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color:
                  (running ? AppColors.win : AppColors.textMuted).withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(
              running ? Icons.smart_toy : Icons.smart_toy_outlined,
              color: running ? AppColors.win : AppColors.textMuted,
              size: 22,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  running ? 'Bot Activo' : 'Bot Inactivo',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: running ? AppColors.win : AppColors.textPrimary,
                  ),
                ),
                Text(
                  running
                      ? 'Modo ${provider.botStatus.mode.toUpperCase()} — ${provider.botStatus.platform}'
                      : 'Listo para iniciar',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (provider.botStatus.activeTrades.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.pending.withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${provider.botStatus.activeCount} activas',
                style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.pending,
                    fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final TradingProvider provider;
  const _BalanceCard({required this.provider});

  @override
  Widget build(BuildContext context) {
    final balance = provider.account.balance > 0
        ? provider.account.balance
        : provider.botStatus.balance;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_wallet_outlined,
                  color: Colors.white70, size: 16),
              const SizedBox(width: 6),
              Text(
                provider.isConnected
                    ? '${provider.account.accountType} · IQ Option'
                    : 'Balance Simulación',
                style: const TextStyle(
                    color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '\$${balance.toStringAsFixed(2)}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: -1,
            ),
          ),
          Text(
            'USD · Saldo disponible',
            style:
                const TextStyle(color: Colors.white60, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _PnlCard extends StatelessWidget {
  final double pnl;
  final double totalPnl;
  const _PnlCard({required this.pnl, required this.totalPnl});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _PnlItem(
            label: 'P&L Hoy',
            value: pnl,
            icon: Icons.today_outlined,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _PnlItem(
            label: 'P&L Total',
            value: totalPnl,
            icon: Icons.trending_up_outlined,
          ),
        ),
      ],
    );
  }
}

class _PnlItem extends StatelessWidget {
  final String label;
  final double value;
  final IconData icon;
  const _PnlItem(
      {required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    final positive = value >= 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color:
              (positive ? AppColors.win : AppColors.loss).withOpacity(0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 16),
          const SizedBox(height: 8),
          Text(
            '${positive ? '+' : ''}\$${value.abs().toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: positive ? AppColors.win : AppColors.loss,
              letterSpacing: -0.5,
            ),
          ),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onRefresh;
  const _EmptyState({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(Icons.inbox_outlined, size: 48, color: AppColors.textMuted),
          const SizedBox(height: 12),
          const Text('Sin operaciones aún',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Actualizar'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}
