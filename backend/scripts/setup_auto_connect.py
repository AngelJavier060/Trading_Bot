"""
Script de Configuracion Rapida de Auto-Conexion
================================================
Uso:
    python scripts/setup_auto_connect.py
    
Este script te guia para guardar tus credenciales de IQ Option
y configurar el bot para que se conecte automaticamente al iniciar.

Luego solo reinicia el servidor y el bot se conectara solo!
"""

import sys
import os

# Agregar backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_header():
    clear_screen()
    print("=" * 60)
    print("  CONFIGURACION DE AUTO-CONEXION IQ OPTION")
    print("=" * 60)
    print()
    print("  Este asistente te ayudara a configurar el bot para que")
    print("  se conecte automaticamente a IQ Option cada vez que")
    print("  inicies el servidor.")
    print()
    print("  Las credenciales se guardan CIFRADAS en data/credentials.json")
    print()


def get_input(prompt, secret=False):
    """Obtiene input del usuario de forma segura."""
    import getpass
    if secret:
        return getpass.getpass(prompt)
    return input(prompt)


def main():
    print_header()

    # Preguntar credenciales IQ Option
    print("  >> Ingresa tus credenciales de IQ Option:")
    print("  (Deja vacio si no quieres configurar IQ Option ahora)")
    print()

    email = get_input("  Email: ").strip()
    if not email:
        print()
        print("  Saltando configuracion de IQ Option...")
        setup_iq = False
    else:
        setup_iq = True
        password = get_input("  Contrasena: ", secret=True).strip()

        print()
        print("  Tipo de cuenta:")
        print("    1) PRACTICE (Demo) - RECOMENDADO")
        print("    2) REAL (Dinero real)")
        account_choice = get_input("  Selecciona (1/2) [1]: ").strip() or "1"

        account_type = "REAL" if account_choice == "2" else "PRACTICE"

    # Preguntar configuracion del bot
    print()
    print("  🤖 Configuracion del Bot Automatico:")
    print()

    auto_start = get_input("  Iniciar bot automaticamente al conectar? (s/N): ").strip().lower()
    auto_start_bot = auto_start in ('s', 'si', 'y', 'yes')

    if auto_start_bot:
        mode = get_input("  Modo (auto/manual) [auto]: ").strip() or "auto"
        symbols = get_input("  Simbolos [EURUSD,GBPUSD,USDJPY]: ").strip() or "EURUSD,GBPUSD,USDJPY"
        strategies = get_input("  Estrategias [ema_rsi]: ").strip() or "ema_rsi"
        amount_str = get_input("  Monto por trade ($) [10]: ").strip() or "10"
        confidence_str = get_input("  Confianza minima (%) [68]: ").strip() or "68"

        try:
            amount = float(amount_str)
        except ValueError:
            amount = 10.0
        try:
            confidence = float(confidence_str)
        except ValueError:
            confidence = 68.0
    else:
        mode = "manual"
        symbols = "EURUSD,GBPUSD,USDJPY"
        strategies = "ema_rsi"
        amount = 10.0
        confidence = 68.0

    # Guardar credenciales
    print()
    print("  Guardando credenciales...")

    from services.trading.auto_connector import auto_connector

    credentials = {}
    if setup_iq:
        credentials["iqoption_email"] = email
        credentials["iqoption_password"] = password
        credentials["iqoption_account_type"] = account_type

    if credentials:
        success = auto_connector.save_credentials(credentials)
        if success:
            print(f"  [OK] Credenciales de IQ Option guardadas ({account_type})")
        else:
            print("  [ERROR] Error al guardar credenciales")
            return
    else:
        print("  [INFO]  No se guardaron credenciales")

    # Guardar config de auto-inicio
    import json
    from pathlib import Path

    config_path = Path("data/auto_start_config.json")
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps({
            "auto_start_bot": auto_start_bot,
            "bot_config": {
                "mode": mode,
                "symbols": [s.strip() for s in symbols.split(",") if s.strip()],
                "strategies": [s.strip() for s in strategies.split(",") if s.strip()],
                "amount": amount,
                "min_confidence": confidence,
                "expiration": 5,
                "max_concurrent": 3,
                "max_daily_trades": 50,
            },
        }, indent=2), encoding="utf-8")
        print("  [OK] Configuracion de auto-inicio guardada")
    except Exception as e:
        print(f"  [ERROR] Error guardando config: {e}")
        return

    # Resumen final
    print()
    print("=" * 60)
    print("  ** CONFIGURACION COMPLETADA!")
    print("=" * 60)
    print()
    print("  Resumen:")
    print(f"  - IQ Option: {'Configurado (' + account_type + ')' if setup_iq else 'No configurado'}")
    print(f"  - Auto-inicio del bot: {'SI' if auto_start_bot else 'NO'}")
    if auto_start_bot:
        print(f"  - Modo: {mode}")
        print(f"  - Simbolos: {symbols}")
        print(f"  - Estrategias: {strategies}")
        print(f"  - Monto: ${amount}")
        print(f"  - Confianza minima: {confidence}%")
    print()
    print("  Proximos pasos:")
    print("  1. Inicia/reinicia el servidor Flask:")
    print("     python run.py")
    print()
    print("  2. El bot se conectara automaticamente a IQ Option")
    print("     (puedes ver el estado en /api/auto-connect/status)")
    print()
    print("  3. Si configuraste auto-inicio, el bot empezara a operar solo!")
    print()


if __name__ == "__main__":
    main()
