"""Fix indentation in feature_engineering.py"""
import re

with open('services/ml/feature_engineering.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix methods that got extra indentation (8 spaces -> 4 spaces)
methods = [
    'create_features', 'prepare_ml_data', 'prepare_prediction_data',
    '_add_return_features', '_add_ma_features', '_add_rsi_features',
    '_add_macd_features', '_add_stochastic_features', '_add_atr_features',
    '_add_bollinger_features', '_add_volume_features', '_add_time_features',
    '_add_lag_features', '_add_candlestick_patterns', '_add_price_action_features',
    'get_feature_importance_names'
]

for method in methods:
    # Fix 8-space indented def
    content = content.replace(f'        def {method}', f'    def {method}')

# Fix 8-space docstrings inside methods that got double-indented
content = content.replace('        """Add', '    """Add')
content = content.replace('        """Create', '    """Create')
content = content.replace('        """Prepare', '    """Prepare')
content = content.replace('        """Use training feature', '    """Use training feature')

# Check for other common indentation issues
lines = content.split('\n')
issues = []
for i, line in enumerate(lines):
    stripped = line.lstrip()
    if stripped.startswith('def ') and line.startswith('        '):
        issues.append(f'Line {i+1}: {line}')

if issues:
    print("Remaining issues:")
    for issue in issues:
        print(f"  {issue}")
else:
    print("All indentation issues fixed!")

with open('services/ml/feature_engineering.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("File saved!")
