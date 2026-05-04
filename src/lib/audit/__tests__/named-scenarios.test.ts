/**
 * Tests for the Named Scenarios Registry.
 *
 * Verifies:
 * 1. All scenarios have required fields
 * 2. Legacy compatibility shape matches original
 * 3. Detection patterns produce identical results to the original
 * 4. Registry lookup helpers work correctly
 */
import { describe, it, expect } from 'vitest'

import {
  NAMED_SCENARIOS,
  NAMED_SCENARIOS_LIST,
  NAMED_DEDUCTIBLE_SCENARIOS,
  toLegacyFormat,
  getNamedScenario,
  getScenarioIds,
} from '../named-scenarios.js'

// The original NAMED_DEDUCTIBLE_SCENARIOS from policy-converter.ts
// We import it to verify our refactored version produces identical behavior
import { NAMED_DEDUCTIBLE_SCENARIOS as ORIGINAL_SCENARIOS } from '../../ai/policy-converter.js'

describe('Named Scenarios Registry', () => {
  describe('structure', () => {
    it('has exactly 7 scenarios (matching the original)', () => {
      expect(Object.keys(NAMED_SCENARIOS)).toHaveLength(7)
      expect(NAMED_SCENARIOS_LIST).toHaveLength(7)
    })

    it('every scenario has all required fields', () => {
      for (const scenario of NAMED_SCENARIOS_LIST) {
        expect(scenario.canonicalId).toBeTruthy()
        expect(scenario.detectionPatterns.length).toBeGreaterThan(0)
        expect(scenario.category).toMatch(
          /^(DEDUCTIBLE_TRIGGER|EXCLUSION|COVERAGE_FEATURE|SUB_LIMIT)$/
        )
        expect(scenario.importance).toMatch(/^(high|medium|low)$/)
        expect(scenario.userFacingTitleTR).toBeTruthy()
        expect(scenario.userFacingTitleEN).toBeTruthy()
      }
    })

    it('canonical IDs are unique', () => {
      const ids = NAMED_SCENARIOS_LIST.map((s) => s.canonicalId)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('canonical IDs match record keys', () => {
      for (const [key, scenario] of Object.entries(NAMED_SCENARIOS)) {
        expect(scenario.canonicalId).toBe(key)
      }
    })
  })

  describe('legacy compatibility', () => {
    it('NAMED_DEDUCTIBLE_SCENARIOS has same length as original', () => {
      expect(NAMED_DEDUCTIBLE_SCENARIOS).toHaveLength(ORIGINAL_SCENARIOS.length)
    })

    it('each legacy entry has keywords and labelTr', () => {
      for (const entry of NAMED_DEDUCTIBLE_SCENARIOS) {
        expect(Array.isArray(entry.keywords)).toBe(true)
        expect(entry.keywords.length).toBeGreaterThan(0)
        expect(typeof entry.labelTr).toBe('string')
        expect(entry.labelTr.length).toBeGreaterThan(0)
      }
    })

    it('legacy detection patterns match original patterns exactly', () => {
      for (let i = 0; i < NAMED_DEDUCTIBLE_SCENARIOS.length; i++) {
        const refactored = NAMED_DEDUCTIBLE_SCENARIOS[i]
        const original = ORIGINAL_SCENARIOS[i]

        // Same number of keywords
        expect(refactored.keywords).toHaveLength(original.keywords.length)

        // Each regex pattern has identical source and flags
        for (let j = 0; j < refactored.keywords.length; j++) {
          expect(refactored.keywords[j].source).toBe(original.keywords[j].source)
          expect(refactored.keywords[j].flags).toBe(original.keywords[j].flags)
        }
      }
    })

    it('legacy labelTr matches original labelTr', () => {
      for (let i = 0; i < NAMED_DEDUCTIBLE_SCENARIOS.length; i++) {
        expect(NAMED_DEDUCTIBLE_SCENARIOS[i].labelTr).toBe(ORIGINAL_SCENARIOS[i].labelTr)
      }
    })
  })

  describe('detection behavior parity', () => {
    const TEST_STRINGS = [
      'Anlaşmalı olmayan servis onarımında %30 muafiyet',
      'Pert araç muafiyeti %20 tenzili muafiyet uygulanır',
      'LPG donanımı beyan dışı ise teminat kapsamı dışındadır',
      'Rent-a-car kullanımında %80 muafiyet',
      'Kullanım Şekli Klozu: her hasarın %80 muafiyet',
      'İlk cam hasarında anlaşmalı cam servisi',
      '25 yaş altı sürücü kullanımında',
      'Ehliyet süresi 2 yıldan az ise',
    ]

    it('original and refactored produce identical keyword matches on test strings', () => {
      for (const text of TEST_STRINGS) {
        for (let i = 0; i < NAMED_DEDUCTIBLE_SCENARIOS.length; i++) {
          const refactored = NAMED_DEDUCTIBLE_SCENARIOS[i]
          const original = ORIGINAL_SCENARIOS[i]

          const refactoredAllMatch = refactored.keywords.every((kw) => kw.test(text))
          const originalAllMatch = original.keywords.every((kw) => kw.test(text))

          expect(refactoredAllMatch).toBe(originalAllMatch)
        }
      }
    })
  })

  describe('lookup helpers', () => {
    it('getNamedScenario returns the correct scenario', () => {
      const scenario = getNamedScenario('KULLANIM_SEKLI_80')
      expect(scenario).toBeDefined()
      expect(scenario!.canonicalId).toBe('KULLANIM_SEKLI_80')
      expect(scenario!.importance).toBe('high')
      expect(scenario!.expectedRate).toBe('80%')
    })

    it('getNamedScenario returns undefined for unknown ID', () => {
      expect(getNamedScenario('NONEXISTENT')).toBeUndefined()
    })

    it('getScenarioIds returns all 7 IDs', () => {
      const ids = getScenarioIds()
      expect(ids).toHaveLength(7)
      expect(ids).toContain('NON_CONTRACTED_SERVICE')
      expect(ids).toContain('KULLANIM_SEKLI_80')
      expect(ids).toContain('TOTAL_LOSS_DEDUCTIBLE')
    })

    it('toLegacyFormat preserves structure', () => {
      const scenario = NAMED_SCENARIOS.FIRST_GLASS_DEDUCTIBLE
      const legacy = toLegacyFormat(scenario)
      expect(legacy.keywords).toBe(scenario.detectionPatterns)
      expect(legacy.labelTr).toBe(scenario.userFacingTitleTR)
    })
  })
})
