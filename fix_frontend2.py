import re

# Fix OpenPositionsTerminal.tsx
with open(r'frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the <style jsx> block - need backticks around CSS
old_style = "<style jsx>{\n          .qt-ms {"
new_style = "<style jsx>{`\n          .qt-ms {"
content = content.replace(old_style, new_style)

old_style_end = "        }</style>"
new_style_end = "        `}</style>"
content = content.replace(old_style_end, new_style_end)

# Find any remaining template literal patterns that need backticks
# Specifically look for key={${...}, style={{ ${...}, etc.
# Pattern: { followed by $ (not inside backticks)
lines = content.split('\n')
for i, line in enumerate(lines):
    # Check for $ followed by { that's not inside backticks
    in_backtick = False
    j = 0
    while j < len(line):
        if line[j] == '`':
            in_backtick = not in_backtick
        elif line[j] == '$' and j+1 < len(line) and line[j+1] == '{' and not in_backtick:
            print(f"Line {i+1}: Missing backtick before: ...{line[max(0,j-20):j+30]}...")
        j += 1

with open(r'frontend/components/dashboard/live/OpenPositionsTerminal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed style block in OpenPositionsTerminal.tsx")
