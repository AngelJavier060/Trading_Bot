import 'package:flutter/material.dart';

/// Definición de una plataforma soportada en el Hub de Conectividad.
class PlatformDef {
  final String id; // 'mt5' | 'iqoption' | 'binance' | 'bybit' | 'coinbase'
  final String name;
  final IconData icon;
  final String idLabel;

  const PlatformDef({
    required this.id,
    required this.name,
    required this.icon,
    required this.idLabel,
  });

  bool get isMt5 => id == 'mt5';
  bool get isIqOption => id == 'iqoption';
  bool get isCryptoExchange =>
      id == 'binance' || id == 'bybit' || id == 'coinbase';
}

const kPlatforms = <PlatformDef>[
  PlatformDef(
    id: 'mt5',
    name: 'MetaTrader 5',
    icon: Icons.candlestick_chart,
    idLabel: 'MT5-992-ALPHA',
  ),
  PlatformDef(
    id: 'iqoption',
    name: 'IQ Option',
    icon: Icons.show_chart,
    idLabel: 'OPCIONES BINARIAS',
  ),
  PlatformDef(
    id: 'binance',
    name: 'Binance',
    icon: Icons.currency_bitcoin,
    idLabel: 'CRIPTOMONEDAS',
  ),
  PlatformDef(
    id: 'bybit',
    name: 'Bybit',
    icon: Icons.account_balance,
    idLabel: 'DERIVADOS',
  ),
  PlatformDef(
    id: 'coinbase',
    name: 'Coinbase',
    icon: Icons.wallet,
    idLabel: 'EXCHANGE',
  ),
];
