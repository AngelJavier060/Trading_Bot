import pg8000

try:
    conn = pg8000.connect(
        host='127.0.0.1',
        port=5432,
        user='postgres',
        password='Alexandra1',
        database='postgres'
    )
    cursor = conn.cursor()
    
    # Verificar si la base de datos trading_bot existe
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = 'trading_bot'")
    exists = cursor.fetchone()
    
    if not exists:
        # PostgreSQL no permite CREATE DATABASE dentro de una transacción
        conn.autocommit = True
        cursor.execute("CREATE DATABASE trading_bot")
        print("Base de datos 'trading_bot' CREADA exitosamente")
    else:
        print("La base de datos 'trading_bot' ya existe")
    
    cursor.close()
    conn.close()
    print("Conexion a PostgreSQL en puerto 5432 EXITOSA!")
    
except Exception as e:
    print(f"Error: {e}")
