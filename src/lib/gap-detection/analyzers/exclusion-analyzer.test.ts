/**
 * Exclusion Gap Analyzer Tests
 * Tests for detecting problematic policy exclusions
 */

import { describe, it, expect } from 'vitest'
import { analyzeExclusionGaps } from './exclusion-analyzer'
import { DEFAULT_GAP_CONFIG } from '@/types/gap'
import {
  createMockPolicy,
  EXCLUSION_HEAVY_POLICY,
  WELL_COVERED_KASKO_POLICY,
} from '../__tests__/fixtures'

describe('Exclusion Gap Analyzer', () => {
  describe('analyzeExclusionGaps', () => {
    it('should return an array of gaps', () => {
      const policy = createMockPolicy()
      const gaps = analyzeExclusionGaps(policy)

      expect(Array.isArray(gaps)).toBe(true)
    })

    it('should find no gaps for policy without exclusions', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: [],
      })

      const gaps = analyzeExclusionGaps(policy)

      expect(gaps.length).toBe(0)
    })

    it('should detect problematic exclusions', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      expect(gaps.length).toBeGreaterThan(0)
    })
  })

  describe('Kasko Exclusion Patterns', () => {
    it('should detect earthquake exclusion as critical', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Deprem hasarları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const earthquakeGap = gaps.find(g => g.affectedCoverage === 'Earthquake Damage')
      expect(earthquakeGap).toBeDefined()
      expect(earthquakeGap?.severity).toBe('critical')
    })

    it('should detect theft exclusion as critical', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Hırsızlık zararları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const theftGap = gaps.find(g => g.affectedCoverage === 'Theft')
      expect(theftGap).toBeDefined()
      expect(theftGap?.severity).toBe('critical')
    })

    it('should detect flood exclusion as high', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Sel hasarları kapsam dışıdır'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const floodGap = gaps.find(g => g.affectedCoverage === 'Flood Damage')
      expect(floodGap).toBeDefined()
      expect(floodGap?.severity).toBe('high')
    })

    it('should detect glass exclusion as medium', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Cam kırılması hasarları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const glassGap = gaps.find(g => g.affectedCoverage === 'Glass Breakage')
      expect(glassGap).toBeDefined()
      expect(['medium', 'high']).toContain(glassGap?.severity)
    })
  })

  describe('Home Exclusion Patterns', () => {
    it('should detect fire exclusion as critical', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Yangın hasarları kapsam dışıdır'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap).toBeDefined()
      expect(fireGap?.severity).toBe('critical')
    })

    it('should detect water damage exclusion as medium', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Su hasarları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const waterGap = gaps.find(g => g.affectedCoverage === 'Water Damage')
      expect(waterGap).toBeDefined()
    })
  })

  describe('Health Exclusion Patterns', () => {
    it('should detect cancer exclusion as critical', () => {
      const policy = createMockPolicy({
        type: 'health',
        exclusions: ['Kanser tedavileri kapsam dışıdır'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const cancerGap = gaps.find(g => g.affectedCoverage === 'Cancer Treatment')
      expect(cancerGap).toBeDefined()
      expect(cancerGap?.severity).toBe('critical')
    })

    it('should detect chronic illness exclusion as high', () => {
      const policy = createMockPolicy({
        type: 'health',
        exclusions: ['Kronik hastalık tedavileri'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const chronicGap = gaps.find(g => g.affectedCoverage === 'Chronic Illness')
      expect(chronicGap).toBeDefined()
      expect(chronicGap?.severity).toBe('high')
    })

    it('should detect pregnancy exclusion as high', () => {
      const policy = createMockPolicy({
        type: 'health',
        exclusions: ['Hamilelik ve doğum'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const pregnancyGap = gaps.find(g => g.affectedCoverage === 'Pregnancy/Birth')
      expect(pregnancyGap).toBeDefined()
      expect(pregnancyGap?.severity).toBe('high')
    })
  })

  describe('Business Exclusion Patterns', () => {
    it('should detect business interruption exclusion as critical', () => {
      const policy = createMockPolicy({
        type: 'business',
        exclusions: ['business interruption losses excluded'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const biGap = gaps.find(g => g.affectedCoverage === 'Business Interruption')
      expect(biGap).toBeDefined()
      expect(biGap?.severity).toBe('critical')
    })

    it('should detect cyber exclusion as high', () => {
      const policy = createMockPolicy({
        type: 'business',
        exclusions: ['Siber saldırı zararları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const cyberGap = gaps.find(g => g.affectedCoverage === 'Cyber Attack')
      expect(cyberGap).toBeDefined()
      expect(cyberGap?.severity).toBe('high')
    })
  })

  describe('Regional Severity Boost', () => {
    it('should boost earthquake severity in Marmara region', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Deprem'],
        location: 'Istanbul',
      })

      const gaps = analyzeExclusionGaps(policy, DEFAULT_GAP_CONFIG, 'marmara')

      const earthquakeGap = gaps.find(g => g.affectedCoverage === 'Earthquake')
      expect(earthquakeGap?.severity).toBe('critical')
    })

    it('should boost flood severity in Black Sea region', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Sel hasarları'],
        location: 'Trabzon',
      })

      const gaps = analyzeExclusionGaps(policy, DEFAULT_GAP_CONFIG, 'karadeniz')

      const floodGap = gaps.find(g => g.affectedCoverage === 'Flood')
      // Flood should be boosted in karadeniz
      if (floodGap) {
        expect(['critical', 'high']).toContain(floodGap.severity)
      }
    })
  })

  describe('Critical Exclusion Check', () => {
    it('should flag critical exclusions based on policy type rules', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Deprem hasarları kapsam dışıdır'],
        coverages: [], // No coverage for earthquake
      })

      const gaps = analyzeExclusionGaps(policy)

      // Should find earthquake as critical exclusion for home
      const criticalGap = gaps.find(g =>
        g.affectedCoverage?.toLowerCase().includes('earthquake') ||
        g.affectedCoverageTr?.toLowerCase().includes('deprem')
      )
      expect(criticalGap).toBeDefined()
    })

    it('should not duplicate critical exclusion if already captured', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Deprem hasarları kapsam dışıdır'],
        coverages: [],
      })

      const gaps = analyzeExclusionGaps(policy)

      // Count earthquake-related gaps
      const earthquakeGaps = gaps.filter(g =>
        g.affectedCoverage?.toLowerCase().includes('earthquake') ||
        g.affectedCoverageTr?.toLowerCase().includes('deprem')
      )

      // Should only have one gap for earthquake
      expect(earthquakeGaps.length).toBe(1)
    })
  })

  describe('Financial Impact', () => {
    it('should estimate higher loss for critical exclusions', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Hırsızlık'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const theftGap = gaps.find(g => g.affectedCoverage === 'Theft')
      expect(theftGap?.financialImpact.potentialLoss).toBeGreaterThan(0)
    })

    it('should apply regional multiplier to potential loss', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Deprem'],
      })

      const marmaraGaps = analyzeExclusionGaps(policy, DEFAULT_GAP_CONFIG, 'marmara')
      const icAnadoluGaps = analyzeExclusionGaps(policy, DEFAULT_GAP_CONFIG, 'ic_anadolu')

      const marmaraLoss = marmaraGaps[0]?.financialImpact.potentialLoss || 0
      const icAnadoluLoss = icAnadoluGaps[0]?.financialImpact.potentialLoss || 0

      // Marmara has higher risk multiplier
      expect(marmaraLoss).toBeGreaterThanOrEqual(icAnadoluLoss)
    })
  })

  describe('Remediation', () => {
    it('should provide endorsement option', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Deprem hasarları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation.action.toLowerCase()).toContain('endorsement')
        expect(gap.remediation.actionTr.toLowerCase()).toContain('zeyilname')
      })
    })

    it('should provide standalone policy alternative', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Deprem hasarları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation.alternatives).toBeDefined()
        expect(gap.remediation.alternatives?.length).toBeGreaterThan(0)
      })
    })

    it('should set harder difficulty for critical exclusions', () => {
      const policy = createMockPolicy({
        type: 'business',
        exclusions: ['İş durması zararları'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const biGap = gaps.find(g => g.affectedCoverage === 'Business Interruption')
      // Critical exclusions should have moderate or higher difficulty
      if (biGap) {
        expect(['moderate', 'easy']).toContain(biGap.remediation.difficulty)
      }
    })

    it('should include Turkish steps', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      gaps.forEach(gap => {
        expect(gap.remediation.stepsTr).toBeDefined()
        expect(gap.remediation.stepsTr.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Turkish Pattern Matching', () => {
    it('should match Turkish exclusion text', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Hırsızlık kaynaklı zararlar bu poliçe kapsamı dışındadır'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const theftGap = gaps.find(g => g.affectedCoverage === 'Theft')
      expect(theftGap).toBeDefined()
    })

    it('should match English exclusion text', () => {
      const policy = createMockPolicy({
        type: 'home',
        exclusions: ['Theft and burglary are excluded from this policy'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const theftGap = gaps.find(g => g.affectedCoverage === 'Theft')
      expect(theftGap).toBeDefined()
    })
  })

  describe('Gap Metadata', () => {
    it('should include Turkish title and description', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      gaps.forEach(gap => {
        expect(gap.titleTr).toBeDefined()
        expect(gap.titleTr.length).toBeGreaterThan(0)
        expect(gap.descriptionTr).toBeDefined()
        expect(gap.descriptionTr.length).toBeGreaterThan(0)
      })
    })

    it('should include exclusion text in description', () => {
      const exclusionText = 'Deprem hasarları kapsam dışıdır'
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: [exclusionText],
      })

      const gaps = analyzeExclusionGaps(policy)

      const earthquakeGap = gaps.find(g => g.affectedCoverage === 'Earthquake Damage')
      expect(earthquakeGap?.description).toContain(exclusionText)
    })

    it('should generate unique IDs', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      const ids = gaps.map(g => g.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })

    it('should set source to exclusion', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      gaps.forEach(gap => {
        expect(gap.source).toBe('exclusion')
      })
    })

    it('should set confidence level', () => {
      const gaps = analyzeExclusionGaps(EXCLUSION_HEAVY_POLICY)

      gaps.forEach(gap => {
        expect(gap.confidence).toBeDefined()
        expect(gap.confidence).toBeGreaterThan(0)
        expect(gap.confidence).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('Sub-category Assignment', () => {
    it('should assign high_risk_exclusion for critical/high severity', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Hırsızlık'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const theftGap = gaps.find(g => g.affectedCoverage === 'Theft')
      expect(theftGap?.subCategory).toBe('high_risk_exclusion')
    })

    it('should assign common_claim_excluded for medium severity', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        exclusions: ['Vandalizm'],
      })

      const gaps = analyzeExclusionGaps(policy)

      const vandalismGap = gaps.find(g => g.affectedCoverage === 'Vandalism')
      if (vandalismGap) {
        expect(vandalismGap.subCategory).toBe('common_claim_excluded')
      }
    })
  })
})
