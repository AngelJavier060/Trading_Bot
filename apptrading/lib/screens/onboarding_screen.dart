import 'package:flutter/material.dart';
import '../config/app_theme.dart';
import 'login_screen.dart';

/// Onboarding tras pulsar COMENZAR.
/// Muestra 4 páginas con las funcionalidades del bot.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageCtrl = PageController();
  int _index = 0;

  static const _pages = [
    _OnboardPage(
      icon: Icons.bolt_outlined,
      title: 'Ejecución Algorítmica',
      description:
          'Estrategias EMA + RSI, MACD Scalper y Bandas de Bollinger ejecutadas con latencia sub-segundo en mercados Forex y cripto.',
      tag: 'PRECISIÓN',
    ),
    _OnboardPage(
      icon: Icons.hub_outlined,
      title: 'Multi-Plataforma',
      description:
          'Conecta MetaTrader 5, IQ Option, Binance, Bybit o Coinbase desde una misma interfaz unificada.',
      tag: 'CONECTIVIDAD',
    ),
    _OnboardPage(
      icon: Icons.shield_outlined,
      title: 'Gestión de Riesgo',
      description:
          'Take-profit, stop-loss, máximo concurrente y límites diarios. Tu capital protegido por capas.',
      tag: 'SEGURIDAD',
    ),
    _OnboardPage(
      icon: Icons.insights_outlined,
      title: 'Operaciones en Tiempo Real',
      description:
          'Dashboard live con hasta 10 operaciones activas, historial completo, win-rate y P&L.',
      tag: 'TRANSPARENCIA',
    ),
  ];

  void _next() {
    if (_index < _pages.length - 1) {
      _pageCtrl.nextPage(
          duration: const Duration(milliseconds: 320), curve: Curves.easeOut);
    } else {
      _goToLogin();
    }
  }

  void _goToLogin() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (_index < _pages.length - 1)
            TextButton(
              onPressed: _goToLogin,
              child: const Text('Saltar',
                  style: TextStyle(
                      color: AppColors.onSurfaceVariant,
                      fontWeight: FontWeight.w600)),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _pageCtrl,
                itemCount: _pages.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => _pages[i],
              ),
            ),
            // Indicators
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _pages.length,
                (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: i == _index ? 28 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: i == _index
                        ? AppColors.secondary
                        : AppColors.outlineVariant,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            // CTA
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _next,
                  child: Text(
                    _index < _pages.length - 1 ? 'SIGUIENTE' : 'CONTINUAR',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardPage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final String tag;
  const _OnboardPage({
    required this.icon,
    required this.title,
    required this.description,
    required this.tag,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: AppColors.secondary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: AppColors.secondary.withOpacity(0.2)),
            ),
            child: Icon(icon, size: 56, color: AppColors.secondary),
          ),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.tertiaryFixed.withOpacity(0.4),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              tag,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.onTertiaryFixedVariant,
                letterSpacing: 1.4,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
              letterSpacing: -0.4,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              color: AppColors.onSurfaceVariant,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
