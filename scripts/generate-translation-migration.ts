/**
 * Generate SQL migration for missing translation keys.
 *
 * Reads EN/TR translation .ts files, diffs against already-seeded keys
 * from migrations 018/019/020, and produces an idempotent migration file.
 *
 * Usage: npx tsx scripts/generate-translation-migration.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')
const OUTPUT_FILE = path.join(MIGRATIONS_DIR, '030_seed_missing_translations.sql')

// Sections handled by migration 019 (coverage-names, insight translations) — skip
const SKIP_SECTIONS = new Set(['coverageNames', 'insightTranslations'])

// ---------------------------------------------------------------------------
// 1. Parse already-seeded keys from migrations 018/019/020
// ---------------------------------------------------------------------------

function getSeededKeys(): Set<string> {
  const seeded = new Set<string>()
  const migrationFiles = [
    '018_seed_translations.sql',
    '019_seed_coverage_insight_translations.sql',
    '020_seed_unsubscribe_translations.sql',
  ]

  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    if (!fs.existsSync(filePath)) continue
    const sql = fs.readFileSync(filePath, 'utf-8')
    // Match: ('section', 'key' in INSERT INTO public.translation_keys
    const regex = /\('(\w+)',\s*'(\w+)'/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(sql)) !== null) {
      seeded.add(`${match[1]}.${match[2]}`)
    }
  }

  return seeded
}

// ---------------------------------------------------------------------------
// 2. Parse translation objects from .ts files
// ---------------------------------------------------------------------------

type TranslationMap = Record<string, Record<string, string>>

function parseTranslationFile(filePath: string): TranslationMap {
  const content = fs.readFileSync(filePath, 'utf-8')
  const result: TranslationMap = {}

  // Match top-level sections: `  sectionName: {`
  const sectionRegex = /^\s{2}(\w+):\s*\{/gm
  const sections: Array<{ name: string; startIndex: number }> = []
  let match: RegExpExecArray | null

  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push({ name: match[1], startIndex: match.index + match[0].length })
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    // Find closing brace for this section (next section start or end of object)
    const endIndex = i + 1 < sections.length ? sections[i + 1].startIndex : content.length
    const block = content.substring(section.startIndex, endIndex)

    result[section.name] = {}

    // Match key-value pairs within the section block
    // Handles: key: 'value', key: "value", key: `value`, and multiline template literals
    const kvRegex = /^\s+(\w+):\s*(?:'([^']*(?:''[^']*)*)'|"([^"]*(?:\\"[^"]*)*)"|`([^`]*)`)/gm
    let kvMatch: RegExpExecArray | null

    while ((kvMatch = kvRegex.exec(block)) !== null) {
      const key = kvMatch[1]
      const value = kvMatch[2] ?? kvMatch[3] ?? kvMatch[4] ?? ''
      result[section.name][key] = value
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// 3. Escape SQL single quotes
// ---------------------------------------------------------------------------

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

// ---------------------------------------------------------------------------
// 4. Generate SQL
// ---------------------------------------------------------------------------

function generateMigration(
  enTranslations: TranslationMap,
  trTranslations: TranslationMap,
  seededKeys: Set<string>
): string {
  const keyInserts: string[] = []
  const enInserts: string[] = []
  const trInserts: string[] = []

  const sortedSections = Object.keys(enTranslations).sort()

  for (const section of sortedSections) {
    if (SKIP_SECTIONS.has(section)) continue

    const enKeys = enTranslations[section] ?? {}
    const trKeys = trTranslations[section] ?? {}
    const sortedKeys = Object.keys(enKeys).sort()

    for (const key of sortedKeys) {
      const fullKey = `${section}.${key}`
      if (seededKeys.has(fullKey)) continue

      const enValue = enKeys[key]
      const trValue = trKeys[key] ?? enValue // Fallback to EN if TR missing

      if (!enValue && enValue !== '') continue

      keyInserts.push(`  ('${escapeSql(section)}', '${escapeSql(key)}', '${escapeSql(fullKey)}')`)

      const subselect = `(SELECT id FROM public.translation_keys WHERE section = '${escapeSql(section)}' AND key = '${escapeSql(key)}')`

      enInserts.push(`  (${subselect}, 'en', '${escapeSql(enValue)}', TRUE)`)

      trInserts.push(`  (${subselect}, 'tr', '${escapeSql(trValue)}', TRUE)`)
    }
  }

  const lines: string[] = [
    '-- Migration 030: Seed missing translation keys from i18n ternary migration sessions',
    '-- Generated by scripts/generate-translation-migration.ts',
    `-- Date: ${new Date().toISOString().split('T')[0]}`,
    `-- Keys: ${keyInserts.length} new translation keys (${keyInserts.length * 2} translation rows)`,
    '',
    '-- ============================================================',
    '-- Step 1: Insert translation keys',
    '-- ============================================================',
    '',
    'INSERT INTO public.translation_keys (section, key, description) VALUES',
    keyInserts.join(',\n'),
    'ON CONFLICT (section, key) DO NOTHING;',
    '',
    '-- ============================================================',
    '-- Step 2: Insert English translations',
    '-- ============================================================',
    '',
    'INSERT INTO public.translations (key_id, locale, value, is_reviewed) VALUES',
    enInserts.join(',\n'),
    'ON CONFLICT (key_id, locale) DO NOTHING;',
    '',
    '-- ============================================================',
    '-- Step 3: Insert Turkish translations',
    '-- ============================================================',
    '',
    'INSERT INTO public.translations (key_id, locale, value, is_reviewed) VALUES',
    trInserts.join(',\n'),
    'ON CONFLICT (key_id, locale) DO NOTHING;',
    '',
    '-- ============================================================',
    '-- Step 4: Bump translation version to trigger client cache refresh',
    '-- ============================================================',
    '',
    "UPDATE public.translation_metadata SET value = '\"4\"'::jsonb WHERE key = 'version';",
    '',
  ]

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const seededKeys = getSeededKeys()
console.log(`Found ${seededKeys.size} already-seeded keys from migrations 018/019/020`)

const enPath = path.join(ROOT, 'src', 'lib', 'i18n', 'translations-en.ts')
const trPath = path.join(ROOT, 'src', 'lib', 'i18n', 'translations-tr.ts')

const enTranslations = parseTranslationFile(enPath)
const trTranslations = parseTranslationFile(trPath)

const enSections = Object.keys(enTranslations)
const trSections = Object.keys(trTranslations)
console.log(`EN sections: ${enSections.length}, TR sections: ${trSections.length}`)

// Count total EN keys
let totalEnKeys = 0
for (const section of enSections) {
  totalEnKeys += Object.keys(enTranslations[section]).length
}
console.log(`Total EN keys: ${totalEnKeys}`)

const sql = generateMigration(enTranslations, trTranslations, seededKeys)

fs.writeFileSync(OUTPUT_FILE, sql, 'utf-8')

// Count generated translations
const rowMatches = sql.match(/\(SELECT id FROM public\.translation_keys/g) ?? []
console.log(`\nGenerated: ${OUTPUT_FILE}`)
console.log(`Translation rows: ${rowMatches.length} (EN + TR)`)
