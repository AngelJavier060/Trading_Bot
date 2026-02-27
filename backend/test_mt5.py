import MetaTrader5 as mt5, os, sys, struct

print('py', sys.version, 'arch', struct.calcsize('P')*8)
print('init=', mt5.initialize())
print('last_error=', mt5.last_error())

candidates = [
    r"C:\Program Files\Admirals MetaTrader 5\terminal64.exe",
    r"C:\Program Files\Admiral Markets MetaTrader 5\terminal64.exe",
    r"C:\Program Files\MetaTrader 5\terminal64.exe"
]

ok = False
for p in candidates:
    if os.path.exists(p):
        print("try:", p, "exists")
        ok = mt5.initialize(path=p)
        print("init_path=", ok, "last_error=", mt5.last_error())
        if ok:
            break

if not ok:
    print("No se pudo inicializar MT5 con rutas conocidas")
else:
    print("MT5 inicializado correctamente")

# Test login si se pudo inicializar
if ok:
    server = "AdmiralsSC-Demo"
    login = 600156764
    password = "S*%gQRu8xqL99q"
    print('login=', mt5.login(login=login, password=password, server=server))
    print('last_error=', mt5.last_error())
    info = mt5.account_info()
    print('account_info_ok=', info is not None)
    if info:
        print('balance=', info.balance, 'equity=', info.equity, 'currency=', info.currency)
    mt5.shutdown()
