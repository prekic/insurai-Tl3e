/**
 * Pattern Learning Store
 *
 * Tracks and learns from common garbage patterns encountered during OCR cleanup.
 * Features:
 * 1. Pattern Recording - Store patterns that caused QA failures
 * 2. Pattern Analysis - Identify common patterns for improved detection
 * 3. Pattern Ranking - Track which patterns cause most issues
 * 4. Pattern Export - Export learned patterns for rule updates
 *
 * This enables continuous improvement of the OCR cleanup pipeline.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LearnedPattern {
  /** Unique identifier */
  id: string

  /** The pattern string or regex source */
  pattern: string

  /** Type of pattern */
  type: PatternType

  /** Category for grouping */
  category: PatternCategory

  /** Human-readable description */
  description: string

  /** How many times this pattern was encountered */
  occurrenceCount: number

  /** How many times this caused a QA failure */
  failureCount: number

  /** How many times cleanup succeeded on retry */
  retrySuccessCount: number

  /** Example matches from documents */
  examples: string[]

  /** Source documents where this was found */
  sourceDocuments: string[]

  /** Whether this pattern has been promoted to a rule */
  promotedToRule: boolean

  /** Confidence in this pattern being garbage (0-1) */
  confidence: number

  /** First seen timestamp */
  firstSeen: string

  /** Last seen timestamp */
  lastSeen: string

  /** Tags for categorization */
  tags: string[]
}

export type PatternType =
  | 'barcode' // Scanner barcode artifacts
  | 'control_char' // Control characters
  | 'spaced_fragment' // Spaced Turkish fragments
  | 'garbage_line' // Full garbage lines
  | 'high_ascii' // High ASCII sequences
  | 'special_cluster' // Special character clusters
  | 'repetitive' // Repetitive character patterns
  | 'unknown' // Unclassified

export type PatternCategory =
  | 'scanner_artifact' // From physical scanner
  | 'ocr_error' // OCR processing error
  | 'encoding_issue' // Character encoding problem
  | 'document_noise' // Noise from original document
  | 'watermark' // Watermark remnants
  | 'other' // Other/unknown

export interface PatternMatchResult {
  pattern: LearnedPattern
  matchedText: string
  position: number
  context: string // Surrounding text for context
}

export interface PatternStats {
  totalPatterns: number
  byType: Record<PatternType, number>
  byCategory: Record<PatternCategory, number>
  topPatterns: LearnedPattern[]
  promotedCount: number
  averageConfidence: number
  totalOccurrences: number
  totalFailures: number
}

export interface PatternStoreConfig {
  /** Maximum patterns to store */
  maxPatterns: number

  /** Minimum occurrences before pattern is considered significant */
  minOccurrencesForSignificance: number

  /** Minimum confidence to promote to rule */
  minConfidenceForPromotion: number

  /** Maximum examples to store per pattern */
  maxExamplesPerPattern: number

  /** Maximum source documents to track per pattern */
  maxSourceDocsPerPattern: number

  /** Auto-prune low-value patterns */
  autoPrune: boolean

  /** Prune threshold (min occurrences to keep) */
  pruneThreshold: number
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: PatternStoreConfig = {
  maxPatterns: 1000,
  minOccurrencesForSignificance: 3,
  minConfidenceForPromotion: 0.85,
  maxExamplesPerPattern: 5,
  maxSourceDocsPerPattern: 10,
  autoPrune: true,
  pruneThreshold: 2,
}

// Pattern type detection rules
const PATTERN_TYPE_RULES: Array<{
  type: PatternType
  test: (pattern: string) => boolean
  category: PatternCategory
}> = [
  {
    type: 'barcode',
    test: (p) => /B\s*[\^]+\s*B/i.test(p) || /a!{3,}a/i.test(p),
    category: 'scanner_artifact',
  },
  {
    type: 'control_char',
    // eslint-disable-next-line no-control-regex
    test: (p) => /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(p),
    category: 'encoding_issue',
  },
  {
    type: 'spaced_fragment',
    test: (p) => /^[A-ZÇĞİÖŞÜ]\s+[A-ZÇĞİÖŞÜ]\s+[A-ZÇĞİÖŞÜ]/u.test(p),
    category: 'ocr_error',
  },
  {
    type: 'high_ascii',
    test: (p) => /[\x80-\xff]{3,}/.test(p) || /[\uFFFD]{2,}/.test(p),
    category: 'encoding_issue',
  },
  {
    type: 'special_cluster',
    test: (p) => /[<>[\]{}|\\^]{4,}/.test(p),
    category: 'scanner_artifact',
  },
  {
    type: 'repetitive',
    test: (p) => /(.)\1{4,}/.test(p) || /(.{2,})\1{3,}/.test(p),
    category: 'document_noise',
  },
]

// ============================================================================
// PATTERN STORE CLASS
// ============================================================================

export class PatternStore {
  private patterns: Map<string, LearnedPattern> = new Map()
  private config: PatternStoreConfig

  constructor(config: Partial<PatternStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // -------------------------------------------------------------------------
  // PATTERN RECORDING
  // -------------------------------------------------------------------------

  /**
   * Record a pattern encountered during OCR cleanup
   */
  recordPattern(
    patternText: string,
    options: {
      documentId?: string
      causedFailure?: boolean
      retriedSuccessfully?: boolean
      manualType?: PatternType
      manualCategory?: PatternCategory
      tags?: string[]
    } = {}
  ): LearnedPattern {
    // Normalize pattern
    const normalizedPattern = this.normalizePattern(patternText)
    const patternId = this.generatePatternId(normalizedPattern)

    // Check if pattern exists
    let pattern = this.patterns.get(patternId)

    if (pattern) {
      // Update existing pattern
      pattern.occurrenceCount++
      pattern.lastSeen = new Date().toISOString()

      if (options.causedFailure) {
        pattern.failureCount++
      }

      if (options.retriedSuccessfully) {
        pattern.retrySuccessCount++
      }

      // Add example if unique and under limit
      if (
        pattern.examples.length < this.config.maxExamplesPerPattern &&
        !pattern.examples.includes(patternText)
      ) {
        pattern.examples.push(patternText)
      }

      // Add source document if unique and under limit
      if (
        options.documentId &&
        pattern.sourceDocuments.length < this.config.maxSourceDocsPerPattern &&
        !pattern.sourceDocuments.includes(options.documentId)
      ) {
        pattern.sourceDocuments.push(options.documentId)
      }

      // Update confidence based on failure rate
      pattern.confidence = this.calculateConfidence(pattern)
    } else {
      // Create new pattern
      const { type, category } = this.classifyPattern(
        normalizedPattern,
        options.manualType,
        options.manualCategory
      )

      pattern = {
        id: patternId,
        pattern: normalizedPattern,
        type,
        category,
        description: this.generateDescription(normalizedPattern, type),
        occurrenceCount: 1,
        failureCount: options.causedFailure ? 1 : 0,
        retrySuccessCount: options.retriedSuccessfully ? 1 : 0,
        examples: [patternText],
        sourceDocuments: options.documentId ? [options.documentId] : [],
        promotedToRule: false,
        confidence: options.causedFailure ? 0.5 : 0.3,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        tags: options.tags || [],
      }

      this.patterns.set(patternId, pattern)

      // Auto-prune if over limit
      if (this.config.autoPrune && this.patterns.size > this.config.maxPatterns) {
        this.prunePatterns()
      }
    }

    return pattern
  }

  /**
   * Record multiple patterns from a text
   */
  recordPatternsFromText(
    text: string,
    documentId?: string,
    causedFailure: boolean = false
  ): LearnedPattern[] {
    const foundPatterns: LearnedPattern[] = []

    // Check for barcode patterns
    const barcodeMatches = text.match(/B\s*[\^]+\s*B/gi) || []
    const aExclamMatches = text.match(/a!{3,}a[!aA]*/gi) || []

    for (const match of [...barcodeMatches, ...aExclamMatches]) {
      foundPatterns.push(
        this.recordPattern(match, {
          documentId,
          causedFailure,
        })
      )
    }

    // Check for spaced fragments
    const spacedFragments = this.findSpacedFragments(text)
    for (const fragment of spacedFragments) {
      foundPatterns.push(
        this.recordPattern(fragment, {
          documentId,
          causedFailure,
          manualType: 'spaced_fragment',
        })
      )
    }

    // Check for high-ASCII sequences
    const highAsciiMatches = text.match(/[\x80-\xff]{3,}/g) || []
    for (const match of highAsciiMatches) {
      foundPatterns.push(
        this.recordPattern(match, {
          documentId,
          causedFailure,
          manualType: 'high_ascii',
        })
      )
    }

    // Check for repetitive patterns
    const repetitiveMatches = text.match(/(.)\1{5,}/g) || []
    for (const match of repetitiveMatches) {
      foundPatterns.push(
        this.recordPattern(match, {
          documentId,
          causedFailure,
          manualType: 'repetitive',
        })
      )
    }

    return foundPatterns
  }

  // -------------------------------------------------------------------------
  // PATTERN RETRIEVAL
  // -------------------------------------------------------------------------

  /**
   * Get a pattern by ID
   */
  getPattern(patternId: string): LearnedPattern | undefined {
    return this.patterns.get(patternId)
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values())
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: PatternType): LearnedPattern[] {
    return this.getAllPatterns().filter(p => p.type === type)
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: PatternCategory): LearnedPattern[] {
    return this.getAllPatterns().filter(p => p.category === category)
  }

  /**
   * Get significant patterns (high occurrence/confidence)
   */
  getSignificantPatterns(): LearnedPattern[] {
    return this.getAllPatterns().filter(
      p =>
        p.occurrenceCount >= this.config.minOccurrencesForSignificance ||
        p.confidence >= this.config.minConfidenceForPromotion
    )
  }

  /**
   * Get patterns ready for promotion to rules
   */
  getPatternsForPromotion(): LearnedPattern[] {
    return this.getAllPatterns().filter(
      p =>
        !p.promotedToRule &&
        p.confidence >= this.config.minConfidenceForPromotion &&
        p.occurrenceCount >= this.config.minOccurrencesForSignificance
    )
  }

  /**
   * Get top N patterns by occurrence
   */
  getTopPatterns(n: number = 10): LearnedPattern[] {
    return this.getAllPatterns()
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, n)
  }

  /**
   * Get top N patterns by failure rate
   */
  getTopFailingPatterns(n: number = 10): LearnedPattern[] {
    return this.getAllPatterns()
      .filter(p => p.occurrenceCount >= 2)
      .sort((a, b) => {
        const rateA = a.failureCount / a.occurrenceCount
        const rateB = b.failureCount / b.occurrenceCount
        return rateB - rateA
      })
      .slice(0, n)
  }

  // -------------------------------------------------------------------------
  // PATTERN MATCHING
  // -------------------------------------------------------------------------

  /**
   * Check text against known patterns
   */
  findKnownPatterns(text: string): PatternMatchResult[] {
    const results: PatternMatchResult[] = []

    for (const pattern of this.patterns.values()) {
      // Create regex from pattern
      try {
        const regex = new RegExp(this.escapeRegex(pattern.pattern), 'gi')
        let match

        while ((match = regex.exec(text)) !== null) {
          results.push({
            pattern,
            matchedText: match[0],
            position: match.index,
            context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
          })
        }
      } catch {
        // Pattern might not be valid regex, try literal match
        const index = text.indexOf(pattern.pattern)
        if (index !== -1) {
          results.push({
            pattern,
            matchedText: pattern.pattern,
            position: index,
            context: text.slice(Math.max(0, index - 20), index + pattern.pattern.length + 20),
          })
        }
      }
    }

    return results
  }

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  /**
   * Get comprehensive pattern statistics
   */
  getStats(): PatternStats {
    const patterns = this.getAllPatterns()

    const byType: Record<PatternType, number> = {
      barcode: 0,
      control_char: 0,
      spaced_fragment: 0,
      garbage_line: 0,
      high_ascii: 0,
      special_cluster: 0,
      repetitive: 0,
      unknown: 0,
    }

    const byCategory: Record<PatternCategory, number> = {
      scanner_artifact: 0,
      ocr_error: 0,
      encoding_issue: 0,
      document_noise: 0,
      watermark: 0,
      other: 0,
    }

    let totalOccurrences = 0
    let totalFailures = 0
    let totalConfidence = 0
    let promotedCount = 0

    for (const p of patterns) {
      byType[p.type]++
      byCategory[p.category]++
      totalOccurrences += p.occurrenceCount
      totalFailures += p.failureCount
      totalConfidence += p.confidence
      if (p.promotedToRule) promotedCount++
    }

    return {
      totalPatterns: patterns.length,
      byType,
      byCategory,
      topPatterns: this.getTopPatterns(5),
      promotedCount,
      averageConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
      totalOccurrences,
      totalFailures,
    }
  }

  // -------------------------------------------------------------------------
  // PATTERN MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Mark a pattern as promoted to rule
   */
  markAsPromoted(patternId: string): boolean {
    const pattern = this.patterns.get(patternId)
    if (pattern) {
      pattern.promotedToRule = true
      return true
    }
    return false
  }

  /**
   * Add tags to a pattern
   */
  addTags(patternId: string, tags: string[]): boolean {
    const pattern = this.patterns.get(patternId)
    if (pattern) {
      pattern.tags = [...new Set([...pattern.tags, ...tags])]
      return true
    }
    return false
  }

  /**
   * Delete a pattern
   */
  deletePattern(patternId: string): boolean {
    return this.patterns.delete(patternId)
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear()
  }

  /**
   * Prune low-value patterns
   */
  prunePatterns(): number {
    let pruned = 0
    const threshold = this.config.pruneThreshold

    for (const [id, pattern] of this.patterns) {
      // Don't prune promoted or high-confidence patterns
      if (pattern.promotedToRule || pattern.confidence >= 0.8) {
        continue
      }

      // Prune patterns with low occurrence and low confidence
      if (pattern.occurrenceCount < threshold && pattern.confidence < 0.5) {
        this.patterns.delete(id)
        pruned++
      }
    }

    return pruned
  }

  // -------------------------------------------------------------------------
  // IMPORT/EXPORT
  // -------------------------------------------------------------------------

  /**
   * Export patterns to JSON
   */
  export(): string {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        config: this.config,
        patterns: this.getAllPatterns(),
      },
      null,
      2
    )
  }

  /**
   * Import patterns from JSON
   */
  import(json: string, merge: boolean = true): number {
    const data = JSON.parse(json)

    if (!data.patterns || !Array.isArray(data.patterns)) {
      throw new Error('Invalid pattern export format')
    }

    if (!merge) {
      this.patterns.clear()
    }

    let imported = 0
    for (const pattern of data.patterns as LearnedPattern[]) {
      if (pattern.id && pattern.pattern) {
        this.patterns.set(pattern.id, pattern)
        imported++
      }
    }

    return imported
  }

  /**
   * Export patterns as regex rules for sanitizer
   */
  exportAsRegexRules(): string[] {
    return this.getPatternsForPromotion().map(p => this.escapeRegex(p.pattern))
  }

  // -------------------------------------------------------------------------
  // PRIVATE HELPERS
  // -------------------------------------------------------------------------

  private normalizePattern(pattern: string): string {
    // Normalize whitespace and trim
    return pattern.replace(/\s+/g, ' ').trim()
  }

  private generatePatternId(pattern: string): string {
    // Simple hash function for ID generation
    let hash = 0
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `pattern_${Math.abs(hash).toString(16)}`
  }

  private classifyPattern(
    pattern: string,
    manualType?: PatternType,
    manualCategory?: PatternCategory
  ): { type: PatternType; category: PatternCategory } {
    if (manualType && manualCategory) {
      return { type: manualType, category: manualCategory }
    }

    for (const rule of PATTERN_TYPE_RULES) {
      if (rule.test(pattern)) {
        return {
          type: manualType || rule.type,
          category: manualCategory || rule.category,
        }
      }
    }

    return {
      type: manualType || 'unknown',
      category: manualCategory || 'other',
    }
  }

  private generateDescription(pattern: string, type: PatternType): string {
    const descriptions: Record<PatternType, string> = {
      barcode: 'Barcode/scanner artifact pattern',
      control_char: 'Control character sequence',
      spaced_fragment: 'Spaced Turkish text fragment',
      garbage_line: 'Full garbage line pattern',
      high_ascii: 'High-ASCII character sequence',
      special_cluster: 'Special character cluster',
      repetitive: 'Repetitive character pattern',
      unknown: 'Unclassified pattern',
    }

    return `${descriptions[type]}: "${pattern.slice(0, 30)}${pattern.length > 30 ? '...' : ''}"`
  }

  private calculateConfidence(pattern: LearnedPattern): number {
    // Base confidence on failure rate and occurrence count
    if (pattern.occurrenceCount < 2) {
      return pattern.failureCount > 0 ? 0.5 : 0.3
    }

    const failureRate = pattern.failureCount / pattern.occurrenceCount
    const retrySuccessRate =
      pattern.failureCount > 0 ? pattern.retrySuccessCount / pattern.failureCount : 0

    // Higher failure rate = higher confidence it's garbage
    // If retry succeeds, that confirms it's garbage
    let confidence = failureRate * 0.6 + retrySuccessRate * 0.3

    // Boost for high occurrence
    if (pattern.occurrenceCount >= 10) {
      confidence += 0.1
    }

    return Math.min(1, confidence)
  }

  private findSpacedFragments(text: string): string[] {
    const fragments: string[] = []

    // Match sequences of single/double uppercase letters separated by spaces
    // Unicode-safe for Turkish characters
    const regex = /(?:[A-ZÇĞİÖŞÜ]{1,2}\s+){3,}[A-ZÇĞİÖŞÜ]{1,2}/gu
    const matches = text.match(regex) || []

    for (const match of matches) {
      if (match.length >= 5) {
        fragments.push(match)
      }
    }

    return fragments
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

// Global pattern store instance
let globalPatternStore: PatternStore | null = null

/**
 * Get the global pattern store instance
 */
export function getPatternStore(config?: Partial<PatternStoreConfig>): PatternStore {
  if (!globalPatternStore) {
    globalPatternStore = new PatternStore(config)
  }
  return globalPatternStore
}

/**
 * Reset the global pattern store (mainly for testing)
 */
export function resetPatternStore(): void {
  globalPatternStore = null
}
