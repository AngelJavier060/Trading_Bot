import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../config/app_theme.dart';
import '../models/trade_model.dart';
import '../providers/trading_provider.dart';

/// Historial de operaciones — diseño "Historical Operations" institucional.
///
/// Muestra:
///   • Cards de resumen (Total Profit / Win Rate / Total Trades).
///   • Filtros y búsqueda por activo.
///   • Lista detallada de cada operación cerrada.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final _searchCtrl = TextEditingController();
  String _filter = 'all';
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TradingProvider>().refreshTrades(limit: 100);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<TradeModel> _apply(List<TradeModel> trades) {
    var list = trades;
    switch (_filter) {
      case 'win':
        list = list.where((t) => t.isWin).toList();
        break;
      case 'loss':
        list = list.where((t) => t.isLoss).toList();
        break;
      case 'pending':
        list = list.where((t) => t.isPending).toList();
        break;
    }
    if (_query.isNotEmpty) {
      final q = _query.toLowerCase();
      list = list
          .where((t) => t.symbol.toLowerCase().contains(q))
          .toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final filtered = _apply(p.trades);

    final closed = p.trades.where((t) => !t.isPending).toList();
    final wins = closed.where((t) => t.isWin).length;
    final totalTrades = p.trades.length;
    final winRate =
        closed.isEmpty ? 0.0 : (wins / closed.length * 100);
    final totalProfit =
        closed.fold<double>(0, (s, t) => s + (t.pnl ?? 0));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'HISTORICAL OPERATIONS',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        backgroundColor: Colors.white,
        shape: const Border(
          bottom: BorderSide(color: AppColors.outlineVariant, width: 1),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 22),
            onPressed: () => p.refreshTrades(limit: 100),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Summary dashboard (Bento)
          Row(
            children: [
              Expanded(
                child: _SummaryCard(
                  label: 'Total Profit',
                  value:
                      '${totalProfit >= 0 ? '+' : ''}\$${totalProfit.toStringAsFixed(2)}',
                  icon: Icons.payments_outlined,
                  iconColor: AppColors.tertiary,
                  badge:
                      '${totalProfit >= 0 ? '+' : ''}${(totalProfit / (closed.isEmpty ? 1 : closed.length)).toStringAsFixed(2)} avg',
                  valueColor: totalProfit >= 0
                      ? AppColors.tertiary
                      : AppColors.error,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _SummaryCard(
                  label: 'Win Rate %',
                  value: '${winRate.toStringAsFixed(1)}%',
                  icon: Icons.query_stats,
                  iconColor: AppColors.secondary,
                  progress: winRate / 100,
                  progressColor: AppColors.tertiary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryCard(
                  label: 'Total Trades',
                  value: '$totalTrades',
                  icon: Icons.receipt_long,
                  iconColor: AppColors.secondary,
                  badge: '${closed.length} cerradas',
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Filters + search
          Row(
            children: [
              const Text(
                'Recent Operations',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                  letterSpacing: -0.2,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.filter_list, size: 20),
                color: AppColors.onSurfaceVariant,
                onPressed: _openFilterSheet,
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _query = v.trim()),
            decoration: InputDecoration(
              hintText: 'Buscar activo...',
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide:
                    const BorderSide(color: AppColors.outlineVariant),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide:
                    const BorderSide(color: AppColors.outlineVariant),
              ),
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _ChipFilter(
                  label: 'Todas',
                  count: p.trades.length,
                  active: _filter == 'all',
                  onTap: () => setState(() => _filter = 'all'),
                ),
                _ChipFilter(
                  label: 'Ganadas',
                  count: p.trades.where((t) => t.isWin).length,
                  active: _filter == 'win',
                  color: AppColors.tertiary,
                  onTap: () => setState(() => _filter = 'win'),
                ),
                _ChipFilter(
                  label: 'Perdidas',
                  count: p.trades.where((t) => t.isLoss).length,
                  active: _filter == 'loss',
                  color: AppColors.error,
                  onTap: () => setState(() => _filter = 'loss'),
                ),
                _ChipFilter(
                  label: 'Activas',
                  count: p.pendingTrades.length,
                  active: _filter == 'pending',
                  color: AppColors.secondary,
                  onTap: () => setState(() => _filter = 'pending'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          if (p.isLoadingTrades && p.trades.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (filtered.isEmpty)
            _EmptyHistory(onRefresh: () => p.refreshTrades(limit: 100))
          else
            for (final t in filtered) _OperationRow(trade: t),
        ],
      ),
    );
  }

  void _openFilterSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Filtros avanzados',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Próximamente: filtros por estrategia, plataforma, rango de fechas y monto.',
              style: TextStyle(color: AppColors.outline),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('CERRAR'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;
  final Color? valueColor;
  final String? badge;
  final double? progress;
  final Color? progressColor;
  const _SummaryCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
    this.valueColor,
    this.badge,
    this.progress,
    this.progressColor,
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
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.outline,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
              Icon(icon, size: 18, color: iconColor),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: valueColor ?? AppColors.onSurface,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          if (badge != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.tertiaryFixed.withOpacity(0.4),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                badge!,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onTertiaryFixedVariant,
                ),
              ),
            ),
          if (progress != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: progress!.clamp(0.0, 1.0),
                minHeight: 5,
                backgroundColor: AppColors.surfaceContainerHigh,
                valueColor: AlwaysStoppedAnimation<Color>(
                    progressColor ?? AppColors.secondary),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _OperationRow extends StatelessWidget {
  final TradeModel trade;
  const _OperationRow({required this.trade});

  @override
  Widget build(BuildContext context) {
    final isWin = trade.isWin;
    final isPending = trade.isPending;
    final isCall = trade.direction.toLowerCase() == 'call';
    final color = isPending
        ? AppColors.secondary
        : (isWin ? AppColors.tertiary : AppColors.error);
    final pnl = trade.pnl ?? 0;
    final ts = DateFormat('d MMM yyyy, HH:mm:ss', 'es')
        .format(trade.timestamp.toLocal());
    final isCrypto = trade.symbol.toUpperCase().contains('BTC') ||
        trade.symbol.toUpperCase().contains('ETH') ||
        trade.symbol.toUpperCase().contains('USDT');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  shape: BoxShape.circle,
                  border:
                      Border.all(color: AppColors.outlineVariant),
                ),
                child: Center(
                  child: Text(
                    _shortTag(trade.symbol),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
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
                      _prettySymbol(trade.symbol),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurface,
                      ),
                    ),
                    Text(
                      isCrypto ? 'CRYPTO' : 'FOREX',
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
              _PillBadge(
                text: isCall ? 'CALL' : 'PUT',
                color: isCall ? AppColors.tertiary : AppColors.error,
                bg: isCall
                    ? AppColors.tertiaryFixed.withOpacity(0.5)
                    : AppColors.errorContainer,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(
                isPending
                    ? Icons.hourglass_top
                    : (isWin ? Icons.check_circle : Icons.cancel),
                color: color,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                isPending
                    ? 'ACTIVA'
                    : (isWin ? 'GANADA' : 'PERDIDA'),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: color,
                  letterSpacing: 0.6,
                ),
              ),
              const Spacer(),
              Text(
                '\$${trade.amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(width: 12),
              if (!isPending)
                Text(
                  '${pnl >= 0 ? '+' : ''}\$${pnl.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            ts,
            style: const TextStyle(
              fontSize: 10,
              color: AppColors.outline,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  String _shortTag(String s) {
    final up = s.toUpperCase();
    if (up.length >= 6) {
      return '${up.substring(0, 1)}${up.substring(3, 4)}';
    }
    return up.length >= 2 ? up.substring(0, 2) : up;
  }

  String _prettySymbol(String s) {
    final up = s.toUpperCase();
    if (up.length == 6) {
      return '${up.substring(0, 3)}/${up.substring(3)}';
    }
    if (up.contains('USDT')) return up.replaceAll('USDT', '/USDT');
    return up;
  }
}

class _PillBadge extends StatelessWidget {
  final String text;
  final Color color;
  final Color bg;
  const _PillBadge(
      {required this.text, required this.color, required this.bg});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: color,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _ChipFilter extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final Color? color;
  final VoidCallback onTap;
  const _ChipFilter({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
    this.color,
  });
  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.secondary;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: active ? c.withOpacity(0.12) : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
                color: active ? c : AppColors.outlineVariant, width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: active ? c : AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: active
                      ? c.withOpacity(0.2)
                      : AppColors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: active ? c : AppColors.outline,
                  ),
                ),
              ),
            ],
          ),
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
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Column(
        children: [
          const Icon(Icons.history, size: 48, color: AppColors.outline),
          const SizedBox(height: 12),
          const Text(
            'Sin historial de operaciones',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Las operaciones cerradas aparecerán aquí',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.outline,
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('ACTUALIZAR'),
          ),
        ],
      ),
    );
  }
}
