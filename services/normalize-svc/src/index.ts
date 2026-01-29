/**
 * Normalize Service
 *
 * Deterministic, locale-aware normalization engine.
 * NO LLM/AI - only rule-based transformations.
 *
 * Features:
 * - Applies locale rule packs (Turkish, German, English, etc.)
 * - Applies policy rule packs for domain-specific patterns
 * - Tracks all transformations for audit
 * - Preserves evidence (original text, positions)
 */

import type {
  LocaleRulePack,
  PolicyRulePack,
  NormalizeResult,
  NormalizationTransform,
  AppliedRule,
  ReadingOrderBlock,
  EvidenceIndex,
} from '@insurai/types'

import crypto from 'crypto'

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizeOptions {
  localePack: LocaleRulePack
  policyPack?: PolicyRulePack
  docId: string
  preserveEvidence?: boolean
  debug?: boolean
}

export interface NormalizeStats {
  originalLength: number
  normalizedLength: number
  rulesApplied: number
  transformCount: number
  durationMs: number
}

// ============================================================================
// MAIN NORMALIZER CLASS
// ============================================================================

export class Normalizer {
  private localePack: LocaleRulePack
  private policyPack?: PolicyRulePack
  private docId: string
  private preserveEvidence: boolean
  private debug: boolean

  constructor(options: NormalizeOptions) {
    this.localePack = options.localePack
    this.policyPack = options.policyPack
    this.docId = options.docId
    this.preserveEvidence = options.preserveEvidence ?? true
    this.debug = options.debug ?? false
  }

  /**
   * Normalize text using locale and policy rules
   */
  normalize(text: string): NormalizeResult {
    const startTime = Date.now()
    const inputHash = this.hash(text)
    const transforms: NormalizationTransform[] = []
    const appliedRulesMap: Map<string, AppliedRule> = new Map()

    let current = text

    // Stage 1: Unicode normalization
    current = this.applyUnicodeNormalization(current, appliedRulesMap)

    // Stage 2: Whitespace normalization
    current = this.applyWhitespaceNormalization(current, appliedRulesMap)

    // Stage 3: Split-letter merge (OCR artifact fixing)
    current = this.applySplitLetterMerge(current, appliedRulesMap)

    // Stage 4: Custom locale rules (ordered)
    current = this.applyCustomRules(current, this.localePack.normalization.customRules || [], appliedRulesMap)

    // Stage 5: Policy-specific rules (if available)
    // Note: Policy packs don't have normalization rules in the current schema,
    // but we could extend this in the future

    // Stage 6: Number canonicalization
    current = this.applyNumberCanonicalization(current, appliedRulesMap)

    // Stage 7: Final cleanup
    current = this.applyFinalCleanup(current, appliedRulesMap)

    const outputHash = this.hash(current)

    // Build transform record
    transforms.push({
      docId: this.docId,
      stage: 'locale',
      appliedRules: Array.from(appliedRulesMap.values()),
      inputHash,
      outputHash,
      createdAt: new Date(),
    })

    // Build reading order blocks
    const readingOrderBlocks = this.extractReadingOrderBlocks(current)

    // Build evidence index
    const evidenceIndex = this.buildEvidenceIndex(text, current)

    if (this.debug) {
      console.log(`[Normalizer] ${this.docId}:`)
      console.log(`  - Input length: ${text.length}`)
      console.log(`  - Output length: ${current.length}`)
      console.log(`  - Rules applied: ${appliedRulesMap.size}`)
      console.log(`  - Duration: ${Date.now() - startTime}ms`)
    }

    return {
      normalizedText: current,
      transforms,
      readingOrderBlocks,
      evidenceIndex,
    }
  }

  // ============================================================================
  // STAGE 1: UNICODE NORMALIZATION
  // ============================================================================

  private applyUnicodeNormalization(text: string, rules: Map<string, AppliedRule>): string {
    const forms = this.localePack.normalization.unicode
    let result = text

    for (const form of forms) {
      if (form === 'NFKC' || form === 'NFC' || form === 'NFKD' || form === 'NFD') {
        const before = result
        result = result.normalize(form)
        if (before !== result) {
          this.recordRule(rules, `unicode-${form}`, `Unicode ${form}`, before, result)
        }
      }
    }

    return result
  }

  // ============================================================================
  // STAGE 2: WHITESPACE NORMALIZATION
  // ============================================================================

  private applyWhitespaceNormalization(text: string, rules: Map<string, AppliedRule>): string {
    const ws = this.localePack.normalization.whitespace
    let result = text

    // Normalize exotic whitespace to regular space
    const beforeExotic = result
    result = result.replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, ' ')
    if (beforeExotic !== result) {
      this.recordRule(rules, 'ws-exotic', 'Normalize exotic whitespace', beforeExotic, result)
    }

    // Normalize line endings
    const beforeLineEndings = result
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (beforeLineEndings !== result) {
      this.recordRule(rules, 'ws-lineendings', 'Normalize line endings', beforeLineEndings, result)
    }

    // Collapse whitespace runs (but preserve paragraph breaks if configured)
    if (ws.collapseRuns) {
      const beforeCollapse = result
      // Collapse horizontal whitespace runs
      result = result.replace(/[ \t]{2,}/g, ' ')
      if (beforeCollapse !== result) {
        this.recordRule(rules, 'ws-collapse', 'Collapse whitespace runs', beforeCollapse, result)
      }
    }

    // Handle paragraph preservation
    if (ws.preserveParagraphs) {
      // Keep double newlines, collapse 3+ to double
      const beforePara = result
      result = result.replace(/\n{3,}/g, '\n\n')
      if (beforePara !== result) {
        this.recordRule(rules, 'ws-paragraphs', 'Preserve paragraph breaks', beforePara, result)
      }
    } else {
      // Collapse all newlines
      const beforeNewlines = result
      result = result.replace(/\n+/g, '\n')
      if (beforeNewlines !== result) {
        this.recordRule(rules, 'ws-newlines', 'Collapse newlines', beforeNewlines, result)
      }
    }

    // Trim lines
    if (ws.trimLines) {
      const beforeTrim = result
      result = result
        .split('\n')
        .map(line => line.trim())
        .join('\n')
      if (beforeTrim !== result) {
        this.recordRule(rules, 'ws-trim', 'Trim line whitespace', beforeTrim, result)
      }
    }

    return result
  }

  // ============================================================================
  // STAGE 3: SPLIT-LETTER MERGE (OCR ARTIFACT FIXING)
  // ============================================================================

  private applySplitLetterMerge(text: string, rules: Map<string, AppliedRule>): string {
    const slm = this.localePack.normalization.splitLetterMerge
    if (!slm.enabled) {
      return text
    }

    let result = text
    let _totalMatches = 0

    for (const pattern of slm.patterns) {
      try {
        const regex = new RegExp(pattern.regex, 'gu')
        const before = result

        switch (pattern.action) {
          case 'mergeRemoveSpaces':
            result = result.replace(regex, (match) => match.replace(/\s+/g, ''))
            break

          case 'mergeRemoveSpacesIfAllCaps':
            result = result.replace(regex, (match) => {
              // Only merge if all parts are uppercase
              const parts = match.split(/\s+/)
              const allCaps = parts.every(p => p === p.toUpperCase())
              return allCaps ? match.replace(/\s+/g, '') : match
            })
            break

          case 'custom':
            if (pattern.customHandler === 'mergeMultiSpacedWord') {
              result = this.mergeMultiSpacedWord(result, regex)
            }
            break
        }

        if (before !== result) {
          const matchCount = (before.match(regex) || []).length
          _totalMatches += matchCount
          this.recordRule(rules, `slm-${pattern.action}`, `Split-letter merge: ${pattern.action}`, before, result, matchCount)
        }
      } catch (e) {
        console.error(`[Normalizer] Invalid split-letter pattern: ${pattern.regex}`, e)
      }
    }

    return result
  }

  /**
   * Custom handler for multi-spaced words like "M üş teri"
   */
  private mergeMultiSpacedWord(text: string, regex: RegExp): string {
    return text.replace(regex, (match) => match.replace(/\s+/g, ''))
  }

  // ============================================================================
  // STAGE 4: CUSTOM LOCALE RULES
  // ============================================================================

  private applyCustomRules(
    text: string,
    customRules: NonNullable<LocaleRulePack['normalization']['customRules']>,
    rules: Map<string, AppliedRule>
  ): string {
    if (!customRules || customRules.length === 0) {
      return text
    }

    // Sort by order
    const sortedRules = [...customRules].sort((a, b) => a.order - b.order)

    let result = text

    for (const rule of sortedRules) {
      try {
        const regex = new RegExp(rule.pattern, rule.flags)
        const before = result
        const matches = result.match(regex)

        if (matches && matches.length > 0) {
          result = result.replace(regex, rule.replacement)

          if (before !== result) {
            this.recordRule(rules, rule.id, rule.name, before, result, matches.length)
          }
        }
      } catch (e) {
        console.error(`[Normalizer] Invalid custom rule pattern: ${rule.id} - ${rule.pattern}`, e)
      }
    }

    return result
  }

  // ============================================================================
  // STAGE 5: NUMBER CANONICALIZATION
  // ============================================================================

  private applyNumberCanonicalization(text: string, _rules: Map<string, AppliedRule>): string {
    const nc = this.localePack.normalization.numberCanonicalization
    if (!nc) {
      return text
    }

    // We don't actually change numbers in the text - that would corrupt data.
    // Number canonicalization is done during extraction/validation.
    // Here we just note that it will be applied later.

    return text
  }

  // ============================================================================
  // STAGE 6: FINAL CLEANUP
  // ============================================================================

  private applyFinalCleanup(text: string, rules: Map<string, AppliedRule>): string {
    let result = text

    // Remove zero-width characters
    const beforeZW = result
    result = result.replace(/[\u200B-\u200D\uFEFF]/g, '')
    if (beforeZW !== result) {
      this.recordRule(rules, 'cleanup-zw', 'Remove zero-width characters', beforeZW, result)
    }

    // Remove control characters (except newline and tab)
    const beforeControl = result
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    if (beforeControl !== result) {
      this.recordRule(rules, 'cleanup-control', 'Remove control characters', beforeControl, result)
    }

    // Collapse any remaining multiple spaces to single
    const beforeFinalSpace = result
    result = result.replace(/ {2,}/g, ' ')
    if (beforeFinalSpace !== result) {
      this.recordRule(rules, 'cleanup-space', 'Final space collapse', beforeFinalSpace, result)
    }

    // Trim final result
    result = result.trim()

    return result
  }

  // ============================================================================
  // READING ORDER BLOCKS
  // ============================================================================

  private extractReadingOrderBlocks(text: string): ReadingOrderBlock[] {
    const blocks: ReadingOrderBlock[] = []
    const paragraphs = text.split(/\n\n+/)

    let order = 0
    for (const para of paragraphs) {
      if (para.trim().length === 0) continue

      const lines = para.split('\n')
      for (const line of lines) {
        if (line.trim().length === 0) continue

        blocks.push({
          id: `block-${order}`,
          pageNo: 1, // Would need layout info for actual page numbers
          bbox: { x: 0, y: 0, width: 0, height: 0 }, // Would need layout info
          text: line.trim(),
          type: this.detectBlockType(line),
          order: order++,
        })
      }
    }

    return blocks
  }

  private detectBlockType(line: string): ReadingOrderBlock['type'] {
    // Simple heuristics - would be more sophisticated with layout info
    const trimmed = line.trim()

    // All caps might be a heading
    if (trimmed === trimmed.toUpperCase() && trimmed.length < 100 && /^[A-ZÇĞİÖŞÜ\s]+$/.test(trimmed)) {
      return 'heading'
    }

    // Numbered items
    if (/^\d+[.)-]/.test(trimmed) || /^[a-z][.)-]/i.test(trimmed)) {
      return 'list_item'
    }

    // Page markers
    if (/sayfa\s*:\s*\d+\s*\/\s*\d+/i.test(trimmed)) {
      return 'footer'
    }

    return 'paragraph'
  }

  // ============================================================================
  // EVIDENCE INDEX
  // ============================================================================

  private buildEvidenceIndex(original: string, normalized: string): EvidenceIndex {
    // Simple word-level evidence mapping
    // In production, this would use token IDs from OCR
    const tokens: EvidenceIndex['tokens'] = []

    const words = normalized.split(/\s+/)
    let offset = 0

    for (const word of words) {
      if (word.length === 0) continue

      const start = normalized.indexOf(word, offset)
      if (start === -1) continue

      tokens.push({
        text: word,
        span: { start, end: start + word.length },
        sourceTokenIds: [], // Would link to OCR token IDs
        bbox: { x: 0, y: 0, width: 0, height: 0 }, // Would need layout info
        pageNo: 1,
        confidence: 1.0,
      })

      offset = start + word.length
    }

    return { tokens }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private recordRule(
    rules: Map<string, AppliedRule>,
    ruleId: string,
    ruleName: string,
    before: string,
    after: string,
    count: number = 1
  ): void {
    const existing = rules.get(ruleId)

    if (existing) {
      existing.matches += count
      // Add example if we don't have many
      if (existing.examples.length < 3) {
        // Find a diff example
        const example = this.findDiffExample(before, after)
        if (example) {
          existing.examples.push(example)
        }
      }
    } else {
      const example = this.findDiffExample(before, after)
      rules.set(ruleId, {
        ruleId,
        ruleName,
        matches: count,
        examples: example ? [example] : [],
      })
    }
  }

  private findDiffExample(before: string, after: string): { before: string; after: string } | null {
    // Find first difference and extract context
    const minLen = Math.min(before.length, after.length)
    let diffStart = -1

    for (let i = 0; i < minLen; i++) {
      if (before[i] !== after[i]) {
        diffStart = i
        break
      }
    }

    if (diffStart === -1 && before.length !== after.length) {
      diffStart = minLen
    }

    if (diffStart === -1) {
      return null
    }

    // Extract context around diff
    const contextStart = Math.max(0, diffStart - 20)
    const contextEnd = Math.min(Math.max(before.length, after.length), diffStart + 40)

    return {
      before: before.slice(contextStart, Math.min(before.length, contextEnd)),
      after: after.slice(contextStart, Math.min(after.length, contextEnd)),
    }
  }

  private hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick normalize with default options
 */
export function normalizeText(
  text: string,
  localePack: LocaleRulePack,
  policyPack?: PolicyRulePack,
  docId: string = 'unknown'
): NormalizeResult {
  const normalizer = new Normalizer({
    localePack,
    policyPack,
    docId,
  })

  return normalizer.normalize(text)
}

/**
 * Normalize and return just the text
 */
export function normalizeTextSimple(
  text: string,
  localePack: LocaleRulePack
): string {
  const result = normalizeText(text, localePack, undefined, 'simple')
  return result.normalizedText
}

// ============================================================================
// EXPORTS
// ============================================================================

// Normalizer class is already exported at definition
export type { NormalizeOptions, NormalizeStats }
