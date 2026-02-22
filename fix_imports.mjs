import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk through directory
function walkSync(dir, filelist = []) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git')) {
        filelist = walkSync(filePath, filelist);
      }
    } else {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js')) {
        filelist.push(filePath);
      }
    }
  });
  return filelist;
}

const files = walkSync(path.join(__dirname, 'src'));

let updatedFilesCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // 1. Update application code imports
  // Look for: import { ..., isSupabaseConfigured, ... } from './client' (or similar path)
  // This is a bit complex with regex. A simpler approach is to find the exact import statement and modify it.
  
  if (content.includes('isSupabaseConfigured')) {
    // If it's importing from a client file:
    const importRegex = /import\s+{([^}]*isSupabaseConfigured[^}]*)}\s+from\s+['"]([^'"]*client(\.js|\.ts)?)['"]/g;
    
    content = content.replace(importRegex, (match, importsStr, modulePath) => {
      // importsStr is like " supabase, isSupabaseConfigured "
      const imports = importsStr.split(',').map(s => s.trim()).filter(Boolean);
      const remainingImports = imports.filter(i => i !== 'isSupabaseConfigured');
      
      const configPath = modulePath.replace(/client(\.js|\.ts)?$/, 'config');
      
      let newResult = '';
      if (remainingImports.length > 0) {
         newResult += `import { ${remainingImports.join(', ')} } from '${modulePath}'\n`;
      }
      newResult += `import { isSupabaseConfigured } from '${configPath}'`;
      return newResult;
    });
  }

  // 2. Update test mocks
  if (file.includes('.test.') && content.includes('vi.mock(')) {
     // Look for vi.mock('./client', ... { isSupabaseConfigured: false })
     // We need to keep the client mock for supabase.from(), and add a config mock for isSupabaseConfigured.
     
     // But wait! Many tests just mock isSupabaseConfigured and don't care about anything else from client.
     // Some tests mock Supabase client methods like `updateUser` AND `isSupabaseConfigured`.
     const mockRegex = /vi\.mock\(['"]([^'"]*client)['"],/g;
     
     // Instead of regex manipulating mocks which is very brittle, we can append a mock for config.
     // Let's do a simple replace: if we see vi.mock('.../client', ...
     // we can just make sure we also mock config if isSupabaseConfigured is used in this file.
     // Let's just do it manually for test files using sed or individual script logic since there aren't *too* many tests failing.
     // Actually, let's just replace `isSupabaseConfigured` in the mock object specifically.
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    updatedFilesCount++;
  }
});

console.log(`Updated ${updatedFilesCount} files with new imports.`);
