import { describe, it, expect } from 'vitest'
import { signPayload, generateSecret } from '../services/webhook-service.js'

describe('webhook-service', () => {
  describe('signPayload', () => {
    it('should produce consistent HMAC-SHA256 signatures', () => {
      const payload = '{"event":"setting.updated","data":{}}'
      const secret = 'test-secret'

      const sig1 = signPayload(payload, secret)
      const sig2 = signPayload(payload, secret)

      expect(sig1).toBe(sig2)
      expect(sig1).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex = 64 chars
    })

    it('should produce different signatures for different payloads', () => {
      const secret = 'test-secret'
      const sig1 = signPayload('{"a":1}', secret)
      const sig2 = signPayload('{"b":2}', secret)

      expect(sig1).not.toBe(sig2)
    })

    it('should produce different signatures for different secrets', () => {
      const payload = '{"event":"test"}'
      const sig1 = signPayload(payload, 'secret-1')
      const sig2 = signPayload(payload, 'secret-2')

      expect(sig1).not.toBe(sig2)
    })
  })

  describe('generateSecret', () => {
    it('should generate a secret with whsec_ prefix', () => {
      const secret = generateSecret()
      expect(secret.startsWith('whsec_')).toBe(true)
    })

    it('should generate unique secrets', () => {
      const secrets = new Set(Array.from({ length: 10 }, () => generateSecret()))
      expect(secrets.size).toBe(10)
    })

    it('should generate secrets of consistent length', () => {
      const secret = generateSecret()
      // whsec_ (6) + 48 hex chars (24 bytes) = 54
      expect(secret.length).toBe(54)
    })
  })
})
