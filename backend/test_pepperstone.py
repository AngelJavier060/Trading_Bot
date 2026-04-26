"""
Script de diagnóstico: conexión MT5 con Pepperstone
Ejecutar con: python test_pepperstone.py
"""
import sys
import glob
import os

print("=" * 60)
print("DIAGNÓSTICO MT5 - PEPPERSTONE")
print("=" * 60)

# 1. Verificar módulo
try:
    import MetaTrader5 as mt5
    print(f"✅ MetaTrader5 módulo instalado: v{mt5.__version__}")
except ImportError:
    print("❌ MetaTrader5 NO instalado. Ejecuta: pip install MetaTrader5")
    sys.exit(1)

# 2. Buscar terminal instalado
print("\n🔍 Buscando terminal MT5 instalado...")
found_terminals = []
for root in [r"C:\Program Files", r"C:\Program Files (x86)"]:
    pattern = os.path.join(root, "*", "terminal64.exe")
    for p in glob.glob(pattern):
        found_terminals.append(p)
        print(f"   📁 Encontrado: {p}")

if not found_terminals:
    print("   ⚠️  No se encontró terminal64.exe en Program Files.")
    print("   ➡️  Descarga el terminal desde: https://pepperstone.com/es/plataformas/metatrader-5/")
else:
    print(f"   ✅ {len(found_terminals)} terminal(es) encontrado(s)")

# 3. Intentar inicializar
print("\n🔌 Intentando mt5.initialize()...")
initialized = mt5.initialize()
err = mt5.last_error()
if not initialized:
    print(f"   ❌ Fallo. mt5.last_error() = {err}")
    if err[0] == -6:
        print()
        print("   ⚠️  ERROR -6: 'Terminal: Authorization failed'")
        print("   Esto significa que el terminal encontrado NO es el de Pepperstone.")
        print()
        print("   SOLUCIÓN:")
        print("   1. Descarga el terminal Pepperstone MT5:")
        print("      https://pepperstone.com/es/plataformas/metatrader-5/")
        print("   2. Instálalo y ábrelo")
        print("   3. Haz login manual con cuenta 61516242 / servidor MT5-demo01")
        print("   4. Luego vuelve a ejecutar este script o conecta desde el dashboard")
        sys.exit(1)
    for path in found_terminals:
        print(f"   ➡️  Probando con ruta: {path}")
        initialized = mt5.initialize(path=path)
        if initialized:
            print(f"   ✅ Inicializado con ruta: {path}")
            break
        else:
            print(f"      ❌ Fallo. Error: {mt5.last_error()}")
else:
    print("   ✅ mt5.initialize() exitoso")

if not initialized:
    print("\n❌ No se puede continuar sin inicialización.")
    print("   SOLUCIÓN: Descarga e instala el terminal Pepperstone MT5, ábrelo y vuelve a intentarlo.")
    print("   URL: https://pepperstone.com/es/plataformas/metatrader-5/")
    sys.exit(1)

# 4. Intentar login
print("\n🔑 Probando login...")
LOGIN = 61516242
PASSWORD = input("Ingresa tu contraseña de Pepperstone: ")
SERVER = "MT5-demo01"

authorized = mt5.login(login=LOGIN, password=PASSWORD, server=SERVER)
if not authorized:
    print(f"   ❌ Login fallido. Error: {mt5.last_error()}")
    print("   Verifica contraseña y nombre de servidor.")
else:
    info = mt5.account_info()
    print(f"   ✅ Conectado correctamente!")
    print(f"   Balance: {info.balance} {info.currency}")
    print(f"   Servidor: {info.server}")
    print(f"   Login: {info.login}")

mt5.shutdown()
print("\n✅ Diagnóstico completado.")
