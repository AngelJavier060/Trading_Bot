import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import '../config/app_theme.dart';
import '../providers/trading_provider.dart';
import '../models/trade_model.dart';

class AnalysisScreen extends StatefulWidget {
  const AnalysisScreen({super.key});

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TradingProvider>().refreshTrades(limit: 100);
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

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Análisis'),
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
            Tab(text: 'Rendimiento'),
            Tab(text: 'Señales'),
            Tab(text: 'Estrategias'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _PerformanceTab(provider: p),
          _SignalsTab(provider: p),
          _StrategiesTab(provider: p),
        ],
      ),
    );
  }
}

// ─── Performance Tab ─────────────────────────────────────────────────────────

class _PerformanceTab extends StatelessWidget {
  final TradingProvider provider;
  const _PerformanceTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final trades = provider.trades.where((t) => !t.isPending).toList();

    if (trades.isEmpty) {
      return const Center(
        child: Text('Sin datos de rendimiento',
            style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // P&L Line chart
          _SectionTitle(title: 'Evolución de P&L acumulado'),
          const SizedBox(height: 12),
          _PnlChart(trades: trades),
          const SizedBox(height: 24),

          // Win/Loss pie
          _SectionTitle(title: 'Distribución de Resultados'),
          const SizedBox(height: 12),
          _WinLossPieChart(trades: trades),
          const SizedBox(height: 24),

          // By symbol
          _SectionTitle(title: 'Rendimiento por Símbolo'),
          const SizedBox(height: 12),
          _SymbolPerformance(trades: trades),
        ],
      ),
    );
  }
}

class _PnlChart extends StatelessWidget {
  final List<TradeModel> trades;
  const _PnlChart({required this.trades});

  @override
  Widget build(BuildContext context) {
    double cumulative = 0;
    final spots = <FlSpot>[];
    final sorted = [...trades]
      ..sort((a, b) => a.timestamp.compareTo(b.timestamp));

    for (var i = 0; i < sorted.length; i++) {
      cumulative += sorted[i].pnl ?? 0;
      spots.add(FlSpot(i.toDouble(), cumulative));
    }

    final minY = spots.map((s) => s.y).reduce((a, b) => a < b ? a : b) - 5;
    final maxY = spots.map((s) => s.y).reduce((a, b) => a > b ? a : b) + 5;

    return Container(
      height: 180,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: LineChart(
        LineChartData(
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) => FlLine(
              color: AppColors.border,
              strokeWidth: 1,
            ),
          ),
          titlesData: FlTitlesData(
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 40,
                getTitlesWidget: (v, _) => Text(
                  '\$${v.toStringAsFixed(0)}',
                  style: const TextStyle(
                      fontSize: 9, color: AppColors.textMuted),
                ),
              ),
            ),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          ),
          borderData: FlBorderData(show: false),
          minY: minY,
          maxY: maxY,
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              color: cumulative >= 0 ? AppColors.win : AppColors.loss,
              barWidth: 2.5,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  colors: [
                    (cumulative >= 0 ? AppColors.win : AppColors.loss)
                        .withOpacity(0.2),
                    Colors.transparent,
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WinLossPieChart extends StatelessWidget {
  final List<TradeModel> trades;
  const _WinLossPieChart({required this.trades});

  @override
  Widget build(BuildContext context) {
    final wins = trades.where((t) => t.isWin).length;
    final losses = trades.where((t) => t.isLoss).length;
    final total = wins + losses;
    if (total == 0) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          SizedBox(
            height: 140,
            width: 140,
            child: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 40,
                sections: [
                  PieChartSectionData(
                    color: AppColors.win,
                    value: wins.toDouble(),
                    title: '${(wins / total * 100).toStringAsFixed(0)}%',
                    radius: 40,
                    titleStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.white),
                  ),
                  PieChartSectionData(
                    color: AppColors.loss,
                    value: losses.toDouble(),
                    title: '${(losses / total * 100).toStringAsFixed(0)}%',
                    radius: 40,
                    titleStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 20),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LegendItem(color: AppColors.win, label: 'Ganadas', count: wins),
              const SizedBox(height: 12),
              _LegendItem(color: AppColors.loss, label: 'Perdidas', count: losses),
              const SizedBox(height: 12),
              _LegendItem(
                  color: AppColors.primary, label: 'Total', count: total),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  final int count;
  const _LegendItem(
      {required this.color, required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
            width: 10,
            height: 10,
            decoration:
                BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Text(label,
            style: const TextStyle(
                fontSize: 13, color: AppColors.textSecondary)),
        const SizedBox(width: 6),
        Text(count.toString(),
            style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary)),
      ],
    );
  }
}

class _SymbolPerformance extends StatelessWidget {
  final List<TradeModel> trades;
  const _SymbolPerformance({required this.trades});

  @override
  Widget build(BuildContext context) {
    final Map<String, _SymbolStats> stats = {};
    for (final t in trades) {
      stats.putIfAbsent(t.symbol, () => _SymbolStats(t.symbol));
      final s = stats[t.symbol]!;
      s.total++;
      if (t.isWin) s.wins++;
      s.pnl += t.pnl ?? 0;
    }
    final sorted = stats.values.toList()
      ..sort((a, b) => b.pnl.compareTo(a.pnl));

    return Column(
      children: sorted
          .map((s) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Text(s.symbol,
                        style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary)),
                    const SizedBox(width: 10),
                    Text('${s.total} ops',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.textSecondary)),
                    const Spacer(),
                    Text(
                      '${s.total > 0 ? (s.wins / s.total * 100).toStringAsFixed(0) : 0}%',
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      '${s.pnl >= 0 ? '+' : ''}\$${s.pnl.abs().toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: s.pnl >= 0 ? AppColors.win : AppColors.loss,
                      ),
                    ),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

class _SymbolStats {
  final String symbol;
  int total = 0;
  int wins = 0;
  double pnl = 0;
  _SymbolStats(this.symbol);
}

// ─── Signals Tab ─────────────────────────────────────────────────────────────

class _SignalsTab extends StatelessWidget {
  final TradingProvider provider;
  const _SignalsTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.primary,
      backgroundColor: AppColors.card,
      onRefresh: provider.refreshSignals,
      child: provider.signals.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.signal_cellular_alt,
                      size: 48, color: AppColors.textMuted),
                  const SizedBox(height: 12),
                  const Text('Sin señales recientes',
                      style: TextStyle(
                          color: AppColors.textSecondary, fontSize: 14)),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: provider.refreshSignals,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Actualizar señales'),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: provider.signals.length,
              itemBuilder: (_, i) {
                final s = provider.signals[i];
                final isBuy = s.isBullish;
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: (isBuy ? AppColors.win : AppColors.loss)
                          .withOpacity(0.4),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        isBuy ? Icons.trending_up : Icons.trending_down,
                        color: isBuy ? AppColors.win : AppColors.loss,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.symbol,
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textPrimary)),
                          Text(s.strategy,
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.textSecondary)),
                        ],
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${s.confidence.toStringAsFixed(0)}%',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

// ─── Strategies Tab ───────────────────────────────────────────────────────────

class _StrategiesTab extends StatelessWidget {
  final TradingProvider provider;
  const _StrategiesTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final st = provider.botStatus;
    final items = [
      {'name': 'EMA + RSI', 'key': 'ema_rsi'},
      {'name': 'MACD', 'key': 'macd'},
      {'name': 'Bollinger Bands', 'key': 'bollinger'},
      {'name': 'RSI Divergencia', 'key': 'rsi_divergence'},
      {'name': 'Ichimoku', 'key': 'ichimoku'},
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Bot stats
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Estado del Bot',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _MiniStat(
                      label: 'Modo',
                      value: st.mode.toUpperCase(),
                      color: AppColors.primary),
                  _MiniStat(
                      label: 'Activas',
                      value: st.activeCount.toString(),
                      color: AppColors.pending),
                  _MiniStat(
                      label: 'Win Rate',
                      value: '${st.winRate.toStringAsFixed(0)}%',
                      color: st.winRate >= 50 ? AppColors.win : AppColors.loss),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('Estrategias disponibles',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary)),
        const SizedBox(height: 12),
        ...items.map(
          (item) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: provider.selectedStrategies.contains(item['key'])
                    ? AppColors.primary.withOpacity(0.5)
                    : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.auto_graph,
                  color: provider.selectedStrategies.contains(item['key'])
                      ? AppColors.primary
                      : AppColors.textMuted,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Text(
                  item['name']!,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary),
                ),
                const Spacer(),
                Switch(
                  value: provider.selectedStrategies.contains(item['key']),
                  onChanged: (v) {
                    final list = [...provider.selectedStrategies];
                    if (v) {
                      list.add(item['key']!);
                    } else {
                      list.remove(item['key']!);
                    }
                    provider.updateConfig(strategies: list);
                  },
                  activeColor: AppColors.primary,
                  trackColor: WidgetStateProperty.resolveWith((states) =>
                      states.contains(WidgetState.selected)
                          ? AppColors.primary.withOpacity(0.3)
                          : AppColors.border),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _MiniStat(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700, color: color)),
        Text(label,
            style: const TextStyle(
                fontSize: 10, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(title,
        style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary));
  }
}
