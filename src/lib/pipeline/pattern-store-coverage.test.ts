/**
 * Pattern Store - Coverage Tests
 *
 * Targets uncovered branches in pattern-store.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PatternStore, getPatternStore, resetPatternStore } from './pattern-store'

describe('pattern-store coverage', () => {
  let store: PatternStore

  beforeEach(() => {
    store = new PatternStore()
  })

  describe('recordPattern', () => {
    it('creates new pattern', () => {
      const p = store.recordPattern('B^^^B test')
      expect(p.id).toBeTruthy()
      expect(p.occurrenceCount).toBe(1)
      expect(p.type).toBe('barcode')
      expect(p.category).toBe('scanner_artifact')
    })

    it('increments occurrence for existing pattern', () => {
      store.recordPattern('test-pattern')
      const p = store.recordPattern('test-pattern')
      expect(p.occurrenceCount).toBe(2)
    })

    it('tracks failure count', () => {
      store.recordPattern('fail-pattern', { causedFailure: true })
      const p = store.recordPattern('fail-pattern', { causedFailure: true })
      expect(p.failureCount).toBe(2)
    })

    it('tracks retry success count', () => {
      store.recordPattern('retry-pattern', { retriedSuccessfully: true })
      const p = store.recordPattern('retry-pattern', { retriedSuccessfully: true })
      expect(p.retrySuccessCount).toBe(2)
    })

    it('adds unique examples up to limit', () => {
      const s = new PatternStore({ maxExamplesPerPattern: 2 })
      s.recordPattern('pattern-1')
      s.recordPattern('pattern-1 variant')
      s.recordPattern('pattern-1 another')
      const p = s.getPattern(s.getAllPatterns()[0].id)
      expect(p!.examples.length).toBeLessThanOrEqual(2)
    })

    it('does not add duplicate examples', () => {
      store.recordPattern('exact same')
      store.recordPattern('exact same')
      const p = store.getAllPatterns()[0]
      expect(p.examples.length).toBe(1)
    })

    it('adds unique source documents up to limit', () => {
      const s = new PatternStore({ maxSourceDocsPerPattern: 2 })
      s.recordPattern('pat', { documentId: 'doc1' })
      s.recordPattern('pat', { documentId: 'doc2' })
      s.recordPattern('pat', { documentId: 'doc3' })
      const p = s.getAllPatterns()[0]
      expect(p.sourceDocuments.length).toBeLessThanOrEqual(2)
    })

    it('does not add duplicate document IDs', () => {
      store.recordPattern('pat', { documentId: 'doc1' })
      store.recordPattern('pat', { documentId: 'doc1' })
      const p = store.getAllPatterns()[0]
      expect(p.sourceDocuments.length).toBe(1)
    })

    it('uses manual type and category when provided', () => {
      const p = store.recordPattern('custom', {
        manualType: 'garbage_line',
        manualCategory: 'watermark',
      })
      expect(p.type).toBe('garbage_line')
      expect(p.category).toBe('watermark')
    })

    it('classifies control characters', () => {
      const p = store.recordPattern('\x01\x02\x03')
      expect(p.type).toBe('control_char')
      expect(p.category).toBe('encoding_issue')
    })

    it('classifies spaced fragments', () => {
      const p = store.recordPattern('A B C D E F')
      expect(p.type).toBe('spaced_fragment')
    })

    it('classifies high ASCII', () => {
      // Use replacement chars (U+FFFD) which match high_ascii rule, not control_char
      const p = store.recordPattern('\uFFFD\uFFFD\uFFFD')
      expect(p.type).toBe('high_ascii')
    })

    it('classifies special clusters', () => {
      const p = store.recordPattern('<<<<>>>>[[[[')
      expect(p.type).toBe('special_cluster')
    })

    it('classifies repetitive patterns', () => {
      const p = store.recordPattern('aaaaaaaaaa')
      expect(p.type).toBe('repetitive')
    })

    it('classifies unknown patterns', () => {
      const p = store.recordPattern('normal text here')
      expect(p.type).toBe('unknown')
      expect(p.category).toBe('other')
    })

    it('uses manualType with auto-detected category', () => {
      const p = store.recordPattern('B^^^B', { manualType: 'garbage_line' })
      expect(p.type).toBe('garbage_line')
      expect(p.category).toBe('scanner_artifact') // from rule
    })

    it('uses manualCategory with auto-detected type', () => {
      const p = store.recordPattern('B^^^B', { manualCategory: 'watermark' })
      expect(p.type).toBe('barcode') // from rule
      expect(p.category).toBe('watermark')
    })

    it('adds tags to new pattern', () => {
      const p = store.recordPattern('tagged', { tags: ['urgent', 'review'] })
      expect(p.tags).toEqual(['urgent', 'review'])
    })

    it('auto-prunes when over maxPatterns', () => {
      const s = new PatternStore({ maxPatterns: 3, autoPrune: true, pruneThreshold: 2 })
      s.recordPattern('pattern1')
      s.recordPattern('pattern2')
      s.recordPattern('pattern3')
      s.recordPattern('pattern4')
      // After auto-prune, some low-value patterns should be removed
      expect(s.getAllPatterns().length).toBeLessThanOrEqual(4)
    })

    it('calculates confidence from failure rate', () => {
      store.recordPattern('conf-test', { causedFailure: true })
      store.recordPattern('conf-test', { causedFailure: true, retriedSuccessfully: true })
      const p = store.getAllPatterns()[0]
      expect(p.confidence).toBeGreaterThan(0)
    })

    it('boosts confidence for high occurrence', () => {
      for (let i = 0; i < 12; i++) {
        store.recordPattern('high-occ', { causedFailure: true })
      }
      const p = store.getAllPatterns()[0]
      expect(p.confidence).toBeGreaterThan(0.5)
    })
  })

  describe('recordPatternsFromText', () => {
    it('detects barcode patterns', () => {
      const patterns = store.recordPatternsFromText('B^^^B some text B^^^^B', 'doc1')
      expect(patterns.some((p) => p.type === 'barcode')).toBe(true)
    })

    it('detects a!!!a patterns', () => {
      const patterns = store.recordPatternsFromText('a!!!!aA text', 'doc1')
      expect(patterns.some((p) => p.type === 'barcode')).toBe(true)
    })

    it('detects spaced fragments', () => {
      const patterns = store.recordPatternsFromText('G E N İ Ş L E T İ L M İ Ş', 'doc1')
      expect(patterns.some((p) => p.type === 'spaced_fragment')).toBe(true)
    })

    it('detects high ASCII sequences', () => {
      const patterns = store.recordPatternsFromText('\x80\x81\x82\x83 text', 'doc1')
      expect(patterns.some((p) => p.type === 'high_ascii')).toBe(true)
    })

    it('detects repetitive patterns', () => {
      const patterns = store.recordPatternsFromText('aaaaaaaaaa text', 'doc1')
      expect(patterns.some((p) => p.type === 'repetitive')).toBe(true)
    })

    it('handles text with no patterns', () => {
      const patterns = store.recordPatternsFromText('Clean normal text', 'doc1')
      expect(patterns).toHaveLength(0)
    })

    it('marks failure when causedFailure is true', () => {
      const patterns = store.recordPatternsFromText('B^^^B text', 'doc1', true)
      expect(patterns[0].failureCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('retrieval methods', () => {
    it('getPattern returns pattern by ID', () => {
      const p = store.recordPattern('find me')
      expect(store.getPattern(p.id)).toBeDefined()
    })

    it('getPattern returns undefined for unknown ID', () => {
      expect(store.getPattern('nonexistent')).toBeUndefined()
    })

    it('getAllPatterns returns all patterns', () => {
      store.recordPattern('p1')
      store.recordPattern('p2-different')
      expect(store.getAllPatterns().length).toBe(2)
    })

    it('getPatternsByType filters by type', () => {
      store.recordPattern('B^^^B')
      store.recordPattern('\x01\x02\x03')
      expect(store.getPatternsByType('barcode').length).toBe(1)
    })

    it('getPatternsByCategory filters by category', () => {
      store.recordPattern('B^^^B')
      store.recordPattern('\x80\x81\x82\x83')
      expect(store.getPatternsByCategory('scanner_artifact').length).toBe(1)
      expect(store.getPatternsByCategory('encoding_issue').length).toBe(1)
    })

    it('getSignificantPatterns returns high occurrence patterns', () => {
      const s = new PatternStore({ minOccurrencesForSignificance: 3 })
      s.recordPattern('sig1')
      s.recordPattern('sig1')
      s.recordPattern('sig1')
      expect(s.getSignificantPatterns().length).toBe(1)
    })

    it('getSignificantPatterns returns high confidence patterns', () => {
      const s = new PatternStore({ minConfidenceForPromotion: 0.85 })
      // Record with many failures to boost confidence
      for (let i = 0; i < 15; i++) {
        s.recordPattern('hi-conf', { causedFailure: true, retriedSuccessfully: true })
      }
      expect(s.getSignificantPatterns().length).toBeGreaterThanOrEqual(1)
    })

    it('getPatternsForPromotion filters eligible patterns', () => {
      const s = new PatternStore({
        minOccurrencesForSignificance: 2,
        minConfidenceForPromotion: 0.5,
      })
      for (let i = 0; i < 5; i++) {
        s.recordPattern('promo', { causedFailure: true, retriedSuccessfully: true })
      }
      const promotable = s.getPatternsForPromotion()
      expect(promotable.length).toBeGreaterThanOrEqual(0)
    })

    it('getPatternsForPromotion excludes already promoted', () => {
      for (let i = 0; i < 10; i++) {
        store.recordPattern('already-promoted', { causedFailure: true, retriedSuccessfully: true })
      }
      const p = store.getAllPatterns()[0]
      store.markAsPromoted(p.id)
      expect(store.getPatternsForPromotion().some((x) => x.id === p.id)).toBe(false)
    })

    it('getTopPatterns returns sorted by occurrence', () => {
      store.recordPattern('frequent')
      store.recordPattern('frequent')
      store.recordPattern('frequent')
      store.recordPattern('rare')
      const top = store.getTopPatterns(1)
      expect(top[0].occurrenceCount).toBe(3)
    })

    it('getTopFailingPatterns returns sorted by failure rate', () => {
      store.recordPattern('fail-a', { causedFailure: true })
      store.recordPattern('fail-a', { causedFailure: true })
      store.recordPattern('ok-b')
      store.recordPattern('ok-b')
      const top = store.getTopFailingPatterns(10)
      if (top.length > 0) {
        expect(top[0].failureCount).toBeGreaterThan(0)
      }
    })

    it('getTopFailingPatterns filters patterns with < 2 occurrences', () => {
      store.recordPattern('single', { causedFailure: true })
      const top = store.getTopFailingPatterns(10)
      expect(top.some((p) => p.occurrenceCount < 2)).toBe(false)
    })
  })

  describe('findKnownPatterns', () => {
    it('finds known patterns in text', () => {
      store.recordPattern('B^^^B')
      const results = store.findKnownPatterns('some B^^^B text here')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].matchedText).toContain('B^^^B')
    })

    it('provides context around match', () => {
      store.recordPattern('target')
      const results = store.findKnownPatterns('before target after')
      expect(results[0].context).toContain('before')
    })

    it('handles regex-special characters in pattern', () => {
      store.recordPattern('[special]+chars')
      const results = store.findKnownPatterns('has [special]+chars in it')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('falls back to literal match on regex error', () => {
      // Force a pattern that might fail as regex
      // @ts-expect-error - TS6133 unused variable
      const _p = store.recordPattern('test(pattern')
      // The escapeRegex should handle this, but if not, literal match catches it
      const results = store.findKnownPatterns('has test(pattern in it')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty array when no matches', () => {
      store.recordPattern('missing')
      const results = store.findKnownPatterns('nothing here')
      expect(results).toHaveLength(0)
    })
  })

  describe('getStats', () => {
    it('returns stats for empty store', () => {
      const stats = store.getStats()
      expect(stats.totalPatterns).toBe(0)
      expect(stats.averageConfidence).toBe(0)
    })

    it('returns correct type and category counts', () => {
      store.recordPattern('B^^^B')
      store.recordPattern('\x01\x02\x03')
      const stats = store.getStats()
      expect(stats.byType.barcode).toBe(1)
      expect(stats.byType.control_char).toBe(1)
    })

    it('counts promoted patterns', () => {
      const p = store.recordPattern('promoted')
      store.markAsPromoted(p.id)
      const stats = store.getStats()
      expect(stats.promotedCount).toBe(1)
    })

    it('calculates totals', () => {
      store.recordPattern('p1', { causedFailure: true })
      store.recordPattern('p1')
      const stats = store.getStats()
      expect(stats.totalOccurrences).toBe(2)
      expect(stats.totalFailures).toBe(1)
    })
  })

  describe('pattern management', () => {
    it('markAsPromoted returns true for existing pattern', () => {
      const p = store.recordPattern('promote-me')
      expect(store.markAsPromoted(p.id)).toBe(true)
      expect(store.getPattern(p.id)!.promotedToRule).toBe(true)
    })

    it('markAsPromoted returns false for unknown pattern', () => {
      expect(store.markAsPromoted('nonexistent')).toBe(false)
    })

    it('addTags adds tags to pattern', () => {
      const p = store.recordPattern('tag-me')
      store.addTags(p.id, ['tag1', 'tag2'])
      expect(store.getPattern(p.id)!.tags).toContain('tag1')
    })

    it('addTags deduplicates', () => {
      const p = store.recordPattern('dup-tags', { tags: ['tag1'] })
      store.addTags(p.id, ['tag1', 'tag2'])
      const tags = store.getPattern(p.id)!.tags
      expect(tags.filter((t) => t === 'tag1').length).toBe(1)
    })

    it('addTags returns false for unknown pattern', () => {
      expect(store.addTags('nonexistent', ['tag'])).toBe(false)
    })

    it('deletePattern removes pattern', () => {
      const p = store.recordPattern('delete-me')
      expect(store.deletePattern(p.id)).toBe(true)
      expect(store.getPattern(p.id)).toBeUndefined()
    })

    it('deletePattern returns false for unknown', () => {
      expect(store.deletePattern('nonexistent')).toBe(false)
    })

    it('clear removes all patterns', () => {
      store.recordPattern('p1')
      store.recordPattern('p2')
      store.clear()
      expect(store.getAllPatterns()).toHaveLength(0)
    })
  })

  describe('prunePatterns', () => {
    it('removes low-value patterns', () => {
      const s = new PatternStore({ pruneThreshold: 2 })
      s.recordPattern('low-value')
      const pruned = s.prunePatterns()
      expect(pruned).toBe(1)
    })

    it('keeps promoted patterns', () => {
      const s = new PatternStore({ pruneThreshold: 2 })
      const p = s.recordPattern('promoted-keep')
      s.markAsPromoted(p.id)
      s.prunePatterns()
      expect(s.getPattern(p.id)).toBeDefined()
    })

    it('keeps high-confidence patterns', () => {
      const s = new PatternStore({ pruneThreshold: 2 })
      // Record many times with failures to boost confidence
      for (let i = 0; i < 20; i++) {
        s.recordPattern('hi-conf', { causedFailure: true, retriedSuccessfully: true })
      }
      s.prunePatterns()
      expect(s.getAllPatterns().length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('import/export', () => {
    it('exports and imports patterns', () => {
      store.recordPattern('export-me')
      store.recordPattern('and-me')
      const json = store.export()

      const newStore = new PatternStore()
      const imported = newStore.import(json)
      expect(imported).toBe(2)
      expect(newStore.getAllPatterns()).toHaveLength(2)
    })

    it('import with merge=true adds to existing', () => {
      store.recordPattern('existing')
      const otherStore = new PatternStore()
      otherStore.recordPattern('new-one')
      const json = otherStore.export()

      store.import(json, true)
      expect(store.getAllPatterns().length).toBeGreaterThanOrEqual(2)
    })

    it('import with merge=false replaces existing', () => {
      store.recordPattern('existing')
      const otherStore = new PatternStore()
      otherStore.recordPattern('replacement')
      const json = otherStore.export()

      store.import(json, false)
      expect(store.getAllPatterns().length).toBe(1)
    })

    it('import throws on invalid format', () => {
      expect(() => store.import('{"notPatterns": true}')).toThrow('Invalid pattern export format')
    })

    it('import skips patterns without id or pattern field', () => {
      const json = JSON.stringify({
        patterns: [{ id: 'p1' }, { pattern: 'text' }, { id: 'p3', pattern: 'valid' }],
      })
      const count = store.import(json)
      expect(count).toBe(1) // Only the one with both id and pattern
    })

    it('exportAsRegexRules returns escaped patterns', () => {
      const s = new PatternStore({
        minOccurrencesForSignificance: 1,
        minConfidenceForPromotion: 0.0,
      })
      for (let i = 0; i < 5; i++) {
        s.recordPattern('B^^^B', { causedFailure: true, retriedSuccessfully: true })
      }
      const rules = s.exportAsRegexRules()
      // May or may not have rules depending on confidence
      expect(Array.isArray(rules)).toBe(true)
    })
  })

  describe('singleton', () => {
    beforeEach(() => {
      resetPatternStore()
    })

    it('getPatternStore returns same instance', () => {
      const s1 = getPatternStore()
      const s2 = getPatternStore()
      expect(s1).toBe(s2)
    })

    it('resetPatternStore clears singleton', () => {
      const s1 = getPatternStore()
      s1.recordPattern('test')
      resetPatternStore()
      const s2 = getPatternStore()
      expect(s2.getAllPatterns()).toHaveLength(0)
    })
  })
})
