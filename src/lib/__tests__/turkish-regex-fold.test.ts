import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Regression guard for CLAUDE.md gotcha #62.
 *
 * V8's `/i` flag does simple (ASCII-aware) case folding, not Unicode-aware
 * folding. In particular:
 *   'İ'.toLowerCase() === 'i̇'  // Latin i + combining dot
 * which means a bare `/prim/i` does NOT match `'PRİM'`. Turkish insurance
 * documents are frequently all-caps, so this silently breaks sigorta bedeli
 * extraction, premium sanity checks, DAHİL/HARİÇ detection, etc.
 *
 * The fix pattern is to use explicit character classes like `[iİ]` in the
 * regex source. This test scans every `/i`-flagged regex literal in the
 * extraction modules and asserts the fold invariant:
 *
 *   For every Turkish-sensitive probe `p` in the corpus:
 *     regex.test(p.toLowerCase) iff regex.test(p.toLocaleUpperCase('tr-TR'))
 *
 * A new regex that folds incorrectly will match only one side and fail here.
 */

const TARGET_FILES = [
  'src/lib/ai/policy-extractor.ts',
  'src/lib/ai/policy-converter.ts',
  'src/lib/ai/table-parser.ts',
  'src/lib/ai/extraction/mappers.ts',
  'src/lib/ai/extraction/insights.ts',
] as const

// Hand-picked Turkish phrases that exercise the dotted/dotless i fold.
// Each entry pairs the lowercase form we'd see in a normalized text with
// the all-uppercase form that appears in Turkish all-caps OCR output.
const PROBE_CORPUS: ReadonlyArray<{ lower: string; upper: string }> = [
  { lower: 'prim', upper: 'PRİM' },
  { lower: 'net prim', upper: 'NET PRİM' },
  { lower: 'brüt prim', upper: 'BRÜT PRİM' },
  { lower: 'toplam prim', upper: 'TOPLAM PRİM' },
  { lower: 'sigorta bedeli', upper: 'SİGORTA BEDELİ' },
  { lower: 'sigorta', upper: 'SİGORTA' },
  { lower: 'bedel', upper: 'BEDEL' },
  { lower: 'dahil', upper: 'DAHİL' },
  { lower: 'hariç', upper: 'HARİÇ' },
  { lower: 'vergi', upper: 'VERGİ' },
  { lower: 'muafiyet', upper: 'MUAFİYET' },
  { lower: 'kasko', upper: 'KASKO' },
  { lower: 'çarpma', upper: 'ÇARPMA' },
  { lower: 'hırsızlık', upper: 'HIRSIZLIK' },
  { lower: 'yangın', upper: 'YANGIN' },
  { lower: 'sel', upper: 'SEL' },
  { lower: 'deprem', upper: 'DEPREM' },
  { lower: 'sağlık', upper: 'SAĞLIK' },
  { lower: 'ikame araç', upper: 'İKAME ARAÇ' },
  { lower: 'çekici', upper: 'ÇEKİCİ' },
  { lower: 'yardım', upper: 'YARDIM' },
  { lower: 'sorumluluk', upper: 'SORUMLULUK' },
]

/**
 * Extract regex literals with their flags from TypeScript source text.
 *
 * We scan line-by-line and look for `/.../FLAGS` tokens. To avoid false
 * positives on division operators and block comments, we require the slash
 * to be preceded by `[, (, =, !, &, |, ?, :, ;, return, ,` or start-of-line
 * whitespace.
 *
 * Returns entries with the original regex AND the 1-based line number for
 * diagnostic reporting.
 */
function extractRegexLiterals(
  source: string
): Array<{ regex: RegExp; line: number; raw: string; file?: string }> {
  const results: Array<{ regex: RegExp; line: number; raw: string }> = []
  const lines = source.split('\n')

  // Context before a regex literal: assignment, call arg, array element,
  // comparison, logical, conditional, or `return`. Captures the leading
  // context so we don't match division.
  const ctxChars = '[(,=!&|?:;{<>+*/\\[-]|\\breturn\\s+|^\\s*'
  const bodyChars = '(?:\\\\.|\\[(?:\\\\.|[^\\]\\\\])*\\]|[^/\\n\\\\])+'
  const flagChars = '[gimsuy]*'
  const literalRe = new RegExp(`(?:${ctxChars})(/${bodyChars}/${flagChars})`, 'g')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Cheap fast-paths: skip lines clearly not containing a regex literal.
    if (!line.includes('/')) continue
    // Skip obvious single-line comments (// ...). Regex literals are unlikely
    // inside these and parsing them forgives many false positives.
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    literalRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = literalRe.exec(line)) !== null) {
      const raw = m[1]
      // Split into body and flags.
      const lastSlash = raw.lastIndexOf('/')
      if (lastSlash <= 0) continue
      const body = raw.slice(1, lastSlash)
      const flags = raw.slice(lastSlash + 1)
      if (body.length === 0) continue
      // Only care about /i-flagged patterns. This is the fold-sensitive set.
      if (!flags.includes('i')) continue

      try {
        const regex = new RegExp(body, flags)
        results.push({ regex, line: i + 1, raw })
      } catch {
        // Not a real regex (e.g. regex-looking substring in a string literal).
        // Safe to skip — the parser's false-positive bucket.
      }
    }
  }

  return results
}

describe('Turkish /i-flag case folding regression guard (gotcha #62)', () => {
  const allRegexes: Array<{ regex: RegExp; line: number; raw: string; file: string }> = []

  for (const relPath of TARGET_FILES) {
    const absPath = resolve(process.cwd(), relPath)
    const source = readFileSync(absPath, 'utf-8')
    const regexes = extractRegexLiterals(source)
    for (const entry of regexes) {
      allRegexes.push({ ...entry, file: relPath })
    }
  }

  it('scanned at least 20 /i-flagged regexes (sanity check on the scanner)', () => {
    // If this drops unexpectedly, the scanner broke or the files moved.
    expect(allRegexes.length).toBeGreaterThan(20)
  })

  /**
   * Known pre-existing violations in production extraction code, captured
   * 2026-04-23. These are real gotcha #62 bugs that predate this guard and
   * should be fixed in a follow-up PR (they silently break premium extraction,
   * DAHİL/HARİÇ detection, and coverage classification on all-caps Turkish
   * OCR output). They are grandfathered here so the guard can be landed
   * without mixing a scope-expanding production refactor into the same PR.
   *
   * Keyed by `file:line:regex-source`. To fix a violation: replace the
   * bare `i` in the regex source with `[iİ]` (or use explicit char classes
   * for other vowels — `[ıi]`, `[çc]`, `[gğ]`, `[şs]`, `[üu]`, `[öo]`),
   * then remove the corresponding key from this set.
   *
   * New violations will fail the test immediately.
   */
  const GRANDFATHERED: ReadonlySet<string> = new Set([
    'src/lib/ai/policy-converter.ts:1039:/muafiyet/i',
    'src/lib/ai/table-parser.ts:64:/ikame\\s*ara[çc]/i',
    'src/lib/ai/table-parser.ts:65:/[çc]ekici/i',
    'src/lib/ai/table-parser.ts:84:/muafiyet/i',
    'src/lib/ai/table-parser.ts:85:/dahil/i',
    'src/lib/ai/table-parser.ts:86:/prim/i',
    'src/lib/ai/table-parser.ts:105:/dahil/i',
    'src/lib/ai/table-parser.ts:429:/yardım|asist|çekici|ikame/i',
    'src/lib/ai/table-parser.ts:432:/çarpma|hırsızlık|yangın|deprem|kasko|bina|eşya/i',
  ])

  it('no NEW Turkish case-folding asymmetries beyond the grandfathered baseline', () => {
    const freshViolations: string[] = []

    for (const { regex, line, raw, file } of allRegexes) {
      // A violation is a file:line:regex that fails the fold-symmetry check
      // on any probe in the corpus. We record the site once per regex.
      let asymmetric = false
      let sampleDiagnostic = ''

      for (const { lower, upper } of PROBE_CORPUS) {
        const fresh = new RegExp(regex.source, regex.flags.replace('g', ''))
        const matchesLower = fresh.test(lower)
        const matchesUpper = fresh.test(upper)

        if (matchesLower !== matchesUpper) {
          asymmetric = true
          if (!sampleDiagnostic) {
            sampleDiagnostic = `"${lower}" (${matchesLower}) vs "${upper}" (${matchesUpper})`
          }
        }
      }

      if (asymmetric) {
        const key = `${file}:${line}:${raw}`
        if (!GRANDFATHERED.has(key)) {
          freshViolations.push(
            `${key} — asymmetric on ${sampleDiagnostic}. Use [iİ] / [ıi] / ` +
              `[çc] / [gğ] / [üu] / [öo] / [şs] character classes instead of ` +
              `relying on the /i flag. See CLAUDE.md gotcha #62.`
          )
        }
      }
    }

    if (freshViolations.length > 0) {
      throw new Error(
        `Found ${freshViolations.length} new Turkish case-folding ` +
          `asymmetries (gotcha #62). Either fix the regex with explicit ` +
          `character classes, OR — if you are intentionally landing a ` +
          `known-buggy pattern for a staged fix — add its key to the ` +
          `GRANDFATHERED set in this test with a tracking ticket:\n\n` +
          freshViolations.join('\n')
      )
    }
  })

  it('grandfathered set matches reality (forces cleanup when bugs get fixed)', () => {
    // If a production regex gets fixed to use [iİ], its GRANDFATHERED entry
    // becomes stale. This test catches that so the list shrinks over time.
    const actualViolationKeys = new Set<string>()

    for (const { regex, line, raw, file } of allRegexes) {
      for (const { lower, upper } of PROBE_CORPUS) {
        const fresh = new RegExp(regex.source, regex.flags.replace('g', ''))
        if (fresh.test(lower) !== fresh.test(upper)) {
          actualViolationKeys.add(`${file}:${line}:${raw}`)
          break
        }
      }
    }

    const stale = [...GRANDFATHERED].filter((k) => !actualViolationKeys.has(k))
    if (stale.length > 0) {
      throw new Error(
        `GRANDFATHERED entries no longer correspond to live violations ` +
          `(regex was fixed or moved). Remove these entries from the set:\n\n` +
          stale.join('\n')
      )
    }
  })
})
