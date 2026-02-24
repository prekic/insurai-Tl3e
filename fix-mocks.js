const fs = require('fs');
const files = [
  'src/hooks/useFileUpload.test.ts',
  'src/__tests__/integration/navigation-flow.test.tsx',
  'src/lib/library-branches.test.tsx',
  'src/lib/policy-context.test.tsx',
  'src/components/MyAccount-coverage.test.tsx',
  'src/components/PolicyUpload-coverage.test.tsx',
  'src/components/MyAccount.test.tsx',
  'src/components/PolicyUpload.test.tsx',
  'src/components/medium-coverage-branches.test.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const mockConfig = `vi.mock('@/lib/supabase/config', () => ({\n  isSupabaseConfigured: () => false,\n}))\n\n`;
  if (!content.includes(`vi.mock('@/lib/supabase/config'`)) {
    content = content.replace(/(vi\.mock\('@\/lib\/supabase',\s*\(\)\s*=>\s*\{)/g, mockConfig + '$1');
    fs.writeFileSync(file, content);
  }
});
