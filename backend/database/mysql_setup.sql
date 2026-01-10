-- ============================================
-- TRADING BOT - MySQL Database Setup Script
-- ============================================
-- Ejecutar este script en MySQL Workbench para crear la base de datos
-- 
-- Pasos:
-- 1. Abrir MySQL Workbench
-- 2. Conectar a tu servidor local (localhost:3306)
-- 3. Ejecutar este script completo (Ctrl+Shift+Enter)
-- ============================================

-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS trading_bot
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE trading_bot;

-- ============================================
-- TABLA: trades (Historial de operaciones)
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trade_id VARCHAR(64) UNIQUE NOT NULL,
    
    -- Temporal
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    opened_at DATETIME NULL,
    closed_at DATETIME NULL,
    
    -- Plataforma y cuenta
    platform VARCHAR(32) NOT NULL DEFAULT 'iqoption',
    account_type VARCHAR(16) NOT NULL DEFAULT 'DEMO',
    account_email VARCHAR(128) NULL,
    
    -- Activo y operación
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(8) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    expiration_minutes INT NULL,
    
    -- Precios
    entry_price DECIMAL(20,8) NULL,
    exit_price DECIMAL(20,8) NULL,
    strike_price DECIMAL(20,8) NULL,
    
    -- Resultado
    result VARCHAR(16) DEFAULT 'pending',
    profit_loss DECIMAL(15,2) DEFAULT 0.00,
    payout_rate DECIMAL(5,2) NULL,
    
    -- Estrategia y señal
    strategy_id INT NULL,
    strategy_name VARCHAR(64) NULL,
    strategy_version VARCHAR(32) NULL,
    signal_id VARCHAR(64) NULL,
    
    -- Indicadores (JSON)
    indicators_used JSON NULL,
    indicator_values JSON NULL,
    
    -- Condiciones de mercado
    market_condition_id INT NULL,
    market_trend VARCHAR(16) NULL,
    volatility DECIMAL(10,4) NULL,
    
    -- Análisis
    confidence_level DECIMAL(5,2) NULL,
    technical_justification TEXT NULL,
    robot_explanation TEXT NULL,
    entry_reasons JSON NULL,
    
    -- Metadata
    timeframe VARCHAR(8) NULL,
    order_id_platform VARCHAR(64) NULL,
    execution_mode VARCHAR(16) DEFAULT 'manual',
    
    -- Auditoría
    is_synced BOOLEAN DEFAULT FALSE,
    sync_timestamp DATETIME NULL,
    notes TEXT NULL,
    
    -- Índices
    INDEX idx_trades_symbol_date (symbol, created_at),
    INDEX idx_trades_strategy_result (strategy_name, result),
    INDEX idx_trades_platform_account (platform, account_type),
    INDEX idx_trades_trade_id (trade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: signals (Señales generadas)
-- ============================================
CREATE TABLE IF NOT EXISTS signals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signal_id VARCHAR(64) UNIQUE NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Señal
    symbol VARCHAR(32) NOT NULL,
    direction VARCHAR(8) NOT NULL,
    confidence DECIMAL(5,2) NOT NULL,
    
    -- Estrategia
    strategy_id INT NULL,
    strategy_name VARCHAR(64) NULL,
    
    -- Análisis (JSON)
    indicators JSON NULL,
    reasons JSON NULL,
    technical_analysis TEXT NULL,
    
    -- ML
    ml_prediction DECIMAL(5,4) NULL,
    ml_model_version VARCHAR(32) NULL,
    
    -- Estado
    is_executed BOOLEAN DEFAULT FALSE,
    executed_at DATETIME NULL,
    is_valid BOOLEAN DEFAULT TRUE,
    expiry_time DATETIME NULL,
    actual_result VARCHAR(16) NULL,
    
    INDEX idx_signals_symbol_date (symbol, created_at),
    INDEX idx_signals_signal_id (signal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: strategies (Estrategias configurables)
-- ============================================
CREATE TABLE IF NOT EXISTS strategies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Identificación
    name VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NULL,
    description TEXT NULL,
    
    -- Versión y estado
    version VARCHAR(32) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    
    -- Configuración (JSON)
    indicators_config JSON NULL,
    entry_rules JSON NULL,
    exit_rules JSON NULL,
    
    -- Parámetros
    min_confidence DECIMAL(5,2) DEFAULT 60.00,
    max_risk_per_trade DECIMAL(5,2) DEFAULT 2.00,
    allowed_timeframes JSON NULL,
    preferred_symbols JSON NULL,
    
    -- Métricas
    total_trades INT DEFAULT 0,
    winning_trades INT DEFAULT 0,
    losing_trades INT DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    total_profit DECIMAL(15,2) DEFAULT 0.00,
    avg_profit_per_trade DECIMAL(15,2) DEFAULT 0.00,
    
    -- ML
    is_ml_optimized BOOLEAN DEFAULT FALSE,
    ml_score DECIMAL(5,4) NULL,
    last_optimized_at DATETIME NULL,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(64) DEFAULT 'system',
    
    UNIQUE KEY uq_strategy_name_version (name, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: strategy_versions (Versionado)
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    strategy_id INT NOT NULL,
    
    version VARCHAR(32) NOT NULL,
    config_snapshot JSON NOT NULL,
    metrics_snapshot JSON NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64) DEFAULT 'system',
    change_notes TEXT NULL,
    
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: indicator_configs (Config indicadores)
-- ============================================
CREATE TABLE IF NOT EXISTS indicator_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    name VARCHAR(32) NOT NULL,
    display_name VARCHAR(64) NULL,
    parameters JSON NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    used_for JSON NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: market_conditions (Condiciones mercado)
-- ============================================
CREATE TABLE IF NOT EXISTS market_conditions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    symbol VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NULL,
    
    -- Tendencia
    trend VARCHAR(16) NULL,
    trend_strength DECIMAL(5,2) NULL,
    
    -- Volatilidad
    volatility DECIMAL(10,4) NULL,
    atr DECIMAL(20,8) NULL,
    
    -- Momentum
    momentum DECIMAL(10,4) NULL,
    rsi DECIMAL(5,2) NULL,
    
    -- Volumen
    volume_avg DECIMAL(20,2) NULL,
    volume_ratio DECIMAL(10,4) NULL,
    
    -- Niveles
    support_level DECIMAL(20,8) NULL,
    resistance_level DECIMAL(20,8) NULL,
    
    extra_data JSON NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: robot_configs (Configuración robot)
-- ============================================
CREATE TABLE IF NOT EXISTS robot_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    config_name VARCHAR(64) UNIQUE NOT NULL DEFAULT 'default',
    
    -- Modo
    mode VARCHAR(16) DEFAULT 'manual',
    platform VARCHAR(32) DEFAULT 'iqoption',
    account_type VARCHAR(16) DEFAULT 'DEMO',
    
    -- Símbolos y estrategias (JSON)
    active_symbols JSON NULL,
    active_strategies JSON NULL,
    
    -- Trading params
    default_amount DECIMAL(15,2) DEFAULT 1.00,
    max_concurrent_trades INT DEFAULT 3,
    analysis_interval_seconds INT DEFAULT 30,
    
    -- Risk
    risk_level VARCHAR(16) DEFAULT 'medium',
    max_daily_trades INT DEFAULT 50,
    max_daily_loss DECIMAL(15,2) DEFAULT 100.00,
    stop_on_loss_streak INT DEFAULT 5,
    
    -- Timeframes
    default_timeframe VARCHAR(8) DEFAULT '5m',
    allowed_timeframes JSON NULL,
    default_expiration INT DEFAULT 5,
    
    -- ML
    use_ml_predictions BOOLEAN DEFAULT TRUE,
    ml_min_confidence DECIMAL(5,2) DEFAULT 65.00,
    
    -- Estado
    is_active BOOLEAN DEFAULT TRUE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: performance_metrics (Métricas)
-- ============================================
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    period_type VARCHAR(16) NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    
    -- Filtros
    platform VARCHAR(32) NULL,
    account_type VARCHAR(16) NULL,
    symbol VARCHAR(32) NULL,
    strategy_name VARCHAR(64) NULL,
    
    -- Métricas
    total_trades INT DEFAULT 0,
    winning_trades INT DEFAULT 0,
    losing_trades INT DEFAULT 0,
    breakeven_trades INT DEFAULT 0,
    
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    profit_factor DECIMAL(10,4) DEFAULT 0.00,
    
    gross_profit DECIMAL(15,2) DEFAULT 0.00,
    gross_loss DECIMAL(15,2) DEFAULT 0.00,
    net_profit DECIMAL(15,2) DEFAULT 0.00,
    
    avg_win DECIMAL(15,2) DEFAULT 0.00,
    avg_loss DECIMAL(15,2) DEFAULT 0.00,
    largest_win DECIMAL(15,2) DEFAULT 0.00,
    largest_loss DECIMAL(15,2) DEFAULT 0.00,
    
    max_drawdown DECIMAL(15,2) DEFAULT 0.00,
    max_consecutive_wins INT DEFAULT 0,
    max_consecutive_losses INT DEFAULT 0,
    
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_metrics_period (period_type, period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DATOS INICIALES: Estrategias por defecto
-- ============================================
INSERT INTO strategies (name, display_name, description, version, indicators_config, entry_rules, min_confidence, allowed_timeframes) VALUES
('ema_rsi', 'EMA + RSI', 'Estrategia basada en cruce de EMAs con confirmación RSI', '1.0.0', 
 '{"ema": {"periods": [9, 21]}, "rsi": {"period": 14, "overbought": 70, "oversold": 30}}',
 '{"ema_cross": true, "rsi_confirmation": true}', 60.00, '["1m", "5m", "15m"]'),

('macd', 'MACD Strategy', 'Estrategia basada en MACD con histograma', '1.0.0',
 '{"macd": {"fast": 12, "slow": 26, "signal": 9}}',
 '{"macd_cross": true, "histogram_confirmation": true}', 55.00, '["5m", "15m", "1h"]'),

('bollinger', 'Bollinger Bands', 'Estrategia de reversión a la media con Bandas de Bollinger', '1.0.0',
 '{"bollinger": {"period": 20, "std_dev": 2.0}}',
 '{"touch_band": true, "reversal_candle": true}', 60.00, '["5m", "15m"]'),

('ichimoku', 'Ichimoku Cloud', 'Estrategia completa con Ichimoku Kinko Hyo', '1.0.0',
 '{"ichimoku": {"tenkan": 9, "kijun": 26, "senkou_b": 52}}',
 '{"price_vs_cloud": true, "tk_cross": true}', 65.00, '["15m", "1h", "4h"]'),

('multi_strategy', 'Multi-Estrategia ML', 'Combinación de múltiples indicadores optimizada por ML', '1.0.0',
 '{"ema": {"periods": [9, 21, 50]}, "rsi": {"period": 14}, "macd": {"fast": 12, "slow": 26, "signal": 9}}',
 '{"ml_decision": true, "min_indicators_agree": 2}', 70.00, '["5m", "15m"]')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- DATOS INICIALES: Indicadores por defecto
-- ============================================
INSERT INTO indicator_configs (name, display_name, parameters, used_for) VALUES
('ema', 'EMA (9)', '{"period": 9}', '["entry", "exit"]'),
('ema', 'EMA (21)', '{"period": 21}', '["entry", "exit"]'),
('ema', 'EMA (50)', '{"period": 50}', '["confirmation"]'),
('ema', 'EMA (200)', '{"period": 200}', '["trend"]'),
('rsi', 'RSI (14)', '{"period": 14, "overbought": 70, "oversold": 30}', '["entry", "confirmation"]'),
('macd', 'MACD Standard', '{"fast": 12, "slow": 26, "signal": 9}', '["entry", "exit"]'),
('bollinger', 'Bollinger (20, 2)', '{"period": 20, "std_dev": 2.0}', '["entry", "exit"]'),
('atr', 'ATR (14)', '{"period": 14}', '["risk"]');

-- ============================================
-- DATOS INICIALES: Configuración robot
-- ============================================
INSERT INTO robot_configs (config_name, mode, platform, account_type, active_symbols, active_strategies, default_amount, default_timeframe) VALUES
('default', 'manual', 'iqoption', 'DEMO', '["EURUSD", "GBPUSD", "USDJPY"]', '["ema_rsi"]', 1.00, '5m')
ON DUPLICATE KEY UPDATE last_updated = CURRENT_TIMESTAMP;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 'Base de datos trading_bot creada correctamente!' AS mensaje;
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'trading_bot';
