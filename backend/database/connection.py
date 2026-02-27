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
ALLOW_SQLITE_FALLBACK = os.environ.get('ALLOW_SQLITE_FALLBACK', 'false').lower() == 'true'

def get_database_url():
    """Obtener URL de base de datos desde variables de entorno"""
    # Prioridad: DATABASE_URL completa
    db_url = os.environ.get('DATABASE_URL')
    
    if db_url:
        # Soporte para PostgreSQL (Heroku style)
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        return db_url

    # Construir URL desde variables individuales de PostgreSQL
    pg_host = os.environ.get('PG_HOST') or os.environ.get('POSTGRES_HOST', 'localhost')
    pg_port = os.environ.get('PG_PORT') or os.environ.get('POSTGRES_PORT', '5432')
    pg_user = os.environ.get('PG_USER') or os.environ.get('POSTGRES_USER', 'postgres')
    pg_password = os.environ.get('PG_PASSWORD') or os.environ.get('POSTGRES_PASSWORD', '')
    pg_database = os.environ.get('PG_DATABASE') or os.environ.get('POSTGRES_DB', 'trading_bot')

    # Si hay configuración PostgreSQL, usarla (driver pg8000)
    if pg_host and pg_database:
        if pg_password:
            return f'postgresql+pg8000://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_database}'
        else:
            return f'postgresql+pg8000://{pg_user}@{pg_host}:{pg_port}/{pg_database}'

    # Si no hay configuración explícita, no usar SQLite por defecto a menos que se permita
    if ALLOW_SQLITE_FALLBACK:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'trading_bot.db')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        return f'sqlite:///{db_path}'
    raise RuntimeError('No se encontró configuración de base de datos. Defina DATABASE_URL o variables PG_HOST/PG_DATABASE')

def init_db(app=None):
    """Inicializar la base de datos y crear tablas"""
    global _engine, _session_factory, db
    
    database_url = get_database_url()
    logger.info(f"Intentando conectar a: {database_url.split('@')[0] if '@' in database_url else database_url.split('?')[0]}")
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
