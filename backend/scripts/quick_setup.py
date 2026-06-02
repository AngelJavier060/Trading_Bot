"""
Quick Setup - Configura auto-conexion a IQ Option
==================================================
Ejecuta este script para guardar tus credenciales de IQ Option
y configurar la auto-conexion al iniciar el servidor.

USO:
    python scripts/quick_setup.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

from services.trading.auto_connector import auto_connector
import json
from pathlib import Path

def main():
    print("=" * 55)
    print("  CONFIGURACION RAPIDA DE AUTO-CONEXION")
    print("=" * 55)
    print()
    print("  Este script guarda tus credenciales de IQ Option")
    print("  para que el bot se conecte automaticamente al iniciar.")
    print()
    print("  (Las credenciales se guardan CIFRADAS)")
    print()

    email = input("  Email de IQ Option: ").strip()
    if not email:
        print("  No se configuro IQ Option. Saliendo...")
        return

    import getpass
    password = getpass.getpass("  Contrasena: ").strip()
    if not password:
        print("  Contrasena vacia. Saliendo...")
        return

    print()
    print("  Tipo de cuenta:")
    print("    1) PRACTICE (Demo) - RECOMENDADO")
    print("    2) REAL (Dinero real)")
    choice = input("  Selecciona (1/2) [1]: ").strip() or "1"
    account_type = "REAL" if choice == "2" else "PRACTICE"

    # Preguntar auto-inicio del bot
    print()
    auto_start = input("  Iniciar bot automaticamente al conectar? (s/N): ").strip().lower()
    auto_start_bot = auto_start in ('s', 'si', 'y', 'yes')

    bot_config = {}
    if auto_start_bot:
        mode = input("  Modo (auto/manual) [auto]: ").strip() or "auto"
        symbols = input("  Simbolos [EURUSD,GBPUSD,USDJPY]: ").strip() or "EURUSD,GBPUSD,USDJPY"
        strategies = input("  Estrategias [ema_rsi]: ").strip() or "ema_rsi"
        amount_str = input("  Monto por trade ($) [10]: ").strip() or "10"
        conf_str = input("  Confianza minima (%) [68]: ").strip() or "68"

        try:
            amount = float(amount_str)
        except ValueError:
            amount = 10.0
        try:
            confidence = float(conf_str)
        except ValueError:
            confidence = 68.0

        bot_config = {
            "mode": mode,
            "symbols": [s.strip() for s in symbols.split(",") if s.strip()],
            "strategies": [s.strip() for s in strategies.split(",") if s.strip()],
            "amount": amount,
            "min_confidence": confidence,
            "expiration": 5,
            "max_concurrent": 3,
            "max_daily_trades": 50,
        }

    # Guardar credenciales
    print()
    print("  Guardando credenciales...")

    credentials = {
        "iqoption_email": email,
        "iqoption_password": password,
        "iqoption_account_type": account_type,
    }

    saved = auto_connector.save_credentials(credentials)
    if not saved:
        print("  ERROR: No se pudieron guardar las credenciales")
        return

    print(f"  OK - Credenciales de IQ Option guardadas ({account_type})")

    # Guardar config de auto-inicio
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/auto_start_config.json").write_text(json.dumps({
        "auto_start_bot": auto_start_bot,
        "bot_config": bot_config,
    }, indent=2), encoding="utf-8")

    if auto_start_bot:
        print("  OK - Configuracion de auto-inicio guardada")
        auto_connector.auto_start_bot = True
        auto_connector.bot_config = bot_config

    # Resumen
    print()
    print("=" * 55)
    print("  CONFIGURACION COMPLETADA!")
    print("=" * 55)
    print()
    print(f"  IQ Option: {email} ({account_type})")
    print(f"  Auto-inicio bot: {'SI' if auto_start_bot else 'NO'}")
    if auto_start_bot:
        print(f"  Modo: {mode}")
        print(f"  Simbolos: {symbols}")
        print(f"  Monto: ${amount}")
    print()
    print("  Proximo paso:")
    print("  1. Inicia/reinicia el servidor:")
    print("     python run.py")
    print()
    print("  2. El bot se conectara automaticamente a IQ Option")
    print("     (ver estado en /api/auto-connect/status)")
    print()

    # Preguntar si conectar ahora
    print()
    connect_now = input("  Conectar a IQ Option AHORA? (s/N): ").strip().lower()
    if connect_now in ('s', 'si', 'y', 'yes'):
        print("  Conectando... (esto puede tomar hasta 30 segundos)")
        result = auto_connector._connect_iqoption(email, password, account_type)
        if result["success"]:
            info = result["account_info"]
            print(f"  OK - Conectado! Balance: ${info['balance']:.2f} ({info['currency']})")
        else:
            print(f"  ERROR: {result['error']}")
    else:
        print("  OK. Las credenciales se usaran en el proximo inicio del servidor.")
    print()

if __name__ == "__main__":
    main()
