import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/platform_def.dart';
import '../providers/auth_provider.dart';
import '../providers/trading_provider.dart';
import 'platform_login_screen.dart';
import 'main_shell.dart';
import 'welcome_screen.dart';

/// Hub de Conectividad — primera pantalla tras el login institucional.
/// Muestra las plataformas soportadas y la conexión activa (si la hay).
class PlatformsHubScreen extends StatefulWidget {
  const PlatformsHubScreen({super.key});

  @override
  State<PlatformsHubScreen> createState() => _PlatformsHubScreenState();
}

class _PlatformsHubScreenState extends State<PlatformsHubScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TradingProvider>().checkConnection();
    });
  }

  static const _platforms = kPlatforms;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TradingProvider>();
    final auth = context.watch<AuthProvider>();
    final connectedId = p.isConnected ? p.connectedPlatform : '';

    final hero = _platforms.firstWhere(
      (pl) => pl.id == connectedId,
      orElse: () => _platforms.first,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: _buildAppBar(context, auth),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
          children: [
            // Page header
            const Text(
              'BOT JAVIERCITO TRADING',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.outline,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.6,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Hub de Conectividad',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: AppColors.onSurface,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Gestiona tus conexiones activas y descubre nuevas plataformas de ejecución.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.onSurfaceVariant,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),

            // Hero card (full width) — plataforma actualmente activa o "MT5" como predeterminada
            _HeroCard(
              platform: hero,
              connected: p.isConnected,
              onManage: () {
                if (p.isConnected) {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(
                        builder: (_) => const MainShell()),
                  );
                } else {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) =>
                          PlatformLoginScreen(platform: hero),
                    ),
                  );
                }
              },
            ),
            const SizedBox(height: 12),

            // Bento grid (2 cols)
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.92,
              ),
              itemCount: _platforms.where((pl) => pl.id != hero.id).length,
              itemBuilder: (_, i) {
                final list = _platforms
                    .where((pl) => pl.id != hero.id)
                    .toList(growable: false);
                final pl = list[i];
                final isConnected = pl.id == connectedId;
                return _PlatformCard(
                  platform: pl,
                  isConnected: isConnected,
                  onConnect: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PlatformLoginScreen(platform: pl),
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),

            // "Nueva conexión" placeholder
            _NewConnectionTile(
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Conexiones API personalizadas próximamente'),
                  ),
                );
              },
            ),
          ],
        ),
      ),
      bottomNavigationBar: _BottomShell(
        connected: p.isConnected,
        onTapBots: () {
          if (p.isConnected) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const MainShell()),
            );
          }
        },
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context, AuthProvider auth) {
    return AppBar(
      title: Row(
        children: [
          const Icon(Icons.hub, color: AppColors.secondary, size: 22),
          const SizedBox(width: 8),
          const Text(
            'AlphaConnect',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.account_circle_outlined),
          onPressed: () => _showProfileSheet(context, auth),
        ),
      ],
      backgroundColor: Colors.white,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: const Border(
        bottom: BorderSide(color: AppColors.outlineVariant, width: 1),
      ),
    );
  }

  void _showProfileSheet(BuildContext context, AuthProvider auth) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.secondary.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.person,
                    color: AppColors.secondary, size: 28),
              ),
              const SizedBox(height: 12),
              Text(
                auth.username.isEmpty ? 'admin' : auth.username,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16),
              ),
              const Text(
                'PERFIL INSTITUCIONAL',
                style: TextStyle(
                    fontSize: 11,
                    color: AppColors.outline,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await context.read<AuthProvider>().logout();
                    await context.read<TradingProvider>().disconnect();
                    if (context.mounted) {
                      Navigator.of(context).pushAndRemoveUntil(
                        MaterialPageRoute(
                            builder: (_) => const WelcomeScreen()),
                        (_) => false,
                      );
                    }
                  },
                  icon: const Icon(Icons.logout, size: 18),
                  label: const Text('Cerrar sesión'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                    padding: const EdgeInsets.symmetric(vertical: 14),
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

class _HeroCard extends StatelessWidget {
  final PlatformDef platform;
  final bool connected;
  final VoidCallback onManage;
  const _HeroCard({
    required this.platform,
    required this.connected,
    required this.onManage,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.outlineVariant.withOpacity(0.5)),
        boxShadow: AppColors.cardShadow,
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Decorative glow
          Positioned(
            top: -40,
            right: -40,
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(
                color: AppColors.secondaryContainer.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainer,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: AppColors.outlineVariant.withOpacity(0.4)),
                    ),
                    child: Icon(platform.icon,
                        size: 28, color: AppColors.onSurface),
                  ),
                  if (connected) _ConnectedBadge() else _DisconnectedBadge(),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                platform.name,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                connected ? 'ID: ${platform.idLabel}' : platform.idLabel,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.outline,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: onManage,
                  icon: Icon(connected ? Icons.settings : Icons.link, size: 18),
                  label: Text(connected ? 'GESTIONAR' : 'CONECTAR'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: connected
                        ? AppColors.surfaceContainerHigh
                        : AppColors.secondary,
                    foregroundColor:
                        connected ? AppColors.onSurface : Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    side: connected
                        ? const BorderSide(color: AppColors.outlineVariant)
                        : BorderSide.none,
                    textStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PlatformCard extends StatelessWidget {
  final PlatformDef platform;
  final bool isConnected;
  final VoidCallback onConnect;
  const _PlatformCard({
    required this.platform,
    required this.isConnected,
    required this.onConnect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.outlineVariant.withOpacity(0.5)),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(10),
              border:
                  Border.all(color: AppColors.outlineVariant.withOpacity(0.4)),
            ),
            child: Icon(platform.icon, size: 22, color: AppColors.onSurface),
          ),
          const Spacer(),
          Text(
            platform.name,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            isConnected ? 'CONECTADO' : 'DISPONIBLE',
            style: TextStyle(
              fontSize: 10,
              color: isConnected ? AppColors.tertiary : AppColors.outline,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 36,
            child: ElevatedButton(
              onPressed: onConnect,
              style: ElevatedButton.styleFrom(
                backgroundColor: isConnected
                    ? AppColors.surfaceContainerHigh
                    : AppColors.onSurface,
                foregroundColor:
                    isConnected ? AppColors.onSurface : Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                padding: EdgeInsets.zero,
              ),
              child: Text(
                isConnected ? 'GESTIONAR' : 'CONECTAR',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectedBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.tertiaryFixed,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.onTertiaryFixed,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          const Text(
            'CONECTADO',
            style: TextStyle(
              fontSize: 9,
              color: AppColors.onTertiaryFixed,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

class _DisconnectedBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Text(
        'DISPONIBLE',
        style: TextStyle(
          fontSize: 9,
          color: AppColors.outline,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _NewConnectionTile extends StatelessWidget {
  final VoidCallback onTap;
  const _NewConnectionTile({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainer.withOpacity(0.4),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: AppColors.outlineVariant.withOpacity(0.7),
            style: BorderStyle.solid,
            width: 1.5,
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerHigh,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.add,
                  color: AppColors.onSurfaceVariant, size: 24),
            ),
            const SizedBox(height: 12),
            const Text(
              'Nueva Conexión',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.onSurface,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Añadir plataforma mediante API personalizada',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: AppColors.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomShell extends StatelessWidget {
  final bool connected;
  final VoidCallback onTapBots;
  const _BottomShell({required this.connected, required this.onTapBots});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.outlineVariant)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _ShellTab(icon: Icons.show_chart, label: 'MARKET', active: false),
          _ShellTab(
              icon: Icons.account_balance_wallet, label: 'PORTFOLIO', active: false),
          GestureDetector(
            onTap: onTapBots,
            child: _ShellTab(
                icon: Icons.smart_toy, label: 'BOTS', active: true),
          ),
          _ShellTab(icon: Icons.settings, label: 'SETTINGS', active: false),
        ],
      ),
    );
  }
}

class _ShellTab extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  const _ShellTab(
      {required this.icon, required this.label, required this.active});
  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.secondary : AppColors.outline;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: color,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }
}
