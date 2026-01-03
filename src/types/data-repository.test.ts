/**
 * Data Repository Types Tests
 *
 * Tests for data versioning and repository types
 */

import { describe, it, expect } from 'vitest'
import {
  createVersion,
  parseVersion,
  compareVersions,
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
})
