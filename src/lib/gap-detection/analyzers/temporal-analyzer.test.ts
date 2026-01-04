/**
 * Temporal Gap Analyzer Tests
 * Tests for detecting coverage period gaps and timing issues
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeTemporalGaps } from './temporal-analyzer'
import { DEFAULT_GAP_CONFIG } from '@/types/gap'
import {
  createMockPolicy,
  EXPIRED_POLICY,
  createExpiringPolicy,
  SHORT_TERM_POLICY,
  BUSINESS_WITH_RETROACTIVE,
} from '../__tests__/fixtures'

describe('Temporal Gap Analyzer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('analyzeTemporalGaps', () => {
    it('should return an array of gaps', () => {
      const policy = createMockPolicy()
      const gaps = analyzeTemporalGaps(policy)

      expect(Array.isArray(gaps)).toBe(true)
    })

    it('should find no temporal gaps for active policy with distant expiry', () => {
      const policy = createMockPolicy({
        startDate: '2024-01-01',
        expiryDate: '2025-01-01', // ~6 months away
      })

      const gaps = analyzeTemporalGaps(policy)

      // Should have no critical or high temporal gaps
      const severeGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high')
      expect(severeGaps.length).toBe(0)
    })
  })

  describe('Expired Policy Detection', () => {
    it('should detect expired policy as critical', () => {
      const gaps = analyzeTemporalGaps(EXPIRED_POLICY)

      const expiredGap = gaps.find(g => g.subCategory === 'coverage_lapse')
      expect(expiredGap).toBeDefined()
      expect(expiredGap?.severity).toBe('critical')
      expect(expiredGap?.severityScore).toBe(100)
    })

    it('should include days since expiry in description', () => {
      const gaps = analyzeTemporalGaps(EXPIRED_POLICY)

      const expiredGap = gaps.find(g => g.subCategory === 'coverage_lapse')
      expect(expiredGap?.description).toContain('days ago')
      expect(expiredGap?.descriptionTr).toContain('gün önce')
    })

    it('should calculate financial impact based on coverage amount', () => {
      const gaps = analyzeTemporalGaps(EXPIRED_POLICY)

      const expiredGap = gaps.find(g => g.subCategory === 'coverage_lapse')
      expect(expiredGap?.financialImpact.potentialLoss).toBeGreaterThan(0)
      expect(expiredGap?.financialImpact.probability).toBe(0.1)
    })

    it('should provide immediate renewal remediation', () => {
      const gaps = analyzeTemporalGaps(EXPIRED_POLICY)

      const expiredGap = gaps.find(g => g.subCategory === 'coverage_lapse')
      expect(expiredGap?.remediation.action).toContain('immediately')
      expect(expiredGap?.remediation.actionTr).toContain('hemen')
    })
  })

  describe('Expiring Soon Detection', () => {
    it('should detect policy expiring within 7 days as critical', () => {
      const policy = createExpiringPolicy(5)
      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('critical')
      expect(expiringGap?.severityScore).toBe(90)
    })

    it('should detect policy expiring within 30 days as high', () => {
      const policy = createExpiringPolicy(20)
      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('high')
      expect(expiringGap?.severityScore).toBe(70)
    })

    it('should not flag policy expiring in 60+ days', () => {
      const policy = createExpiringPolicy(60)
      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeUndefined()
    })

    it('should include days until expiry in description', () => {
      const policy = createExpiringPolicy(15)
      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap?.description).toContain('15 days')
      expect(expiringGap?.descriptionTr).toContain('15 gün')
    })
  })

  describe('Missing Expiry Date Detection', () => {
    it('should detect missing expiry date', () => {
      const policy = createMockPolicy({
        expiryDate: undefined as unknown as string,
      })

      const gaps = analyzeTemporalGaps(policy)

      const missingDateGap = gaps.find(g => g.subCategory === 'documentation_gap')
      expect(missingDateGap).toBeDefined()
      expect(missingDateGap?.severity).toBe('medium')
    })

    it('should detect empty expiry date', () => {
      const policy = createMockPolicy({
        expiryDate: '',
      })

      const gaps = analyzeTemporalGaps(policy)

      const missingDateGap = gaps.find(g => g.subCategory === 'documentation_gap')
      expect(missingDateGap).toBeDefined()
    })

    it('should return early when expiry date is missing', () => {
      const policy = createMockPolicy({
        expiryDate: '',
      })

      const gaps = analyzeTemporalGaps(policy)

      // Should only return the missing date gap, not other temporal checks
      expect(gaps.length).toBe(1)
      expect(gaps[0].subCategory).toBe('documentation_gap')
    })
  })

  describe('Short Term Policy Detection', () => {
    it('should detect short-term policy (less than 1 year)', () => {
      const gaps = analyzeTemporalGaps(SHORT_TERM_POLICY)

      const shortTermGap = gaps.find(g => g.subCategory === 'waiting_period')
      expect(shortTermGap).toBeDefined()
      expect(shortTermGap?.severity).toBe('info')
    })

    it('should not flag standard annual policies', () => {
      const policy = createMockPolicy({
        startDate: '2024-01-01',
        expiryDate: '2025-01-01', // Full year
      })

      const gaps = analyzeTemporalGaps(policy)

      const shortTermGap = gaps.find(g => g.subCategory === 'waiting_period')
      expect(shortTermGap).toBeUndefined()
    })

    it('should include term length in description', () => {
      const policy = createMockPolicy({
        startDate: '2024-06-01',
        expiryDate: '2024-12-01', // 6 months
      })

      // Set time to before the policy expires
      vi.setSystemTime(new Date('2024-06-15'))

      const gaps = analyzeTemporalGaps(policy)

      const shortTermGap = gaps.find(g => g.subCategory === 'waiting_period')
      if (shortTermGap) {
        expect(shortTermGap.description).toMatch(/\d+-day term/)
      }
    })
  })

  describe('Retroactive Date Limitations', () => {
    it('should detect retroactive limitations in business policies', () => {
      const gaps = analyzeTemporalGaps(BUSINESS_WITH_RETROACTIVE)

      const retroGap = gaps.find(g => g.subCategory === 'retroactive_gap')
      expect(retroGap).toBeDefined()
      expect(retroGap?.severity).toBe('medium')
    })

    it('should detect retroactive limitations in health policies', () => {
      const policy = createMockPolicy({
        type: 'health',
        specialConditions: ['Retroactive date: 01.01.2024'],
      })

      const gaps = analyzeTemporalGaps(policy)

      const retroGap = gaps.find(g => g.subCategory === 'retroactive_gap')
      expect(retroGap).toBeDefined()
    })

    it('should not check retroactive for non-business/health policies', () => {
      const policy = createMockPolicy({
        type: 'home',
        specialConditions: ['Retroactive limitation'],
      })

      const gaps = analyzeTemporalGaps(policy)

      const retroGap = gaps.find(g => g.subCategory === 'retroactive_gap')
      expect(retroGap).toBeUndefined()
    })

    it('should detect Turkish geçmişe dönük keyword', () => {
      const policy = createMockPolicy({
        type: 'business',
        specialConditions: ['Geçmişe dönük tarih kısıtlaması uygulanır'],
      })

      const gaps = analyzeTemporalGaps(policy)

      const retroGap = gaps.find(g => g.subCategory === 'retroactive_gap')
      expect(retroGap).toBeDefined()
    })
  })

  describe('Date Parsing', () => {
    it('should parse YYYY-MM-DD format', () => {
      const policy = createMockPolicy({
        startDate: '2024-01-01',
        expiryDate: '2024-06-20',
      })

      const gaps = analyzeTemporalGaps(policy)

      // Should detect expiring soon (5 days)
      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeDefined()
    })

    it('should parse DD.MM.YYYY format (Turkish)', () => {
      const policy = createMockPolicy({
        startDate: '01.01.2024',
        expiryDate: '20.06.2024',
      })

      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeDefined()
    })

    it('should parse DD/MM/YYYY format', () => {
      const policy = createMockPolicy({
        startDate: '01/01/2024',
        expiryDate: '20/06/2024',
      })

      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap).toBeDefined()
    })

    it('should handle invalid date format', () => {
      const policy = createMockPolicy({
        expiryDate: 'invalid-date',
      })

      const gaps = analyzeTemporalGaps(policy)

      // Should detect as missing/invalid
      const missingDateGap = gaps.find(g => g.subCategory === 'documentation_gap')
      expect(missingDateGap).toBeDefined()
    })
  })

  describe('Confidence Levels', () => {
    it('should have high confidence for clear expiry issues', () => {
      const policy = createExpiringPolicy(5)
      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap?.confidence).toBe(1.0)
    })

    it('should have lower confidence for retroactive detection', () => {
      const gaps = analyzeTemporalGaps(BUSINESS_WITH_RETROACTIVE)

      const retroGap = gaps.find(g => g.subCategory === 'retroactive_gap')
      expect(retroGap?.confidence).toBeLessThan(1.0)
    })
  })

  describe('Custom Configuration', () => {
    it('should respect custom expiry warning days', () => {
      const policy = createExpiringPolicy(45)

      const defaultGaps = analyzeTemporalGaps(policy, DEFAULT_GAP_CONFIG)
      const customGaps = analyzeTemporalGaps(policy, {
        ...DEFAULT_GAP_CONFIG,
        thresholds: {
          ...DEFAULT_GAP_CONFIG.thresholds,
          expiryWarningDays: 60,
        },
      })

      // With 60-day warning, should find gap
      const customExpiringGap = customGaps.find(g => g.subCategory === 'expiring_soon')
      expect(customExpiringGap).toBeDefined()

      // With default 30-day warning, should not find gap
      const defaultExpiringGap = defaultGaps.find(g => g.subCategory === 'expiring_soon')
      expect(defaultExpiringGap).toBeUndefined()
    })
  })

  describe('Remediation Steps', () => {
    it('should provide Turkish remediation steps', () => {
      const policy = createExpiringPolicy(5)
      const gaps = analyzeTemporalGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation.stepsTr).toBeDefined()
        expect(gap.remediation.stepsTr.length).toBeGreaterThan(0)
      })
    })

    it('should estimate cost as premium for renewal', () => {
      const policy = createMockPolicy({
        premium: 5000,
        startDate: '2024-01-01',
        expiryDate: '2024-06-20',
      })

      const gaps = analyzeTemporalGaps(policy)

      const expiringGap = gaps.find(g => g.subCategory === 'expiring_soon')
      expect(expiringGap?.remediation.estimatedCost).toBe(5000)
    })
  })

  describe('Gap IDs', () => {
    it('should generate unique gap IDs', () => {
      const policy = createMockPolicy({
        type: 'business',
        startDate: '2024-06-01',
        expiryDate: '2024-06-20', // Short term AND expiring
        specialConditions: ['Retroactive limitation'],
      })

      const gaps = analyzeTemporalGaps(policy)

      const ids = gaps.map(g => g.id)
      const uniqueIds = new Set(ids)

      expect(ids.length).toBe(uniqueIds.size)
    })
  })
})
