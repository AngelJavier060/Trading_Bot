"""Test the fixed feature engineering"""
import sys
sys.path.insert(0, '.')

import pandas as pd
import numpy as np
import logging
logging.basicConfig(level=logging.INFO)

from services.ml.feature_engineering import FeatureEngineer, FeatureConfig

# Create sample OHLCV data
np.random.seed(42)
n_candles = 200
base_price = 1.1750

data = {
    'open': base_price + np.random.randn(n_candles).cumsum() * 0.002,
    'high': 0,
    'low': 0,
    'close': 0,
    'volume': np.random.randint(1000, 5000, n_candles),
}

df = pd.DataFrame(data)
df['close'] = df['open'] + np.random.randn(n_candles) * 0.001
df['high'] = df[['open', 'close']].max(axis=1) + np.random.rand(n_candles) * 0.001
df['low'] = df[['open', 'close']].min(axis=1) - np.random.rand(n_candles) * 0.001

print(f"DataFrame shape: {df.shape}")
print(f"Columns: {list(df.columns)}")
print()

# Test feature engineering
fe = FeatureEngineer()

# Test prepare_ml_data (training)
print("Test 1: prepare_ml_data (training)...")
try:
    X_train, X_test, y_train, y_test, feature_names = fe.prepare_ml_data(df)
    print(f"  OK! Train: {X_train.shape}, Test: {X_test.shape}")
    print(f"  Features: {len(feature_names)}")
    assert X_train.shape[1] == X_test.shape[1], "Feature count mismatch!"
    print(f"  Training feature names saved: {len(fe._training_feature_names)}")
except Exception as e:
    print(f"  ERROR: {e}")

print()

# Test prepare_prediction_data using NEW data (without timestamp)
print("Test 2: prepare_prediction_data (prediction)...")
try:
    # Create new data without timestamp
    new_data = pd.DataFrame({
        'open': base_price + np.random.randn(100).cumsum() * 0.002,
        'high': 0,
        'low': 0,
        'close': 0,
        'volume': np.random.randint(1000, 5000, 100),
    })
    new_data['close'] = new_data['open'] + np.random.randn(100) * 0.001
    new_data['high'] = new_data[['open', 'close']].max(axis=1) + np.random.rand(100) * 0.001
    new_data['low'] = new_data[['open', 'close']].min(axis=1) - np.random.rand(100) * 0.001
    
    X_pred = fe.prepare_prediction_data(new_data)
    print(f"  OK! Prediction shape: {X_pred.shape}")
    assert X_pred.shape[1] == len(fe._training_feature_names), f"Expected {len(fe._training_feature_names)} features, got {X_pred.shape[1]}"
    print(f"  Feature count matches training: {X_pred.shape[1]}")
except Exception as e:
    print(f"  ERROR: {e}")

print()

# Test with data that has timestamp
print("Test 3: prepare_prediction_data (with timestamp)...")
try:
    ts_df = new_data.copy()
    ts_df['timestamp'] = np.arange(1000000000, 1000000100)
    
    X_pred2 = fe.prepare_prediction_data(ts_df)
    print(f"  OK! Prediction shape: {X_pred2.shape}")
    assert X_pred2.shape[1] == len(fe._training_feature_names), f"Expected {len(fe._training_feature_names)} features, got {X_pred2.shape[1]}"
    print(f"  Feature count matches training: {X_pred2.shape[1]}")
except Exception as e:
    print(f"  ERROR: {e}")

print()

# Test the warning about DataFrame columns not unique
print("Test 4: No duplicate columns in output...")
try:
    df_test = fe.create_features(df)
    cols = list(df_test.columns)
    duplicates = [c for c in cols if cols.count(c) > 1]
    print(f"  Columns: {len(cols)}, Duplicates: {len(duplicates)}")
    assert len(duplicates) == 0, f"Found duplicate columns: {duplicates}"
    print(f"  No duplicate columns! OK")
except Exception as e:
    print(f"  ERROR: {e}")

print()
print("ALL TESTS COMPLETE")
