import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/trading_provider.dart';
import 'live_operations_screen.dart';
import 'history_screen.dart';
import 'trading_config_screen.dart';
import 'settings_screen.dart';

/// Shell principal tras conectar broker.
/// Tabs: Operaciones · Historial · Configuración · Ajustes.
class MainShell extends StatefulWidget {
  final int initialIndex;
  const MainShell({super.key, this.initialIndex = 0});

  @override
  State<MainShell> createState() => _MainShellState();

  /// Permite que cualquier descendiente cambie el tab activo del shell.
  static void goToTab(BuildContext context, int index) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<MainShellScope>();
    scope?.controller.setIndex(index);
  }
}

class _MainShellState extends State<MainShell> {
  late final _ShellController _ctrl =
      _ShellController(widget.initialIndex)..addListener(_onChange);

  final List<Widget> _screens = const [
    LiveOperationsScreen(),
    HistoryScreen(),
    TradingConfigScreen(),
    SettingsScreen(),
  ];

  void _onChange() => setState(() {});

  @override
  void dispose() {
    _ctrl.removeListener(_onChange);
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MainShellScope(
      controller: _ctrl,
      child: Scaffold(
        body: IndexedStack(
          index: _ctrl.index,
          children: _screens,
        ),
        bottomNavigationBar: _BottomNav(
          currentIndex: _ctrl.index,
          onTap: _ctrl.setIndex,
        ),
      ),
    );
  }
}

class _ShellController extends ChangeNotifier {
  int _index;
  _ShellController(this._index);
  int get index => _index;
  void setIndex(int i) {
    if (i == _index) return;
    _index = i;
    notifyListeners();
  }
}

class MainShellScope extends InheritedWidget {
  final _ShellController controller;
  const MainShellScope({
    super.key,
    required this.controller,
    required super.child,
  });

  @override
  bool updateShouldNotify(MainShellScope oldWidget) =>
      oldWidget.controller != controller;
}

class _BottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;

  const _BottomNav({required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TradingProvider>();
    final pendingCount = provider.pendingTrades.length;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.outlineVariant)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _NavItem(
                  icon: Icons.bolt_outlined,
                  activeIcon: Icons.bolt,
                  label: 'Operaciones',
                  index: 0,
                  currentIndex: currentIndex,
                  onTap: onTap,
                  badge: pendingCount > 0 ? pendingCount.toString() : null),
              _NavItem(
                  icon: Icons.history_outlined,
                  activeIcon: Icons.history,
                  label: 'Historial',
                  index: 1,
                  currentIndex: currentIndex,
                  onTap: onTap),
              _NavItem(
                  icon: Icons.tune_outlined,
                  activeIcon: Icons.tune,
                  label: 'Config',
                  index: 2,
                  currentIndex: currentIndex,
                  onTap: onTap),
              _NavItem(
                  icon: Icons.settings_outlined,
                  activeIcon: Icons.settings,
                  label: 'Ajustes',
                  index: 3,
                  currentIndex: currentIndex,
                  onTap: onTap),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int index;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final String? badge;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.index,
    required this.currentIndex,
    required this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final isActive = index == currentIndex;
    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: isActive
                        ? AppColors.secondary.withOpacity(0.1)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Icon(
                    isActive ? activeIcon : icon,
                    color:
                        isActive ? AppColors.secondary : AppColors.outline,
                    size: 22,
                  ),
                ),
                if (badge != null)
                  Positioned(
                    top: -2,
                    right: -2,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        badge!,
                        style: const TextStyle(
                          fontSize: 8,
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                color:
                    isActive ? AppColors.secondary : AppColors.outline,
                fontWeight: isActive ? FontWeight.w800 : FontWeight.w600,
                letterSpacing: 0.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
