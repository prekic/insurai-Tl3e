/**
 * WS-5 — Batch Ingestion Pure Helper Tests
 */
import { describe, it, expect } from 'vitest'
import {
  discoverPDFs,
  summarizeBatch,
  checkProhibitedPhrases,
  type BatchResultEntry,
} from '../batch-ingest-helpers'

// ============================================================================
// discoverPDFs
// ============================================================================

describe('discoverPDFs', () => {
  const mockPath = {
    join: (...args: string[]) => args.join('/'),
    extname: (p: string) => {
      const dot = p.lastIndexOf('.')
      return dot >= 0 ? p.substring(dot) : ''
    },
  }

  it('returns only .pdf files sorted alphabetically', () => {
    const mockFs = {
      readdirSync: () => ['c.pdf', 'a.pdf', 'readme.txt', 'b.PDF', 'image.png'],
      statSync: () => ({ size: 1024 }),
    }
    const result = discoverPDFs('/dir', mockFs, mockPath)
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('a.pdf')
    expect(result[1].name).toBe('b.PDF')
    expect(result[2].name).toBe('c.pdf')
  })

  it('returns empty array when no PDFs found', () => {
    const mockFs = {
      readdirSync: () => ['readme.txt', 'data.json'],
      statSync: () => ({ size: 0 }),
    }
    const result = discoverPDFs('/dir', mockFs, mockPath)
    expect(result).toHaveLength(0)
  })

  it('includes file size from statSync', () => {
    const mockFs = {
      readdirSync: () => ['test.pdf'],
      statSync: () => ({ size: 512000 }),
    }
    const result = discoverPDFs('/dir', mockFs, mockPath)
    expect(result[0].sizeBytes).toBe(512000)
    expect(result[0].path).toBe('/dir/test.pdf')
  })

  it('handles empty directory', () => {
    const mockFs = {
      readdirSync: () => [],
      statSync: () => ({ size: 0 }),
    }
    const result = discoverPDFs('/empty', mockFs, mockPath)
    expect(result).toHaveLength(0)
  })
})

// ============================================================================
// summarizeBatch
// ============================================================================

describe('summarizeBatch', () => {
  function makeEntry(overrides: Partial<BatchResultEntry> = {}): BatchResultEntry {
    return {
      filename: 'test.pdf',
      textExtracted: true,
      textLength: 5000,
      pageCount: 10,
      llmExtracted: true,
      llmModel: 'gpt-4o-mini',
      policyNumber: 'KSK-001',
      provider: 'Allianz',
      coverageCount: 8,
      admissionStatus: 'pilot_eligible_clean',
      displayMode: 'full',
      phraseClean: true,
      error: null,
      ...overrides,
    }
  }

  it('counts totals correctly', () => {
    const results = [
      makeEntry(),
      makeEntry({ textExtracted: false, llmExtracted: false }),
      makeEntry({ llmExtracted: false }),
    ]
    const summary = summarizeBatch(results)
    expect(summary.totalFiles).toBe(3)
    expect(summary.textSuccess).toBe(2)
    expect(summary.textFailed).toBe(1)
    expect(summary.llmSuccess).toBe(1)
    expect(summary.llmFailed).toBe(2)
  })

  it('computes admission breakdown', () => {
    const results = [
      makeEntry({ admissionStatus: 'pilot_eligible_clean' }),
      makeEntry({ admissionStatus: 'pilot_eligible_clean' }),
      makeEntry({ admissionStatus: 'pilot_eligible_moderate' }),
      makeEntry({ admissionStatus: 'pilot_ineligible_incomplete' }),
    ]
    const summary = summarizeBatch(results)
    expect(summary.admissionBreakdown).toEqual({
      pilot_eligible_clean: 2,
      pilot_eligible_moderate: 1,
      pilot_ineligible_incomplete: 1,
    })
  })

  it('computes display mode breakdown', () => {
    const results = [
      makeEntry({ displayMode: 'full' }),
      makeEntry({ displayMode: 'restricted' }),
      makeEntry({ displayMode: 'full' }),
    ]
    const summary = summarizeBatch(results)
    expect(summary.displayModeBreakdown).toEqual({
      full: 2,
      restricted: 1,
    })
  })

  it('counts phrase leaks', () => {
    const results = [
      makeEntry({ phraseClean: true }),
      makeEntry({ phraseClean: false }),
      makeEntry({ phraseClean: false }),
    ]
    const summary = summarizeBatch(results)
    expect(summary.phraseLeaks).toBe(2)
  })

  it('computes average coverages from LLM-extracted entries only', () => {
    const results = [
      makeEntry({ llmExtracted: true, coverageCount: 10 }),
      makeEntry({ llmExtracted: true, coverageCount: 6 }),
      makeEntry({ llmExtracted: false, coverageCount: 0 }),
    ]
    const summary = summarizeBatch(results)
    expect(summary.averageCoverages).toBe(8)
  })

  it('handles empty results', () => {
    const summary = summarizeBatch([])
    expect(summary.totalFiles).toBe(0)
    expect(summary.averageCoverages).toBe(0)
    expect(summary.phraseLeaks).toBe(0)
  })
})

// ============================================================================
// checkProhibitedPhrases
// ============================================================================

describe('checkProhibitedPhrases', () => {
  const PROHIBITED = ['unlimited', 'fully covered', 'muafiyetsiz']

  it('ignores json structural keys and booleans', () => {
    // an extraction with isUnlimited: true should not fail
    const data = {
      isUnlimited: true,
      hasFullyCoveredDetail: false,
      coverages: [{ name: 'Standard Auto', description: 'Regular coverage' }],
    }
    const leaks = checkProhibitedPhrases(data, PROHIBITED)
    expect(leaks).toHaveLength(0)
  })

  it('detects prohibited phrases in coverage names and descriptions', () => {
    const data = {
      coverages: [{ name: 'Unlimited Liability', description: 'You are fully covered.' }],
    }
    const leaks = checkProhibitedPhrases(data, PROHIBITED)
    expect(leaks).toEqual(['unlimited', 'fully covered'])
  })

  it('detects prohibited phrases in special conditions and exclusions', () => {
    const data = {
      coverages: [],
      specialConditions: ['This is muafiyetsiz'],
      exclusions: ['Does not apply if unlimited limits exceeded'],
    }
    const leaks = checkProhibitedPhrases(data, PROHIBITED)
    expect(leaks).toEqual(['unlimited', 'muafiyetsiz'])
  })

  it('returns empty array if nothing is passed', () => {
    expect(checkProhibitedPhrases(null, PROHIBITED)).toEqual([])
    expect(checkProhibitedPhrases({}, PROHIBITED)).toEqual([])
  })
})
