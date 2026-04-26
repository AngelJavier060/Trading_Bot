import 'package:flutter/material.dart';
import '../config/app_theme.dart';

class ConnectionBanner extends StatelessWidget {
  final bool isConnected;
  final VoidCallback onConnect;

  const ConnectionBanner({
    super.key,
    required this.isConnected,
    required this.onConnect,
  });

  @override
  Widget build(BuildContext context) {
    if (isConnected) return const SizedBox.shrink();

    return GestureDetector(
      onTap: onConnect,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.pending.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.pending.withOpacity(0.4)),
        ),
        child: Row(
          children: [
            const Icon(Icons.warning_amber_rounded,
                color: AppColors.pending, size: 16),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'Modo simulación — Toca para conectar IQ Option y operar real',
                style: TextStyle(
                  color: AppColors.pending,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.pending, size: 18),
          ],
        ),
      ),
    );
  }
}
