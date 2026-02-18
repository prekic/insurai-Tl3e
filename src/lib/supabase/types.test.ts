import { describe, it, expect } from 'vitest'
import {
  isChatProvider,
  isChatMessageRole,
  isPolicyType,
  isPolicyStatus,
  isVersionChangeType,
} from './types'

describe('Type Guards', () => {
  describe('isChatProvider', () => {
    it('should return true for valid chat providers', () => {
      expect(isChatProvider('openai')).toBe(true)
      expect(isChatProvider('anthropic')).toBe(true)
    })

    it('should return false for invalid values', () => {
      expect(isChatProvider('google')).toBe(false)
      expect(isChatProvider('')).toBe(false)
      expect(isChatProvider(null)).toBe(false)
      expect(isChatProvider(undefined)).toBe(false)
      expect(isChatProvider(123)).toBe(false)
      expect(isChatProvider({})).toBe(false)
      expect(isChatProvider(true)).toBe(false)
    })
  })

  describe('isChatMessageRole', () => {
    it('should return true for valid roles', () => {
      expect(isChatMessageRole('user')).toBe(true)
      expect(isChatMessageRole('assistant')).toBe(true)
      expect(isChatMessageRole('system')).toBe(true)
    })

    it('should return false for invalid values', () => {
      expect(isChatMessageRole('admin')).toBe(false)
      expect(isChatMessageRole('')).toBe(false)
      expect(isChatMessageRole(null)).toBe(false)
      expect(isChatMessageRole(undefined)).toBe(false)
      expect(isChatMessageRole(42)).toBe(false)
    })
  })

  describe('isPolicyType', () => {
    it('should return true for all valid policy types', () => {
      expect(isPolicyType('kasko')).toBe(true)
      expect(isPolicyType('traffic')).toBe(true)
      expect(isPolicyType('home')).toBe(true)
      expect(isPolicyType('health')).toBe(true)
      expect(isPolicyType('life')).toBe(true)
      expect(isPolicyType('dask')).toBe(true)
      expect(isPolicyType('business')).toBe(true)
      expect(isPolicyType('nakliyat')).toBe(true)
    })

    it('should return false for invalid values', () => {
      expect(isPolicyType('auto')).toBe(false)
      expect(isPolicyType('fire')).toBe(false)
      expect(isPolicyType('')).toBe(false)
      expect(isPolicyType(null)).toBe(false)
      expect(isPolicyType(undefined)).toBe(false)
      expect(isPolicyType(123)).toBe(false)
      expect(isPolicyType([])).toBe(false)
    })
  })

  describe('isPolicyStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isPolicyStatus('active')).toBe(true)
      expect(isPolicyStatus('expiring')).toBe(true)
      expect(isPolicyStatus('expired')).toBe(true)
      expect(isPolicyStatus('pending')).toBe(true)
    })

    it('should return false for invalid values', () => {
      expect(isPolicyStatus('cancelled')).toBe(false)
      expect(isPolicyStatus('draft')).toBe(false)
      expect(isPolicyStatus('')).toBe(false)
      expect(isPolicyStatus(null)).toBe(false)
      expect(isPolicyStatus(undefined)).toBe(false)
      expect(isPolicyStatus(0)).toBe(false)
    })
  })

  describe('isVersionChangeType', () => {
    it('should return true for valid change types', () => {
      expect(isVersionChangeType('created')).toBe(true)
      expect(isVersionChangeType('updated')).toBe(true)
      expect(isVersionChangeType('extracted')).toBe(true)
      expect(isVersionChangeType('manual_edit')).toBe(true)
    })

    it('should return false for invalid values', () => {
      expect(isVersionChangeType('deleted')).toBe(false)
      expect(isVersionChangeType('archived')).toBe(false)
      expect(isVersionChangeType('')).toBe(false)
      expect(isVersionChangeType(null)).toBe(false)
      expect(isVersionChangeType(undefined)).toBe(false)
      expect(isVersionChangeType(true)).toBe(false)
    })
  })
})
