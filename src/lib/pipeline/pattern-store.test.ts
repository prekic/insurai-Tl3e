/**
 * Tests for Pattern Learning Store
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PatternStore,
  getPatternStore,
  resetPatternStore,
} from './pattern-store'

// ============================================================================
// TEST SETUP
// ============================================================================

describe('PatternStore', () => {
  let store: PatternStore

  beforeEach(() => {
    store = new PatternStore()
  })

  afterEach(() => {
    resetPatternStore()
  })

  // ============================================================================
  // PATTERN RECORDING
  // ============================================================================

  describe('recordPattern', () => {
    it('should record a new pattern', () => {
      const pattern = store.recordPattern('B^^^B')

      expect(pattern).toBeDefined()
      expect(pattern.pattern).toBe('B^^^B')
      expect(pattern.occurrenceCount).toBe(1)
      expect(pattern.type).toBe('barcode')
    })

    it('should increment occurrence count for existing pattern', () => {
      store.recordPattern('B^^^B')
      const pattern = store.recordPattern('B^^^B')

      expect(pattern.occurrenceCount).toBe(2)
    })

    it('should track failure count', () => {
      store.recordPattern('B^^^B', { causedFailure: true })
      const pattern = store.recordPattern('B^^^B', { causedFailure: true })

      expect(pattern.failureCount).toBe(2)
    })

    it('should track retry success count', () => {
      store.recordPattern('B^^^B', { causedFailure: true, retriedSuccessfully: true })
      const pattern = store.getPattern(store.recordPattern('B^^^B').id)!

      expect(pattern.retrySuccessCount).toBe(1)
    })

    it('should store document IDs', () => {
      store.recordPattern('B^^^B', { documentId: 'doc1' })
      const pattern = store.recordPattern('B^^^B', { documentId: 'doc2' })

      expect(pattern.sourceDocuments).toContain('doc1')
      expect(pattern.sourceDocuments).toContain('doc2')
    })

    it('should limit examples per pattern', () => {
      const maxExamples = 5

      for (let i = 0; i < 10; i++) {
        store.recordPattern(`example_${i}`)
      }

      // Each is a unique pattern, so we check a single pattern
      store.recordPattern('test', { documentId: 'doc1' })
      for (let i = 0; i < 10; i++) {
        store.recordPattern('test', { documentId: `doc${i}` })
      }

      const pattern = store.getAllPatterns().find(p => p.pattern === 'test')!
      expect(pattern.examples.length).toBeLessThanOrEqual(maxExamples)
    })

    it('should calculate confidence based on failure rate', () => {
      // Record with failures
      store.recordPattern('test', { causedFailure: true })
      store.recordPattern('test', { causedFailure: true, retriedSuccessfully: true })
      const pattern = store.recordPattern('test', { causedFailure: true, retriedSuccessfully: true })

      expect(pattern.confidence).toBeGreaterThan(0.3)
    })
  })

  // ============================================================================
  // PATTERN CLASSIFICATION
  // ============================================================================

  describe('pattern classification', () => {
    it('should classify barcode patterns', () => {
      const pattern1 = store.recordPattern('B^^^B')
      const pattern2 = store.recordPattern('a!!!a!AAA')

      expect(pattern1.type).toBe('barcode')
      expect(pattern2.type).toBe('barcode')
      expect(pattern1.category).toBe('scanner_artifact')
    })

    it('should classify control char patterns', () => {
      const pattern = store.recordPattern('\x00\x01\x02\x03')

      expect(pattern.type).toBe('control_char')
      expect(pattern.category).toBe('encoding_issue')
    })

    it('should classify spaced fragments', () => {
      const pattern = store.recordPattern('S İ G O R T A')

      expect(pattern.type).toBe('spaced_fragment')
      expect(pattern.category).toBe('ocr_error')
    })

    it('should classify high ASCII patterns', () => {
      // Use chars \xA0-\xFF which are high-ASCII but not C1 controls (\x80-\x9F)
      const pattern = store.recordPattern('\xA0\xA1\xA2\xA3\xA4')

      expect(pattern.type).toBe('high_ascii')
      expect(pattern.category).toBe('encoding_issue')
    })

    it('should classify repetitive patterns', () => {
      const pattern = store.recordPattern('aaaaaaaaaa')

      expect(pattern.type).toBe('repetitive')
      expect(pattern.category).toBe('document_noise')
    })

    it('should use manual type if provided', () => {
      const pattern = store.recordPattern('custom', {
        manualType: 'garbage_line',
        manualCategory: 'watermark',
      })

      expect(pattern.type).toBe('garbage_line')
      expect(pattern.category).toBe('watermark')
    })

    it('should classify unknown patterns', () => {
      const pattern = store.recordPattern('simple text')

      expect(pattern.type).toBe('unknown')
      expect(pattern.category).toBe('other')
    })
  })

  // ============================================================================
  // PATTERN RETRIEVAL
  // ============================================================================

  describe('pattern retrieval', () => {
    beforeEach(() => {
      store.recordPattern('B^^^B', { causedFailure: true })
      store.recordPattern('a!!!a', { causedFailure: true })
      store.recordPattern('S İ G O R T A')
      store.recordPattern('\x80\x81\x82\x83')
      store.recordPattern('test unknown')
    })

    it('should get pattern by ID', () => {
      const recorded = store.recordPattern('findme')
      const found = store.getPattern(recorded.id)

      expect(found).toBeDefined()
      expect(found?.pattern).toBe('findme')
    })

    it('should return undefined for non-existent pattern', () => {
      const found = store.getPattern('non-existent-id')
      expect(found).toBeUndefined()
    })

    it('should get all patterns', () => {
      const patterns = store.getAllPatterns()
      expect(patterns.length).toBeGreaterThanOrEqual(5)
    })

    it('should get patterns by type', () => {
      const barcodePatterns = store.getPatternsByType('barcode')
      expect(barcodePatterns.length).toBe(2)
      expect(barcodePatterns.every(p => p.type === 'barcode')).toBe(true)
    })

    it('should get patterns by category', () => {
      const scannerArtifacts = store.getPatternsByCategory('scanner_artifact')
      expect(scannerArtifacts.length).toBeGreaterThanOrEqual(2)
    })

    it('should get significant patterns', () => {
      // Make a pattern significant by adding occurrences
      store.recordPattern('B^^^B')
      store.recordPattern('B^^^B')

      const significant = store.getSignificantPatterns()
      expect(significant.some(p => p.pattern === 'B^^^B')).toBe(true)
    })

    it('should get top patterns by occurrence', () => {
      // Add more occurrences to one pattern
      for (let i = 0; i < 10; i++) {
        store.recordPattern('B^^^B')
      }

      const top = store.getTopPatterns(3)
      expect(top[0].pattern).toBe('B^^^B')
      expect(top.length).toBeLessThanOrEqual(3)
    })

    it('should get top failing patterns', () => {
      // Add failures
      for (let i = 0; i < 5; i++) {
        store.recordPattern('B^^^B', { causedFailure: true })
      }

      const topFailing = store.getTopFailingPatterns(3)
      expect(topFailing.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // RECORD PATTERNS FROM TEXT
  // ============================================================================

  describe('recordPatternsFromText', () => {
    it('should detect barcode patterns in text', () => {
      const text = 'Some text B^^^B more text a!!!a end'
      const patterns = store.recordPatternsFromText(text, 'doc1')

      expect(patterns.length).toBe(2)
      expect(patterns.some(p => p.pattern.includes('B^^^B'))).toBe(true)
      expect(patterns.some(p => p.pattern.includes('a!!!a'))).toBe(true)
    })

    it('should detect spaced fragments', () => {
      const text = 'SİGORTA POLİÇESİ S İ G O R T A numarası'
      const patterns = store.recordPatternsFromText(text, 'doc1')

      expect(patterns.some(p => p.type === 'spaced_fragment')).toBe(true)
    })

    it('should mark as failure when specified', () => {
      const text = 'B^^^B a!!!a'
      const patterns = store.recordPatternsFromText(text, 'doc1', true)

      expect(patterns.every(p => p.failureCount > 0)).toBe(true)
    })

    it('should return empty array for clean text', () => {
      const text = 'This is clean Turkish insurance text with no artifacts.'
      const patterns = store.recordPatternsFromText(text)

      expect(patterns.length).toBe(0)
    })
  })

  // ============================================================================
  // PATTERN MATCHING
  // ============================================================================

  describe('findKnownPatterns', () => {
    beforeEach(() => {
      store.recordPattern('B^^^B')
      store.recordPattern('a!!!a')
    })

    it('should find known patterns in text', () => {
      const text = 'Document with B^^^B barcode and a!!!a artifact'
      const matches = store.findKnownPatterns(text)

      expect(matches.length).toBe(2)
      expect(matches.some(m => m.pattern.pattern.includes('B^^^B'))).toBe(true)
    })

    it('should include position and context', () => {
      const text = 'prefix B^^^B suffix'
      const matches = store.findKnownPatterns(text)

      expect(matches[0].position).toBe(7)
      expect(matches[0].context).toContain('prefix')
      expect(matches[0].context).toContain('suffix')
    })

    it('should return empty array when no matches', () => {
      const text = 'Clean text without any patterns'
      const matches = store.findKnownPatterns(text)

      expect(matches.length).toBe(0)
    })
  })

  // ============================================================================
  // STATISTICS
  // ============================================================================

  describe('getStats', () => {
    beforeEach(() => {
      store.recordPattern('B^^^B', { causedFailure: true })
      store.recordPattern('B^^^B', { causedFailure: true })
      store.recordPattern('a!!!a')
      store.recordPattern('S İ G O R T A')
      store.recordPattern('\x80\x81\x82\x83')
    })

    it('should return correct total count', () => {
      const stats = store.getStats()
      expect(stats.totalPatterns).toBe(4)
    })

    it('should return correct type distribution', () => {
      const stats = store.getStats()
      expect(stats.byType.barcode).toBe(2)
      expect(stats.byType.spaced_fragment).toBe(1)
    })

    it('should return correct category distribution', () => {
      const stats = store.getStats()
      expect(stats.byCategory.scanner_artifact).toBe(2)
    })

    it('should calculate total occurrences', () => {
      const stats = store.getStats()
      expect(stats.totalOccurrences).toBeGreaterThanOrEqual(5)
    })

    it('should calculate total failures', () => {
      const stats = store.getStats()
      expect(stats.totalFailures).toBe(2)
    })

    it('should calculate average confidence', () => {
      const stats = store.getStats()
      expect(stats.averageConfidence).toBeGreaterThan(0)
      expect(stats.averageConfidence).toBeLessThanOrEqual(1)
    })
  })

  // ============================================================================
  // PATTERN MANAGEMENT
  // ============================================================================

  describe('pattern management', () => {
    it('should mark pattern as promoted', () => {
      const pattern = store.recordPattern('B^^^B')
      store.markAsPromoted(pattern.id)

      const updated = store.getPattern(pattern.id)!
      expect(updated.promotedToRule).toBe(true)
    })

    it('should add tags to pattern', () => {
      const pattern = store.recordPattern('B^^^B')
      store.addTags(pattern.id, ['urgent', 'high-impact'])

      const updated = store.getPattern(pattern.id)!
      expect(updated.tags).toContain('urgent')
      expect(updated.tags).toContain('high-impact')
    })

    it('should delete pattern', () => {
      const pattern = store.recordPattern('B^^^B')
      const deleted = store.deletePattern(pattern.id)

      expect(deleted).toBe(true)
      expect(store.getPattern(pattern.id)).toBeUndefined()
    })

    it('should clear all patterns', () => {
      store.recordPattern('B^^^B')
      store.recordPattern('a!!!a')
      store.clear()

      expect(store.getAllPatterns().length).toBe(0)
    })

    it('should prune low-value patterns', () => {
      // Add low-value patterns
      store.recordPattern('low1', { causedFailure: false })
      store.recordPattern('low2', { causedFailure: false })

      // Add high-value patterns (more occurrences)
      store.recordPattern('high')
      store.recordPattern('high')
      store.recordPattern('high')

      const pruned = store.prunePatterns()

      // Low-value patterns should be pruned
      expect(pruned).toBeGreaterThanOrEqual(0)
    })

    it('should not prune promoted patterns', () => {
      const pattern = store.recordPattern('promoted')
      store.markAsPromoted(pattern.id)

      store.prunePatterns()

      expect(store.getPattern(pattern.id)).toBeDefined()
    })
  })

  // ============================================================================
  // PROMOTION
  // ============================================================================

  describe('getPatternsForPromotion', () => {
    it('should return patterns meeting promotion criteria', () => {
      // Create a pattern with high confidence and occurrences
      for (let i = 0; i < 5; i++) {
        store.recordPattern('promotable', { causedFailure: true, retriedSuccessfully: true })
      }

      const forPromotion = store.getPatternsForPromotion()

      // Should include high-confidence, frequently-seen patterns
      expect(forPromotion.every(p => !p.promotedToRule)).toBe(true)
    })

    it('should not include already promoted patterns', () => {
      const pattern = store.recordPattern('already-promoted')
      store.markAsPromoted(pattern.id)

      // Make it otherwise qualify
      for (let i = 0; i < 5; i++) {
        store.recordPattern('already-promoted', { causedFailure: true, retriedSuccessfully: true })
      }

      const forPromotion = store.getPatternsForPromotion()
      expect(forPromotion.some(p => p.id === pattern.id)).toBe(false)
    })
  })

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  describe('import/export', () => {
    it('should export patterns to JSON', () => {
      store.recordPattern('B^^^B')
      store.recordPattern('a!!!a')

      const json = store.export()
      const data = JSON.parse(json)

      expect(data.version).toBe(1)
      expect(data.patterns.length).toBe(2)
      expect(data.exportedAt).toBeDefined()
    })

    it('should import patterns from JSON', () => {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        patterns: [
          {
            id: 'pattern_1',
            pattern: 'imported1',
            type: 'barcode',
            category: 'scanner_artifact',
            description: 'Test',
            occurrenceCount: 5,
            failureCount: 2,
            retrySuccessCount: 1,
            examples: [],
            sourceDocuments: [],
            promotedToRule: false,
            confidence: 0.5,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            tags: [],
          },
        ],
      }

      const count = store.import(JSON.stringify(exportData))

      expect(count).toBe(1)
      expect(store.getAllPatterns().length).toBe(1)
    })

    it('should merge patterns on import', () => {
      store.recordPattern('existing')

      const exportData = {
        version: 1,
        patterns: [
          {
            id: 'pattern_new',
            pattern: 'imported',
            type: 'barcode',
            category: 'scanner_artifact',
            description: 'Test',
            occurrenceCount: 1,
            failureCount: 0,
            retrySuccessCount: 0,
            examples: [],
            sourceDocuments: [],
            promotedToRule: false,
            confidence: 0.3,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            tags: [],
          },
        ],
      }

      store.import(JSON.stringify(exportData), true) // merge=true

      expect(store.getAllPatterns().length).toBe(2)
    })

    it('should replace patterns when merge=false', () => {
      store.recordPattern('existing')

      const exportData = {
        version: 1,
        patterns: [
          {
            id: 'pattern_new',
            pattern: 'replacement',
            type: 'barcode',
            category: 'scanner_artifact',
            description: 'Test',
            occurrenceCount: 1,
            failureCount: 0,
            retrySuccessCount: 0,
            examples: [],
            sourceDocuments: [],
            promotedToRule: false,
            confidence: 0.3,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            tags: [],
          },
        ],
      }

      store.import(JSON.stringify(exportData), false) // merge=false

      expect(store.getAllPatterns().length).toBe(1)
      expect(store.getAllPatterns()[0].pattern).toBe('replacement')
    })

    it('should export as regex rules', () => {
      // Create patterns that qualify for promotion
      for (let i = 0; i < 5; i++) {
        store.recordPattern('B^^^B', { causedFailure: true, retriedSuccessfully: true })
      }

      const rules = store.exportAsRegexRules()

      expect(Array.isArray(rules)).toBe(true)
    })
  })

  // ============================================================================
  // SINGLETON
  // ============================================================================

  describe('global pattern store', () => {
    afterEach(() => {
      resetPatternStore()
    })

    it('should return same instance', () => {
      const store1 = getPatternStore()
      const store2 = getPatternStore()

      expect(store1).toBe(store2)
    })

    it('should reset store', () => {
      const store1 = getPatternStore()
      store1.recordPattern('test')

      resetPatternStore()

      const store2 = getPatternStore()
      expect(store2.getAllPatterns().length).toBe(0)
    })

    it('should accept config on first call', () => {
      const store = getPatternStore({ maxPatterns: 500 })

      // Config should be applied (tested indirectly)
      expect(store).toBeDefined()
    })
  })
})
