import { describe, it, expect } from 'vitest'
import {
  getRegulationById,
  getGeneralConditionByCategory,
  getActiveRegulations,
  getClausesByCategory,
  searchRegulations,
  getLatestVersion,
  getRegulationHistory,
  PRIMARY_LAWS,
  GENERAL_CONDITIONS,
  RECENT_CIRCULARS,
  STANDARD_CLAUSES,
} from './regulations'

describe('Regulation Lookup Helpers', () => {
  describe('getRegulationById', () => {
    it('should find a primary law by id', () => {
      if (PRIMARY_LAWS.length > 0) {
        const result = getRegulationById(PRIMARY_LAWS[0].id)
        expect(result).toBeDefined()
        expect(result!.id).toBe(PRIMARY_LAWS[0].id)
      }
    })

    it('should find a general condition by id', () => {
      if (GENERAL_CONDITIONS.length > 0) {
        const result = getRegulationById(GENERAL_CONDITIONS[0].id)
        expect(result).toBeDefined()
      }
    })

    it('should find a circular by id', () => {
      if (RECENT_CIRCULARS.length > 0) {
        const result = getRegulationById(RECENT_CIRCULARS[0].id)
        expect(result).toBeDefined()
      }
    })

    it('should return undefined for non-existent id', () => {
      expect(getRegulationById('non-existent-id')).toBeUndefined()
    })
  })

  describe('getGeneralConditionByCategory', () => {
    it('should find condition by category', () => {
      if (GENERAL_CONDITIONS.length > 0) {
        const category = GENERAL_CONDITIONS[0].category[0]
        const result = getGeneralConditionByCategory(category)
        expect(result).toBeDefined()
      }
    })

    it('should return undefined for non-existent category', () => {
      const result = getGeneralConditionByCategory('nonexistent' as any)
      expect(result).toBeUndefined()
    })
  })

  describe('getActiveRegulations', () => {
    it('should return all active regulations without category filter', () => {
      const result = getActiveRegulations()
      expect(Array.isArray(result)).toBe(true)
      result.forEach((r) => expect(r.isActive).toBe(true))
    })

    it('should filter by category', () => {
      const result = getActiveRegulations('kasko')
      expect(Array.isArray(result)).toBe(true)
      result.forEach((r) => {
        expect(r.isActive).toBe(true)
        expect(
          r.category.includes('kasko') || r.category.includes('all')
        ).toBe(true)
      })
    })

    it('should return empty array for non-matching category', () => {
      const result = getActiveRegulations('nonexistent_category' as any)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should exclude inactive regulations', () => {
      const result = getActiveRegulations()
      const inactiveFound = result.some((r) => !r.isActive)
      expect(inactiveFound).toBe(false)
    })
  })

  describe('getClausesByCategory', () => {
    it('should return clauses for a valid category', () => {
      if (STANDARD_CLAUSES.length > 0) {
        const category = STANDARD_CLAUSES[0].category[0]
        const result = getClausesByCategory(category)
        expect(Array.isArray(result)).toBe(true)
        result.forEach((c) => {
          expect(c.category).toContain(category)
          expect(c.isActive).toBe(true)
        })
      }
    })

    it('should return empty for non-matching category', () => {
      const result = getClausesByCategory('nonexistent' as any)
      expect(result).toEqual([])
    })
  })

  describe('searchRegulations', () => {
    it('should find regulations by Turkish name', () => {
      if (PRIMARY_LAWS.length > 0) {
        const term = PRIMARY_LAWS[0].nameTR.substring(0, 10)
        const result = searchRegulations(term)
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('should find regulations by English name', () => {
      if (PRIMARY_LAWS.length > 0) {
        const term = PRIMARY_LAWS[0].nameEN.substring(0, 10)
        const result = searchRegulations(term)
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('should be case-insensitive', () => {
      if (PRIMARY_LAWS.length > 0) {
        const term = PRIMARY_LAWS[0].nameTR.substring(0, 5).toUpperCase()
        const result = searchRegulations(term)
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('should return empty for non-matching query', () => {
      const result = searchRegulations('xyznonexistent12345')
      expect(result).toEqual([])
    })
  })

  describe('getLatestVersion', () => {
    it('should return undefined for non-existent id', () => {
      expect(getLatestVersion('non-existent')).toBeUndefined()
    })

    it('should return the regulation itself if not superseded', () => {
      // Find a regulation without supersededBy
      const allRegs = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
      const nonSuperseded = allRegs.find((r) => !r.supersededBy)
      if (nonSuperseded) {
        const result = getLatestVersion(nonSuperseded.id)
        expect(result).toBeDefined()
        expect(result!.id).toBe(nonSuperseded.id)
      }
    })

    it('should follow supersededBy chain', () => {
      const allRegs = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
      const superseded = allRegs.find((r) => r.supersededBy)
      if (superseded) {
        const result = getLatestVersion(superseded.id)
        expect(result).toBeDefined()
        expect(result!.id).not.toBe(superseded.id)
      }
    })
  })

  describe('getRegulationHistory', () => {
    it('should return empty array for non-existent id', () => {
      expect(getRegulationHistory('non-existent')).toEqual([])
    })

    it('should include current regulation in history', () => {
      if (PRIMARY_LAWS.length > 0) {
        const result = getRegulationHistory(PRIMARY_LAWS[0].id)
        expect(result.length).toBeGreaterThan(0)
        expect(result.some((r) => r.id === PRIMARY_LAWS[0].id)).toBe(true)
      }
    })

    it('should include superseding regulations', () => {
      const allRegs = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
      const withSupersedes = allRegs.find(
        (r) => r.supersedes && r.supersedes.length > 0
      )
      if (withSupersedes) {
        const result = getRegulationHistory(withSupersedes.id)
        expect(result.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('should handle regulations with no supersedes or supersededBy', () => {
      const allRegs = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
      const simple = allRegs.find((r) => !r.supersedes && !r.supersededBy)
      if (simple) {
        const result = getRegulationHistory(simple.id)
        expect(result).toContainEqual(expect.objectContaining({ id: simple.id }))
      }
    })
  })
})
