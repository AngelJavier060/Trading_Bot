import 'package:flutter/material.dart';
import '../models/signal_model.dart';
import '../config/app_theme.dart';

class SignalCard extends StatelessWidget {
  final SignalModel signal;
  final VoidCallback onExecute;
  final VoidCallback onIgnore;

  const SignalCard({
    super.key,
    required this.signal,
    required this.onExecute,
    required this.onIgnore,
  });

  @override
  Widget build(BuildContext context) {
    final isBuy = signal.isBullish;
    final dirColor = isBuy ? AppColors.win : AppColors.loss;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dirColor.withOpacity(0.4),
          width: 1.2,
        ),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: dirColor.withOpacity(0.08),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: dirColor.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isBuy ? Icons.trending_up : Icons.trending_down,
                    color: dirColor,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      signal.symbol,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      isBuy ? 'CALL — Comprar' : 'PUT — Vender',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: dirColor,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                _ConfidenceBadge(confidence: signal.confidence),
              ],
            ),
          ),

          // Reasons
          if (signal.reasons.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Column(
                children: signal.reasons
                    .take(3)
                    .map(
                      (r) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_outline,
                                size: 12, color: dirColor),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(r,
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.textSecondary)),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),

          // Actions
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onIgnore,
                    icon: const Icon(Icons.close, size: 15),
                    label: const Text('Ignorar'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textSecondary,
                      side: const BorderSide(color: AppColors.border),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: onExecute,
                    icon: const Icon(Icons.flash_on, size: 16),
                    label: const Text('Ejecutar'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: dirColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfidenceBadge extends StatelessWidget {
  final double confidence;
  const _ConfidenceBadge({required this.confidence});

  @override
  Widget build(BuildContext context) {
    Color color;
    if (confidence >= 80) {
      color = AppColors.win;
    } else if (confidence >= 70) {
      color = AppColors.primary;
    } else {
      color = AppColors.pending;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Column(
        children: [
          Text(
            '${confidence.toStringAsFixed(0)}%',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            'Conf.',
            style: TextStyle(fontSize: 9, color: color.withOpacity(0.8)),
          ),
        ],
      ),
    );
  }
}
