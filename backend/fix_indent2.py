"""Fix remaining indent issues in feature_engineering.py"""
import re

with open('services/ml/feature_engineering.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

fixed = []
i = 0
while i < len(lines):
    line = lines[i]
    fixed.append(line)
    
    # Check if current line is a method definition
    stripped = line.lstrip()
    if stripped.startswith('def ') and line.startswith('    '):
        # Check if next line exists and is a docstring at wrong indent (4 spaces)
        if i + 1 < len(lines):
            next_line = lines[i + 1]
            next_stripped = next_line.lstrip()
            next_indent = len(next_line) - len(next_stripped)
            if next_stripped.startswith('"""') and next_indent == 4:
                # Fix indent to 8 spaces
                fixed.append('        ' + next_stripped + '\n')
                i += 2
                continue
    
    i += 1

# Write fixed content
content = ''.join(fixed)
with open('services/ml/feature_engineering.py', 'w', encoding='utf-8') as f:
    f.write(content)

# Verify compilation
try:
    import py_compile
    py_compile.compile('services/ml/feature_engineering.py', doraise=True)
    print('OK - File compiles successfully!')
except py_compile.PyCompileError as e:
    print(f'ERROR: {e}')
    # Show the problematic area
    for j, line in enumerate(lines[max(0, i-5):i+5]):
        print(f'  Line {j+max(0, i-5)+1}: {line.rstrip()}')
