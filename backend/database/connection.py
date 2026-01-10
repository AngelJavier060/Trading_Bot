"""
Database Connection Module
Configuración y gestión de conexión a MySQL/PostgreSQL/SQLite
"""

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager
import logging
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

logger = logging.getLogger(__name__)

# Base declarativa para modelos
Base = declarative_base()

# Variables globales
_engine = None
_session_factory = None
db = None

def get_database_url():
    """Obtener URL de base de datos desde variables de entorno"""
    # Prioridad: DATABASE_URL completa
    db_url = os.environ.get('DATABASE_URL')
    
    if db_url:
        # Soporte para PostgreSQL (Heroku style)
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        return db_url
    
    # Construir URL desde variables individuales de MySQL
    mysql_host = os.environ.get('MYSQL_HOST', 'localhost')
    mysql_port = os.environ.get('MYSQL_PORT', '3306')
    mysql_user = os.environ.get('MYSQL_USER', 'root')
    mysql_password = os.environ.get('MYSQL_PASSWORD', '')
    mysql_database = os.environ.get('MYSQL_DATABASE', 'trading_bot')
    
    # Si hay configuración MySQL, usarla
    if mysql_host and mysql_database:
        if mysql_password:
            return f'mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_database}'
        else:
            return f'mysql+pymysql://{mysql_user}@{mysql_host}:{mysql_port}/{mysql_database}'
    
    # Fallback a SQLite
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'trading_bot.db')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return f'sqlite:///{db_path}'

def init_db(app=None):
    """Inicializar la base de datos y crear tablas"""
    global _engine, _session_factory, db
    
    database_url = get_database_url()
    logger.info(f"Intentando conectar a: {database_url.split('@')[0] if '@' in database_url else database_url.split('?')[0]}")
    
    # Intentar MySQL primero, si falla usar SQLite
    try:
        if 'mysql' in database_url:
            # Probar conexión MySQL
            import pymysql
            parts = database_url.replace('mysql+pymysql://', '').split('@')
            if len(parts) == 2:
                user_pass = parts[0].split(':')
                host_db = parts[1].split('/')
                user = user_pass[0]
                password = user_pass[1] if len(user_pass) > 1 else ''
                host_port = host_db[0].split(':')
                host = host_port[0]
                port = int(host_port[1]) if len(host_port) > 1 else 3306
                db_name = host_db[1] if len(host_db) > 1 else 'trading_bot'
                
                # Test connection
                conn = pymysql.connect(host=host, port=port, user=user, password=password)
                conn.close()
                logger.info("Conexión MySQL verificada correctamente")
    except Exception as mysql_error:
        logger.warning(f"MySQL no disponible: {mysql_error}")
        logger.info("Usando SQLite como alternativa...")
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'trading_bot.db')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        database_url = f'sqlite:///{db_path}'
    
    # Configuración del engine
    engine_config = {
        'echo': os.environ.get('SQL_DEBUG', 'false').lower() == 'true',
        'pool_pre_ping': True,
    }
    
    # Configuración específica para SQLite
    if database_url.startswith('sqlite'):
        engine_config['connect_args'] = {'check_same_thread': False}
    else:
        # PostgreSQL
        engine_config['pool_size'] = 5
        engine_config['max_overflow'] = 10
    
    _engine = create_engine(database_url, **engine_config)
    
    # Habilitar foreign keys para SQLite
    if database_url.startswith('sqlite'):
        @event.listens_for(_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    
    # Crear session factory
    _session_factory = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    db = scoped_session(_session_factory)
    
    # Importar modelos y crear tablas
    from . import models
    Base.metadata.create_all(bind=_engine)
    
    logger.info("Base de datos inicializada correctamente")
    return db

def get_db_session():
    """Obtener una sesión de base de datos"""
    global db
    if db is None:
        init_db()
    return db

@contextmanager
def session_scope():
    """Proporcionar un scope transaccional para una serie de operaciones"""
    session = get_db_session()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Error en transacción de base de datos: {e}")
        raise
    finally:
        session.remove()

def close_db():
    """Cerrar conexión a la base de datos"""
    global db, _engine
    if db:
        db.remove()
    if _engine:
        _engine.dispose()
    logger.info("Conexión a base de datos cerrada")
