import os
import re

def walk_dir(directory):
    for root, _, files in os.walk(directory):
        if 'node_modules' in root or '.git' in root: continue
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                yield os.path.join(root, file)

import_pattern = re.compile(r'import\s+\{([^}]+)\}\s+from\s+[\'"]([^\'"]*client)[\'"]')

# Mock patterns
# vi.mock('./client', () => ({ isSupabaseConfigured: () => true, ... }))
def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    orig = content
    
    # 1. Fix Imports
    def handle_import(m):
        imports_str = m.group(1)
        mod_path = m.group(2)
        imports = [x.strip() for x in imports_str.split(',')]
        if 'isSupabaseConfigured' not in imports:
            return m.group(0)
            
        others = [x for x in imports if x != 'isSupabaseConfigured' and x]
        config_path = mod_path.replace('client', 'config')
        
        lines = []
        if others:
            lines.append(f"import {{ {', '.join(others)} }} from '{mod_path}'")
        lines.append(f"import {{ isSupabaseConfigured }} from '{config_path}'")
        return '\n'.join(lines)
        
    content = import_pattern.sub(handle_import, content)

    # 2. Fix Mocks
    # Some files mock `isSupabaseConfigured` like:
    # isSupabaseConfigured: () => true
    # isSupabaseConfigured: () => false
    # isSupabaseConfigured: false
    # isSupabaseConfigured: mockIsConfigured
    
    # find where vi.mock passes a string ending in 'client'
    mock_pattern = re.compile(r'(vi\.mock\([\'"][^\'"]*client[\'"],[^)]*?\n\}\)\))', re.DOTALL)
    
    # Actually, a safer way to add the config mock is just to see if the file tests things requiring it, 
    # but the easiest is simply replacing `isSupabaseConfigured: <value>` inside the client mock,
    # and extracting it into a separate config mock right before or after the client mock.
    
    # We can just search for the specific lines:
    mock_val_pattern = re.compile(r'^\s*isSupabaseConfigured:\s*(.+?),?$', re.MULTILINE)
    
    if '.test' in filepath:
        # Check if it has a mock for client
        matches = list(re.finditer(r'vi\.mock\([\'"]([^\'"]*client)[\'"]', content))
        if matches and mock_val_pattern.search(content):
            for m in matches:
                mod = m.group(1)
                config_mod = mod.replace('client', 'config')
                
                # Find the `isSupabaseConfigured` value in the file
                val_match = mock_val_pattern.search(content)
                if val_match:
                    val = val_match.group(1)
                    # remove it from the original content
                    content = content.replace(val_match.group(0), '')
                    
                    # add the new mock
                    new_mock = f"\nvi.mock('{config_mod}', () => ({{\n  isSupabaseConfigured: {val},\n  credentials: null\n}}))\n"
                    # insert right before the client mock
                    idx = content.find(m.group(0))
                    content = content[:idx] + new_mock + content[idx:]

    if content != orig:
        with open(filepath, 'w') as f:
            f.write(content)
        print("Fixed", filepath)

for f in walk_dir('src'):
    fix_file(f)
