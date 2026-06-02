#!/usr/bin/env python
# -*- coding: utf-8 -*-

with open('frontend/components/dashboard/live/IqQuantumTerminalShell.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the style jsx global block
start = content.find('<style jsx global>')
end = content.find('</style>', start) + len('</style>')

old_block = content[start:end]

# Create new block with backtick template literal
new_block = '''        <style jsx global>{`
          .qt-ms {
            font-family: 'Material Symbols Outlined', sans-serif;
            font-size: 18px;
            font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
            color: #475569;
          }
          .qt-scroll::-webkit-scrollbar {
            width: 4px;
          }
          .qt-scroll::-webkit-scrollbar-track {
            background: #e2e8f0;
          }
          .qt-scroll::-webkit-scrollbar-thumb {
            background: #94a3b8;
            border-radius: 2px;
          }
          .qt-chart-grid {
            background-image: radial-gradient(#cbd5e1 0.5px, transparent 0.5px);
            background-size: 20px 20px;
          }
        `}</style>'''

content = content[:start] + new_block + content[end:]

with open('frontend/components/dashboard/live/IqQuantumTerminalShell.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed style jsx global block")

# Also fix remaining template literal issues
# Line 263: key={${i}-} -> key={`${i}-`}
content = content.replace('key={${i}-}', 'key={`${i}-`}')  

# Line 318: style={{ width: ${Math.min(100, sig.confidence)}% }} -> style={{ width: `${Math.min(100, sig.confidence)}%` }}
content = content.replace('style={{ width: ${Math.min(100, sig.confidence)}% }}', 'style={{ width: `${Math.min(100, sig.confidence)}%` }}')

with open('frontend/components/dashboard/live/IqQuantumTerminalShell.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed template literal issues")

# Now fix OpenPositionsTerminal.tsx
with open('frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the style jsx block
start = content.find('<style jsx>')
if start >= 0:
    end = content.find('</style>', start) + len('</style>')
    old_block = content[start:end]
    new_block = '''        <style jsx>{`
          .qt-ms {
            font-family: 'Material Symbols Outlined', sans-serif;
            font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
          }
          .qt-scroll::-webkit-scrollbar {
            width: 4px;
          }
          .qt-scroll::-webkit-scrollbar-track {
            background: #f1f5f9;
          }
          .qt-scroll::-webkit-scrollbar-thumb {
            background: #94a3b8;
            border-radius: 2px;
          }
        `}</style>'''
    content = content[:start] + new_block + content[end:]
    print("Fixed style jsx block in OpenPositionsTerminal.tsx")

with open('frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("All fixes applied!")
