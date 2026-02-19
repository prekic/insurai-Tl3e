/**
 * Version - Coverage Tests
 *
 * Targets uncovered branches in version.ts (0% function coverage)
 */

import { describe, it, expect } from 'vitest'
import {
  PIPELINE_VERSION,
  OCR_NORMALIZER_VERSION,
  SECTION_NORMALIZER_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  QA_SCORING_VERSION,
  getPipelineVersionKey,
  VERSION_HISTORY,
} from './version'

describe('version coverage', () => {
  describe('constants', () => {
    it('exports PIPELINE_VERSION as string', () => {
      expect(typeof PIPELINE_VERSION).toBe('string')
      expect(PIPELINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    })

    it('exports OCR_NORMALIZER_VERSION as string', () => {
      expect(typeof OCR_NORMALIZER_VERSION).toBe('string')
      expect(OCR_NORMALIZER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    })

    it('exports SECTION_NORMALIZER_VERSION as string', () => {
      expect(typeof SECTION_NORMALIZER_VERSION).toBe('string')
    })

    it('exports EXTRACTION_SCHEMA_VERSION as string', () => {
      expect(typeof EXTRACTION_SCHEMA_VERSION).toBe('string')
    })

    it('exports QA_SCORING_VERSION as string', () => {
      expect(typeof QA_SCORING_VERSION).toBe('string')
    })
  })

  describe('getPipelineVersionKey', () => {
    it('returns composite key string', () => {
      const key = getPipelineVersionKey()
      expect(key).toContain('p')
      expect(key).toContain('_o')
      expect(key).toContain('_s')
    })

    it('includes pipeline version', () => {
      const key = getPipelineVersionKey()
      expect(key).toContain(`p${PIPELINE_VERSION}`)
    })

    it('includes OCR normalizer version', () => {
      const key = getPipelineVersionKey()
      expect(key).toContain(`o${OCR_NORMALIZER_VERSION}`)
    })

    it('includes section normalizer version', () => {
      const key = getPipelineVersionKey()
      expect(key).toContain(`s${SECTION_NORMALIZER_VERSION}`)
    })

    it('returns consistent result', () => {
      expect(getPipelineVersionKey()).toBe(getPipelineVersionKey())
    })
  })

  describe('VERSION_HISTORY', () => {
    it('is a non-empty array', () => {
      expect(VERSION_HISTORY.length).toBeGreaterThan(0)
    })

    it('has entries with date, version, and changes', () => {
      for (const entry of VERSION_HISTORY) {
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
        expect(entry.changes.length).toBeGreaterThan(0)
      }
    })

    it('includes current PIPELINE_VERSION in history', () => {
      const versions = VERSION_HISTORY.map(e => e.version)
      expect(versions).toContain(PIPELINE_VERSION)
    })
  })
})
