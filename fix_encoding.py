import re

filepath = r'src\components\BeltcutPro\BeltcutPro.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

original_length = len(content)

# These are double-encoded characters: UTF-8 bytes read as Latin-1 then re-encoded
# The most visible one: × (multiplication sign, U+00D7) shows as "Ãƒâ€""
# Pattern: when UTF-8 bytes of a character were read as Latin-1 and then UTF-8 encoded again

fixes = [
    # × multiplication sign (20.0m × 1.0m)
    ('\u00c3\u0192\u00e2\u20ac\u201c', '\u00d7'),
    # Another variant of ×
    ('\u00c3\u00971', '\u00d7'),
    # — em dash
    ('\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u201c', '\u2014'),
    # m² (square meter)
    ('m\u00c2\u00b2', 'm\u00b2'),
    ('\u00c2\u00b2', '\u00b2'),
    # ✓ check mark
    ('\u00e2\u009c\u0093', '\u2713'),
    # ⚡ lightning
    ('\u00e2\u009a\u00a1', '\u26a1'),
    # → arrow
    ('\u00e2\u0086\u0092', '\u2192'),
    # " left double quote
    ('\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u201c', '\u201c'),
    # " right double quote  
    ('\u00c3\u00a2\u00e2\u201a\u00ac\u009d', '\u201d'),
]

for old, new in fixes:
    before = content.count(old)
    if before > 0:
        content = content.replace(old, new)
        print(f'Fixed {before}x: {repr(old)} -> {repr(new)}')

# Also handle the specific visible pattern from the screenshot
# "Ãƒâ€"" which in file bytes is the latin1 mis-read of UTF-8 × bytes
# Try a direct string replacement for the visible garbled text
visible_fixes = [
    # The × sign that appears in "20.0m Ãƒâ€" 1.0m"
    ('Ã\u0192â€"', '×'),
    ('\u00c3\u0192\u00e2\u20ac\u201c', '×'),
]
for old, new in visible_fixes:
    before = content.count(old)
    if before > 0:
        content = content.replace(old, new)
        print(f'Fixed visible {before}x: {repr(old)} -> {new}')

with open(filepath, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(content)

print(f'Done. Length: {original_length} -> {len(content)}')
