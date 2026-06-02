import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/trade_model.dart';
import '../config/app_theme.dart';
import 'countdown_widget.dart';

class TradeCard extends StatelessWidget {
  final TradeModel trade;

  const TradeCard({super.key, required this.trade});

  @override
  Widget build(BuildContext context) {
    final isBuy = trade.direction == 'call';
    final Color dirColor = isBuy ? AppColors.win : AppColors.loss;
    Color borderColor;
    if (trade.isWin) {
      borderColor = AppColors.win.withOpacity(0.6);
    } else if (trade.isLoss) {
      borderColor = AppColors.loss.withOpacity(0.5);
    } else {
      borderColor = AppColors.pending.withOpacity(0.5);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor, width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row
          Row(
            children: [
              // Direction badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: dirColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: dirColor.withOpacity(0.4)),
                ),
                child: Text(
                  isBuy ? '▲ CALL' : '▼ PUT',
                  style: TextStyle(
                    color: dirColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                trade.symbol,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(width: 8),
              // Broker badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: trade.isSentToBroker
                      ? AppColors.win.withOpacity(0.15)
                      : AppColors.pending.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: trade.isSentToBroker
                        ? AppColors.win.withOpacity(0.4)
                        : AppColors.pending.withOpacity(0.4),
                  ),
                ),
                child: Text(
                  trade.isSentToBroker ? '🔗 IQ' : '🔸 SIM',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: trade.isSentToBroker ? AppColors.win : AppColors.pending,
                  ),
                ),
              ),
              const Spacer(),
              // Result
              Text(
                trade.resultLabel,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: trade.isWin
                      ? AppColors.win
                      : trade.isLoss
                          ? AppColors.loss
                          : AppColors.pending,
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 10),

          // Bottom row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '\$${trade.amount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  Text(
                    DateFormat('HH:mm:ss').format(trade.timestamp),
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
              if (trade.entryPrice != null)
                Text(
                  'E: ${trade.entryPrice!.toStringAsFixed(5)}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              if (trade.isPending)
                CountdownWidget(expiresAt: trade.expiresAt)
              else
                Text(
                  trade.pnl != null
                      ? '${trade.pnl! >= 0 ? '+' : ''}\$${trade.pnl!.abs().toStringAsFixed(2)}'
                      : '-',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: (trade.pnl ?? 0) >= 0 ? AppColors.win : AppColors.loss,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
