import 'dart:async';
import 'package:flutter/material.dart';
import '../config/app_theme.dart';

class CountdownWidget extends StatefulWidget {
  final DateTime? expiresAt;

  const CountdownWidget({super.key, required this.expiresAt});

  @override
  State<CountdownWidget> createState() => _CountdownWidgetState();
}

class _CountdownWidgetState extends State<CountdownWidget> {
  late Timer _timer;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _update();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _update());
  }

  void _update() {
    if (widget.expiresAt == null) return;
    final r = widget.expiresAt!.difference(DateTime.now());
    setState(() => _remaining = r.isNegative ? Duration.zero : r);
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_remaining == Duration.zero) {
      return const Text(
        'Finalizando...',
        style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
      );
    }
    final m = _remaining.inMinutes;
    final s = _remaining.inSeconds % 60;
    final isUrgent = _remaining.inSeconds <= 30;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.timer_outlined, size: 13,
            color: isUrgent ? AppColors.loss : AppColors.pending),
        const SizedBox(width: 4),
        Text(
          '$m:${s.toString().padLeft(2, '0')}',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            fontFamily: 'monospace',
            color: isUrgent ? AppColors.loss : AppColors.pending,
          ),
        ),
      ],
    );
  }
}
