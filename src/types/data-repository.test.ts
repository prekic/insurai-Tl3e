/**
 * Data Repository Types Tests
 *
 * Tests for data versioning and repository types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createVersion,
  parseVersion,
  compareVersions,
  calculateFreshnessScore,
  needsRefresh,
  DEFAULT_CACHE_DURATION,
} from './data-repository'

describe('Data Repository', () => {
  describe('createVersion', () => {
    it('should create a version object with major, minor, patch', () => {
      const version = createVersion(1, 2, 3)

      expect(version.major).toBe(1)
      expect(version.minor).toBe(2)
      expect(version.patch).toBe(3)
    })

    it('should create toString method', () => {
      const version = createVersion(1, 2, 3)

      expect(version.toString()).toBe('1.2.3')
    })

    it('should handle zeros', () => {
      const version = createVersion(0, 0, 1)

      expect(version.toString()).toBe('0.0.1')
    })

    it('should handle large version numbers', () => {
      const version = createVersion(10, 20, 30)

      expect(version.toString()).toBe('10.20.30')
    })
  })

  describe('parseVersion', () => {
    it('should parse a version string', () => {
      const version = parseVersion('1.2.3')

      expect(version.major).toBe(1)
      expect(version.minor).toBe(2)
      expect(version.patch).toBe(3)
    })

    it('should handle missing parts', () => {
      const version = parseVersion('1.2')

      expect(version.major).toBe(1)
      expect(version.minor).toBe(2)
      expect(version.patch).toBe(0)
    })

    it('should handle single number', () => {
      const version = parseVersion('1')

      expect(version.major).toBe(1)
      expect(version.minor).toBe(0)
      expect(version.patch).toBe(0)
    })

    it('should handle empty string', () => {
      const version = parseVersion('')

      expect(version.major).toBe(0)
      expect(version.minor).toBe(0)
      expect(version.patch).toBe(0)
    })

    it('should have working toString', () => {
      const version = parseVersion('2.1.0')

      expect(version.toString()).toBe('2.1.0')
    })
  })

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      const v1 = createVersion(1, 2, 3)
      const v2 = createVersion(1, 2, 3)

      expect(compareVersions(v1, v2)).toBe(0)
    })

    it('should return -1 when first version is smaller (major)', () => {
      const v1 = createVersion(1, 0, 0)
      const v2 = createVersion(2, 0, 0)

      expect(compareVersions(v1, v2)).toBe(-1)
    })

    it('should return 1 when first version is larger (major)', () => {
      const v1 = createVersion(2, 0, 0)
      const v2 = createVersion(1, 0, 0)

      expect(compareVersions(v1, v2)).toBe(1)
    })

    it('should return -1 when first version is smaller (minor)', () => {
      const v1 = createVersion(1, 1, 0)
      const v2 = createVersion(1, 2, 0)

      expect(compareVersions(v1, v2)).toBe(-1)
    })

    it('should return 1 when first version is larger (minor)', () => {
      const v1 = createVersion(1, 3, 0)
      const v2 = createVersion(1, 2, 0)

      expect(compareVersions(v1, v2)).toBe(1)
    })

    it('should return -1 when first version is smaller (patch)', () => {
      const v1 = createVersion(1, 2, 1)
      const v2 = createVersion(1, 2, 2)

      expect(compareVersions(v1, v2)).toBe(-1)
    })

    it('should return 1 when first version is larger (patch)', () => {
      const v1 = createVersion(1, 2, 5)
      const v2 = createVersion(1, 2, 3)

      expect(compareVersions(v1, v2)).toBe(1)
    })

    it('should prioritize major over minor', () => {
      const v1 = createVersion(2, 0, 0)
      const v2 = createVersion(1, 9, 9)

      expect(compareVersions(v1, v2)).toBe(1)
    })

    it('should prioritize minor over patch', () => {
      const v1 = createVersion(1, 2, 0)
      const v2 = createVersion(1, 1, 9)

      expect(compareVersions(v1, v2)).toBe(1)
    })

    it('should work with parsed versions', () => {
      const v1 = parseVersion('1.2.3')
      const v2 = parseVersion('1.2.4')

      expect(compareVersions(v1, v2)).toBe(-1)
    })
  })

  describe('version sorting', () => {
    it('should sort versions correctly', () => {
      const versions = [
        createVersion(1, 0, 0),
        createVersion(2, 1, 0),
        createVersion(1, 1, 0),
        createVersion(2, 0, 0),
        createVersion(1, 0, 1),
      ]

      const sorted = [...versions].sort(compareVersions)

      expect(sorted[0].toString()).toBe('1.0.0')
      expect(sorted[1].toString()).toBe('1.0.1')
      expect(sorted[2].toString()).toBe('1.1.0')
      expect(sorted[3].toString()).toBe('2.0.0')
      expect(sorted[4].toString()).toBe('2.1.0')
    })
  })

  describe('DEFAULT_CACHE_DURATION', () => {
    it('should be 24 hours in milliseconds', () => {
      expect(DEFAULT_CACHE_DURATION).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('calculateFreshnessScore', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return 0 if effectiveTo date has passed', () => {
      const lastUpdated = new Date('2024-06-10T12:00:00Z').toISOString()
      const effectiveTo = new Date('2024-06-14T12:00:00Z').toISOString() // Yesterday

      expect(calculateFreshnessScore(lastUpdated, effectiveTo)).toBe(0)
    })

    it('should return 100 for data updated within 7 days', () => {
      const threeDaysAgo = new Date('2024-06-12T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(threeDaysAgo)).toBe(100)
    })

    it('should return 100 for data updated exactly 7 days ago', () => {
      const sevenDaysAgo = new Date('2024-06-08T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(sevenDaysAgo)).toBe(100)
    })

    it('should return 90 for data updated within 30 days (but more than 7)', () => {
      const twoWeeksAgo = new Date('2024-06-01T12:00:00Z').toISOString() // 14 days ago
      expect(calculateFreshnessScore(twoWeeksAgo)).toBe(90)
    })

    it('should return 90 for data updated exactly 30 days ago', () => {
      const thirtyDaysAgo = new Date('2024-05-16T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(thirtyDaysAgo)).toBe(90)
    })

    it('should return 70 for data updated within 90 days (but more than 30)', () => {
      const twoMonthsAgo = new Date('2024-04-15T12:00:00Z').toISOString() // ~61 days ago
      expect(calculateFreshnessScore(twoMonthsAgo)).toBe(70)
    })

    it('should return 70 for data updated exactly 90 days ago', () => {
      const ninetyDaysAgo = new Date('2024-03-17T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(ninetyDaysAgo)).toBe(70)
    })

    it('should return 50 for data updated within 180 days (but more than 90)', () => {
      const fourMonthsAgo = new Date('2024-02-15T12:00:00Z').toISOString() // ~121 days ago
      expect(calculateFreshnessScore(fourMonthsAgo)).toBe(50)
    })

    it('should return 50 for data updated exactly 180 days ago', () => {
      const oneEightyDaysAgo = new Date('2023-12-18T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(oneEightyDaysAgo)).toBe(50)
    })

    it('should return 30 for data updated within 365 days (but more than 180)', () => {
      const tenMonthsAgo = new Date('2023-08-15T12:00:00Z').toISOString() // ~305 days ago
      expect(calculateFreshnessScore(tenMonthsAgo)).toBe(30)
    })

    it('should return 30 for data updated exactly 365 days ago', () => {
      // Use exact day math to avoid leap year issues
      const now = new Date('2024-06-15T12:00:00Z')
      const exactlyOneYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      expect(calculateFreshnessScore(exactlyOneYear.toISOString())).toBe(30)
    })

    it('should return 10 for data older than 365 days', () => {
      const twoYearsAgo = new Date('2022-06-15T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(twoYearsAgo)).toBe(10)
    })

    it('should ignore effectiveTo if it has not passed', () => {
      const threeDaysAgo = new Date('2024-06-12T12:00:00Z').toISOString()
      const futureDate = new Date('2024-12-31T12:00:00Z').toISOString()

      expect(calculateFreshnessScore(threeDaysAgo, futureDate)).toBe(100)
    })

    it('should handle today as lastUpdated', () => {
      const today = new Date('2024-06-15T12:00:00Z').toISOString()
      expect(calculateFreshnessScore(today)).toBe(100)
    })
  })

  describe('needsRefresh', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true when data is older than maxAgeDays', () => {
      const metadata = {
        lastUpdated: new Date('2024-05-01T12:00:00Z').toISOString(), // 45 days ago
      }
      expect(needsRefresh(metadata as never, 30)).toBe(true)
    })

    it('should return false when data is newer than maxAgeDays', () => {
      const metadata = {
        lastUpdated: new Date('2024-06-10T12:00:00Z').toISOString(), // 5 days ago
      }
      expect(needsRefresh(metadata as never, 30)).toBe(false)
    })

    it('should use default 30 days when maxAgeDays not provided', () => {
      const metadata = {
        lastUpdated: new Date('2024-05-10T12:00:00Z').toISOString(), // 36 days ago
      }
      expect(needsRefresh(metadata as never)).toBe(true)
    })

    it('should return false when exactly at maxAgeDays boundary', () => {
      const metadata = {
        lastUpdated: new Date('2024-05-16T12:00:00Z').toISOString(), // exactly 30 days ago
      }
      // At exactly 30 days, Date.now() - lastUpdated equals maxAge, not greater
      expect(needsRefresh(metadata as never, 30)).toBe(false)
    })

    it('should return true when just past maxAgeDays boundary', () => {
      const metadata = {
        lastUpdated: new Date('2024-05-16T11:59:59Z').toISOString(), // just over 30 days ago
      }
      expect(needsRefresh(metadata as never, 30)).toBe(true)
    })

    it('should work with custom maxAgeDays', () => {
      const metadata = {
        lastUpdated: new Date('2024-06-08T12:00:00Z').toISOString(), // 7 days ago
      }
      expect(needsRefresh(metadata as never, 7)).toBe(false)
      expect(needsRefresh(metadata as never, 5)).toBe(true)
    })
  })
})
