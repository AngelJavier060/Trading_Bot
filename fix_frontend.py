import re

# Fix IqQuantumTerminalShell.tsx
with open(r'frontend/components/dashboard/live/IqQuantumTerminalShell.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: className={bare css classes} - replace with className="bare css classes"
# Pattern matches className={...} where content is only CSS classes (no JS operators/expressions)
def fix_classname(m):
    val = m.group(1).strip()
    # If it looks like CSS classes (starts with a letter, contains CSS-like tokens)
    # and is NOT a JS expression (no operators like ? || &&)
    if not any(op in val for op in ['?', '||', '&&', '===', '!==', '=>', '...', 'typeof']):
        # Check it's not already a proper string/template literal scenario
        if not val.startswith('$') and not val.startswith('`'):
            return f'className="{val}"'
    return m.group(0)

content = re.sub(r'className=\{([^}\"\'`]+)\}', fix_classname, content)

# Fix 2: <style jsx global>{ ... }</style> - need to wrap CSS in template literals
# Replace <style jsx global>{ with <style jsx global>{`
# And }</style> with `}</style>
# But we need to be more careful - find these blocks
def fix_style_blocks(content):
    # Find all <style jsx global>{...}</style> and <style jsx>{...}</style> blocks
    pattern = r'(<style\s+jsx(?:\s+global)?>\s*\{)([^}]+?)\s*\}(</style>)'
    
    def replace_style(m):
        opening = m.group(1)  # <style jsx global>{
        css = m.group(2)       # the CSS content
        closing = m.group(3)   # </style>
        return f'{opening}`\n{css}\n`{closing}'
    
    return re.sub(pattern, replace_style, content, flags=re.DOTALL)

content = fix_style_blocks(content)

with open(r'frontend/components/dashboard/live/IqQuantumTerminalShell.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed IqQuantumTerminalShell.tsx")

# Fix OpenPositionsTerminal.tsx
with open(r'frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix template literals: ${...} without backticks
# Common pattern: return { label: ${core.slice(0, 3)}/, otc };
# Should be: return { label: `${core.slice(0, 3)}/`, otc };

# Fix specific patterns found in the file
replacements = [
    # Line 24: template literal for prettyPair
    ('return { label: ${core.slice(0, 3)}/, otc };', 'return { label: `${core.slice(0, 3)}/`, otc };'),
    # Line 43: template literal for formatCountdown
    ('return ${String(m).padStart(2, \'0\')}:;', 'return `${String(m).padStart(2, \'0\')}:${String(s).padStart(2, \'0\')}`;'),
    # MiniPriceContext template literals
    ('style={{ left: ${pctOpen}% }}', 'style={{ left: `${pctOpen}%` }}'),
    ('style={{ left: ${pctCur}% }}', 'style={{ left: `${pctCur}%` }}'),
    # TimeProgressBar template literals
    ('style={{ width: ${pct}% }}', 'style={{ width: `${pct}%` }}'),
    # groupPositions function
    ('const k = ${p.symbol}__;', 'const k = `${p.symbol}__${expKey}`;'),
    # sellGroup fetch
    ('const res = await fetch(${baseUrl}/api/trading/close-order, {', 'const res = await fetch(`${baseUrl}/api/trading/close-order`, {'),
    # onLog messages in sellGroup
    ('onLog?.(Cerrar : , \'warning\');', 'onLog?.(`Cerrar ${rawId}: ${data?.message || res.status}`, \'warning\');'),
    ('onLog?.(Solicitud de venta enviada ( opción(es)), \'success\');', 'onLog?.(`Solicitud de venta enviada (${g.count} opción(es))`, \'success\');'),
    ('onLog?.(Error al vender: , \'error\');', 'onLog?.(`Error al vender: ${e}`, \'error\');'),
    # sellPgl template literal
    ('{sellPgl != null ? ${sellPgl >= 0 ? \'+\' : \'\'} : \'—\'}', '{sellPgl != null ? `${sellPgl >= 0 ? \'+\' : \'\'}${sellPgl.toFixed(2)}` : \'—\'}'),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"  Fixed: {old[:50]}...")
    else:
        print(f"  NOT FOUND: {old[:50]}...")

# Also fix className issues in this file
content = re.sub(r'className=\{([^}\"\'`]+)\}', fix_classname, content)

with open(r'frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed OpenPositionsTerminal.tsx")
print("Done!")
