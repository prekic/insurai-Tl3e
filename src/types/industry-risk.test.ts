/**
 * Industry Risk Types Tests
 *
 * Tests for industry-specific risk helper functions
 */

import { describe, it, expect } from 'vitest'
import {
  getBusinessSize,
  getIndustrySectorNameTr,
  BUSINESS_SIZE_DEFINITIONS,
  DEFAULT_INDUSTRY_CATEGORY_WEIGHTS,
} from './industry-risk'
import type { IndustrySector, IndustryRiskCategory } from './industry-risk'

describe('Industry Risk Types', () => {
  describe('BUSINESS_SIZE_DEFINITIONS', () => {
    it('should have 5 size definitions', () => {
      expect(BUSINESS_SIZE_DEFINITIONS).toHaveLength(5)
    })

    it('should have all required sizes', () => {
      const sizes = BUSINESS_SIZE_DEFINITIONS.map((def) => def.size)
      expect(sizes).toContain('micro')
      expect(sizes).toContain('small')
      expect(sizes).toContain('medium')
      expect(sizes).toContain('large')
      expect(sizes).toContain('enterprise')
    })

    it('should have ascending employee thresholds', () => {
      for (let i = 1; i < BUSINESS_SIZE_DEFINITIONS.length; i++) {
        const current = BUSINESS_SIZE_DEFINITIONS[i]
        const previous = BUSINESS_SIZE_DEFINITIONS[i - 1]
        expect(current.maxEmployees).toBeGreaterThan(previous.maxEmployees)
      }
    })

    it('should have ascending revenue thresholds', () => {
      for (let i = 1; i < BUSINESS_SIZE_DEFINITIONS.length; i++) {
        const current = BUSINESS_SIZE_DEFINITIONS[i]
        const previous = BUSINESS_SIZE_DEFINITIONS[i - 1]
        expect(current.maxRevenue).toBeGreaterThan(previous.maxRevenue)
      }
    })

    it('should have descriptions in both English and Turkish', () => {
      BUSINESS_SIZE_DEFINITIONS.forEach((def) => {
        expect(def.description).toBeDefined()
        expect(def.descriptionTr).toBeDefined()
        expect(def.description.length).toBeGreaterThan(0)
        expect(def.descriptionTr.length).toBeGreaterThan(0)
      })
    })

    it('should have enterprise with Infinity thresholds', () => {
      const enterprise = BUSINESS_SIZE_DEFINITIONS.find((def) => def.size === 'enterprise')
      expect(enterprise).toBeDefined()
      expect(enterprise!.maxEmployees).toBe(Infinity)
      expect(enterprise!.maxRevenue).toBe(Infinity)
    })
  })

  describe('DEFAULT_INDUSTRY_CATEGORY_WEIGHTS', () => {
    it('should have weights for all categories', () => {
      const categories: IndustryRiskCategory[] = [
        'operational',
        'property',
        'liability',
        'employee',
        'cyber',
        'environmental',
        'product',
        'business_interruption',
        'regulatory',
        'supply_chain',
        'reputation',
        'financial',
      ]

      categories.forEach((category) => {
        expect(DEFAULT_INDUSTRY_CATEGORY_WEIGHTS[category]).toBeDefined()
        expect(typeof DEFAULT_INDUSTRY_CATEGORY_WEIGHTS[category]).toBe('number')
      })
    })

    it('should have weights that sum to 1.0', () => {
      const total = Object.values(DEFAULT_INDUSTRY_CATEGORY_WEIGHTS).reduce(
        (sum, weight) => sum + weight,
        0
      )
      expect(total).toBeCloseTo(1.0, 5)
    })

    it('should have all weights between 0 and 1', () => {
      Object.values(DEFAULT_INDUSTRY_CATEGORY_WEIGHTS).forEach((weight) => {
        expect(weight).toBeGreaterThan(0)
        expect(weight).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('getBusinessSize', () => {
    describe('micro classification', () => {
      it('should return micro for very small business', () => {
        expect(getBusinessSize(5, 1000000)).toBe('micro')
      })

      it('should return micro at upper boundary (10 employees, 5M TRY)', () => {
        expect(getBusinessSize(10, 5000000)).toBe('micro')
      })

      it('should return micro for 1 employee', () => {
        expect(getBusinessSize(1, 100000)).toBe('micro')
      })
    })

    describe('small classification', () => {
      it('should return small for 11-50 employees', () => {
        expect(getBusinessSize(25, 25000000)).toBe('small')
      })

      it('should return small at upper boundary (50 employees, 50M TRY)', () => {
        expect(getBusinessSize(50, 50000000)).toBe('small')
      })

      it('should return small when employees exceed micro but revenue is low', () => {
        expect(getBusinessSize(15, 4000000)).toBe('small')
      })

      it('should return small when revenue exceeds micro but employees are low', () => {
        expect(getBusinessSize(8, 10000000)).toBe('small')
      })
    })

    describe('medium classification', () => {
      it('should return medium for 51-250 employees', () => {
        expect(getBusinessSize(150, 150000000)).toBe('medium')
      })

      it('should return medium at upper boundary (250 employees, 250M TRY)', () => {
        expect(getBusinessSize(250, 250000000)).toBe('medium')
      })
    })

    describe('large classification', () => {
      it('should return large for 251-1000 employees', () => {
        expect(getBusinessSize(500, 500000000)).toBe('large')
      })

      it('should return large at upper boundary (1000 employees, 1B TRY)', () => {
        expect(getBusinessSize(1000, 1000000000)).toBe('large')
      })
    })

    describe('enterprise classification', () => {
      it('should return enterprise for 1000+ employees', () => {
        expect(getBusinessSize(1001, 2000000000)).toBe('enterprise')
      })

      it('should return enterprise for very large company', () => {
        expect(getBusinessSize(10000, 10000000000)).toBe('enterprise')
      })

      it('should return enterprise when employees exceed large threshold', () => {
        expect(getBusinessSize(1500, 500000000)).toBe('enterprise')
      })

      it('should return enterprise when revenue exceeds large threshold', () => {
        expect(getBusinessSize(500, 2000000000)).toBe('enterprise')
      })
    })

    describe('edge cases', () => {
      it('should handle zero employees', () => {
        expect(getBusinessSize(0, 1000000)).toBe('micro')
      })

      it('should handle zero revenue', () => {
        expect(getBusinessSize(5, 0)).toBe('micro')
      })

      it('should handle both zero', () => {
        expect(getBusinessSize(0, 0)).toBe('micro')
      })

      it('should classify based on first matching threshold', () => {
        // Both metrics fit micro
        expect(getBusinessSize(5, 3000000)).toBe('micro')

        // Employees fit small, revenue fits micro - takes small (first non-matching)
        expect(getBusinessSize(20, 3000000)).toBe('small')
      })
    })
  })

  describe('getIndustrySectorNameTr', () => {
    it('should return Turkish name for manufacturing', () => {
      expect(getIndustrySectorNameTr('manufacturing')).toBe('İmalat')
    })

    it('should return Turkish name for construction', () => {
      expect(getIndustrySectorNameTr('construction')).toBe('İnşaat')
    })

    it('should return Turkish name for retail', () => {
      expect(getIndustrySectorNameTr('retail')).toBe('Perakende')
    })

    it('should return Turkish name for wholesale', () => {
      expect(getIndustrySectorNameTr('wholesale')).toBe('Toptan Ticaret')
    })

    it('should return Turkish name for transportation', () => {
      expect(getIndustrySectorNameTr('transportation')).toBe('Ulaştırma')
    })

    it('should return Turkish name for hospitality', () => {
      expect(getIndustrySectorNameTr('hospitality')).toBe('Konaklama ve Yiyecek')
    })

    it('should return Turkish name for healthcare', () => {
      expect(getIndustrySectorNameTr('healthcare')).toBe('Sağlık')
    })

    it('should return Turkish name for technology', () => {
      expect(getIndustrySectorNameTr('technology')).toBe('Teknoloji')
    })

    it('should return Turkish name for finance', () => {
      expect(getIndustrySectorNameTr('finance')).toBe('Finans')
    })

    it('should return Turkish name for real_estate', () => {
      expect(getIndustrySectorNameTr('real_estate')).toBe('Gayrimenkul')
    })

    it('should return Turkish name for professional_services', () => {
      expect(getIndustrySectorNameTr('professional_services')).toBe('Profesyonel Hizmetler')
    })

    it('should return Turkish name for education', () => {
      expect(getIndustrySectorNameTr('education')).toBe('Eğitim')
    })

    it('should return Turkish name for agriculture', () => {
      expect(getIndustrySectorNameTr('agriculture')).toBe('Tarım')
    })

    it('should return Turkish name for mining', () => {
      expect(getIndustrySectorNameTr('mining')).toBe('Madencilik')
    })

    it('should return Turkish name for utilities', () => {
      expect(getIndustrySectorNameTr('utilities')).toBe('Kamu Hizmetleri')
    })

    it('should return Turkish name for food_beverage', () => {
      expect(getIndustrySectorNameTr('food_beverage')).toBe('Gıda ve İçecek')
    })

    it('should return Turkish name for textile', () => {
      expect(getIndustrySectorNameTr('textile')).toBe('Tekstil')
    })

    it('should return Turkish name for automotive', () => {
      expect(getIndustrySectorNameTr('automotive')).toBe('Otomotiv')
    })

    it('should return Turkish name for chemical', () => {
      expect(getIndustrySectorNameTr('chemical')).toBe('Kimya')
    })

    it('should return Turkish name for logistics', () => {
      expect(getIndustrySectorNameTr('logistics')).toBe('Lojistik')
    })

    it('should return names for all industry sectors', () => {
      const sectors: IndustrySector[] = [
        'manufacturing',
        'construction',
        'retail',
        'wholesale',
        'transportation',
        'hospitality',
        'healthcare',
        'technology',
        'finance',
        'real_estate',
        'professional_services',
        'education',
        'agriculture',
        'mining',
        'utilities',
        'food_beverage',
        'textile',
        'automotive',
        'chemical',
        'logistics',
      ]

      sectors.forEach((sector) => {
        const name = getIndustrySectorNameTr(sector)
        expect(name).toBeDefined()
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
      })
    })

    it('should return unique Turkish names for each sector', () => {
      const sectors: IndustrySector[] = [
        'manufacturing',
        'construction',
        'retail',
        'wholesale',
        'transportation',
        'hospitality',
        'healthcare',
        'technology',
        'finance',
        'real_estate',
        'professional_services',
        'education',
        'agriculture',
        'mining',
        'utilities',
        'food_beverage',
        'textile',
        'automotive',
        'chemical',
        'logistics',
      ]

      const names = sectors.map(getIndustrySectorNameTr)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(sectors.length)
    })
  })
})
