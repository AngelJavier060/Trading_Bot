import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../config/app_theme.dart';
import '../models/trade_model.dart';
import '../providers/trading_provider.dart';
import '../widgets/trade_card.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String _filter = 'all'; // all | win | loss | pending

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TradingProvider>().refreshTrades(limit: 50);
    });
  }

  List<TradeModel> _filtered(List<TradeModel> trades) {
    switch (_filter) {
      case 'win':
        return trades.where((t) => t.isWin).toList();
      case 'loss':
        return trades.where((t) => t.isLoss).toList();
      case 'pending':
        return trades.where((t) => t.isPending).toList();
      default:
        return trades;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final filtered = _filtered(p.trades);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Historial'),
        backgroundColor: AppColors.bg,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined, size: 20),
            onPressed: () => p.refreshTrades(limit: 50),
            color: AppColors.textSecondary,
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats summary
          _StatsSummary(trades: p.trades),

          // Filter chips
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                      label: 'Todas',
                      value: 'all',
                      current: _filter,
                      count: p.trades.length,
                      onTap: () => setState(() => _filter = 'all')),
                  const SizedBox(width: 8),
                  _FilterChip(
                      label: 'Ganadas',
                      value: 'win',
                      current: _filter,
                      count: p.trades.where((t) => t.isWin).length,
                      color: AppColors.win,
                      onTap: () => setState(() => _filter = 'win')),
                  const SizedBox(width: 8),
                  _FilterChip(
                      label: 'Perdidas',
                      value: 'loss',
                      current: _filter,
                      count: p.trades.where((t) => t.isLoss).length,
                      color: AppColors.loss,
                      onTap: () => setState(() => _filter = 'loss')),
                  const SizedBox(width: 8),
                  _FilterChip(
                      label: 'Activas',
                      value: 'pending',
                      current: _filter,
                      count: p.pendingTrades.length,
                      color: AppColors.pending,
                      onTap: () => setState(() => _filter = 'pending')),
                ],
              ),
            ),
          ),

          // List
          Expanded(
            child: p.isLoadingTrades && p.trades.isEmpty
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.primary))
                : filtered.isEmpty
                    ? _EmptyHistory(
                        onRefresh: () => p.refreshTrades(limit: 50))
                    : RefreshIndicator(
                        color: AppColors.primary,
                        backgroundColor: AppColors.card,
                        onRefresh: () => p.refreshTrades(limit: 50),
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 8),
                          itemCount: filtered.length,
                          itemBuilder: (_, i) {
                            final trade = filtered[i];
                            final prevDate = i > 0 ? filtered[i - 1].timestamp : null;
                            final showDate = prevDate == null ||
                                !_sameDay(prevDate, trade.timestamp);
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (showDate)
                                  Padding(
                                    padding:
                                        const EdgeInsets.symmetric(vertical: 8),
                                    child: Text(
                                      _dateLabel(trade.timestamp),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.textMuted,
                                      ),
                                    ),
                                  ),
                                TradeCard(trade: trade),
                              ],
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _dateLabel(DateTime d) {
    final now = DateTime.now();
    if (_sameDay(d, now)) return 'Hoy';
    if (_sameDay(d, now.subtract(const Duration(days: 1)))) return 'Ayer';
    return DateFormat('EEEE, d MMM', 'es').format(d);
  }
}

class _StatsSummary extends StatelessWidget {
  final List<TradeModel> trades;
  const _StatsSummary({required this.trades});

  @override
  Widget build(BuildContext context) {
    final wins = trades.where((t) => t.isWin).length;
    final losses = trades.where((t) => t.isLoss).length;
    final total = wins + losses;
    final rate = total > 0 ? (wins / total * 100) : 0.0;
    final pnl =
        trades.where((t) => !t.isPending).fold(0.0, (s, t) => s + (t.pnl ?? 0));

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _StatItem(label: 'Total', value: trades.length.toString()),
          _divider(),
          _StatItem(
              label: 'Win Rate',
              value: '${rate.toStringAsFixed(0)}%',
              color: rate >= 50 ? AppColors.win : AppColors.loss),
          _divider(),
          _StatItem(
              label: 'P&L',
              value: '${pnl >= 0 ? '+' : ''}\$${pnl.abs().toStringAsFixed(2)}',
              color: pnl >= 0 ? AppColors.win : AppColors.loss),
          _divider(),
          _StatItem(
              label: 'Ganadas', value: wins.toString(), color: AppColors.win),
        ],
      ),
    );
  }

  Widget _divider() => Container(
      height: 30, width: 1, color: AppColors.border);
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _StatItem({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: color ?? AppColors.textPrimary,
          ),
        ),
        Text(label,
            style: const TextStyle(
                fontSize: 10, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final int count;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.value,
    required this.current,
    required this.count,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final active = value == current;
    final c = color ?? AppColors.primary;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? c.withOpacity(0.2) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? c : AppColors.border),
        ),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: active ? c : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: active ? c.withOpacity(0.2) : AppColors.border,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                count.toString(),
                style: TextStyle(
                  fontSize: 10,
                  color: active ? c : AppColors.textMuted,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyHistory extends StatelessWidget {
  final VoidCallback onRefresh;
  const _EmptyHistory({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.history, size: 56, color: AppColors.textMuted),
          const SizedBox(height: 12),
          const Text('Sin historial de operaciones',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 15)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Actualizar'),
            style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary)),
          ),
        ],
      ),
    );
  }
}
