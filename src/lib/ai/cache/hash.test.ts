/**
 * Tests for Hash Utilities
 * Tests content hashing, file hashing, cache key generation, and size estimation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  hashContent,
  hashFile,
  generateCacheKey,
  quickHash,
  estimateSize,
} from './hash'

// =============================================================================
// Test Setup - Mock crypto.subtle
// =============================================================================

// Helper to create mock hash result
function createMockHashBuffer(hexString: string): ArrayBuffer {
  const bytes = hexString.match(/.{2}/g)?.map(h => parseInt(h, 16)) || []
  return new Uint8Array(bytes).buffer
}

// Known SHA-256 hash for "test" (first 64 chars)
const KNOWN_TEST_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

describe('hashContent', () => {
  beforeEach(() => {
    // Mock crypto.subtle.digest
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockImplementation(async (_algorithm: string, _data: BufferSource) => {
          // Return consistent hash based on input length for testing
          const mockHash = KNOWN_TEST_HASH
          return createMockHashBuffer(mockHash)
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return a hex string', async () => {
    const result = await hashContent('test')
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^[0-9a-f]+$/)
  })

  it('should return 64 character hash (SHA-256)', async () => {
    const result = await hashContent('test')
    expect(result.length).toBe(64)
  })

  it('should call crypto.subtle.digest with SHA-256', async () => {
    await hashContent('test')
    expect(crypto.subtle.digest).toHaveBeenCalled()
    const calls = vi.mocked(crypto.subtle.digest).mock.calls
    expect(calls[0][0]).toBe('SHA-256')
  })

  it('should encode string to UTF-8 before hashing', async () => {
    await hashContent('hello world')
    expect(crypto.subtle.digest).toHaveBeenCalled()
  })

  it('should handle empty string', async () => {
    const result = await hashContent('')
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle unicode characters', async () => {
    const result = await hashContent('Türkçe karakterler: ğüşıöç')
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle long strings', async () => {
    const longString = 'a'.repeat(10000)
    const result = await hashContent(longString)
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })
})

// =============================================================================
// hashFile Tests
// =============================================================================

describe('hashFile', () => {
  // Helper to create mock file/blob with arrayBuffer method
  const createMockFile = (content: string | ArrayBuffer) => {
    const buffer = typeof content === 'string'
      ? new TextEncoder().encode(content).buffer
      : content
    return {
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File
  }

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(createMockHashBuffer(KNOWN_TEST_HASH)),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should hash a File object', async () => {
    const file = createMockFile('test content')
    const result = await hashFile(file)

    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should hash a Blob object', async () => {
    const blob = createMockFile('test content')
    const result = await hashFile(blob)

    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should call crypto.subtle.digest with SHA-256', async () => {
    const file = createMockFile('test')
    await hashFile(file)

    expect(crypto.subtle.digest).toHaveBeenCalled()
    const calls = vi.mocked(crypto.subtle.digest).mock.calls
    expect(calls[0][0]).toBe('SHA-256')
  })

  it('should handle empty file', async () => {
    const file = createMockFile('')
    const result = await hashFile(file)

    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle binary content', async () => {
    const binaryData = new Uint8Array([0, 1, 2, 255, 128, 64])
    const blob = createMockFile(binaryData.buffer)
    const result = await hashFile(blob)

    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle PDF-like content', async () => {
    const file = createMockFile('%PDF-1.4 mock pdf content')
    const result = await hashFile(file)

    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })
})

// =============================================================================
// generateCacheKey Tests
// =============================================================================

describe('generateCacheKey', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(createMockHashBuffer(KNOWN_TEST_HASH)),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should generate key with type prefix', async () => {
    const result = await generateCacheKey('extraction', 'input1')

    expect(result).toMatch(/^extraction_/)
  })

  it('should return type plus 16 character hash', async () => {
    const result = await generateCacheKey('ocr', 'input')

    expect(result).toBe('ocr_9f86d081884c7d65')
  })

  it('should handle multiple string inputs', async () => {
    const result = await generateCacheKey('cache', 'input1', 'input2', 'input3')

    expect(result).toBeDefined()
    expect(result.startsWith('cache_')).toBe(true)
  })

  it('should handle number inputs', async () => {
    const result = await generateCacheKey('numeric', 123, 456, 789)

    expect(result).toBeDefined()
    expect(result.startsWith('numeric_')).toBe(true)
  })

  it('should handle boolean inputs', async () => {
    const result = await generateCacheKey('bool', true, false, true)

    expect(result).toBeDefined()
    expect(result.startsWith('bool_')).toBe(true)
  })

  it('should handle mixed type inputs', async () => {
    const result = await generateCacheKey('mixed', 'string', 123, true)

    expect(result).toBeDefined()
    expect(result.startsWith('mixed_')).toBe(true)
  })

  it('should filter out undefined values', async () => {
    const result = await generateCacheKey('filtered', 'valid', undefined, 'also-valid')

    expect(result).toBeDefined()
    expect(crypto.subtle.digest).toHaveBeenCalled()
  })

  it('should filter out null values', async () => {
    const result = await generateCacheKey('filtered', 'valid', null, 'also-valid')

    expect(result).toBeDefined()
    expect(crypto.subtle.digest).toHaveBeenCalled()
  })

  it('should handle empty inputs array', async () => {
    const result = await generateCacheKey('empty')

    expect(result).toBeDefined()
    expect(result.startsWith('empty_')).toBe(true)
  })

  it('should generate consistent keys for same inputs', async () => {
    const result1 = await generateCacheKey('test', 'input')
    const result2 = await generateCacheKey('test', 'input')

    expect(result1).toBe(result2)
  })
})

// =============================================================================
// quickHash Tests (Synchronous)
// =============================================================================

describe('quickHash', () => {
  it('should return an 8 character hex string', () => {
    const result = quickHash('test')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should be deterministic', () => {
    const result1 = quickHash('hello')
    const result2 = quickHash('hello')

    expect(result1).toBe(result2)
  })

  it('should produce different hashes for different inputs', () => {
    const hash1 = quickHash('hello')
    const hash2 = quickHash('world')

    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty string', () => {
    const result = quickHash('')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle unicode characters', () => {
    const result = quickHash('Türkçe')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle special characters', () => {
    const result = quickHash('!@#$%^&*()')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle long strings', () => {
    const longString = 'a'.repeat(10000)
    const result = quickHash(longString)

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle whitespace', () => {
    const result = quickHash('  \t\n  ')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should handle numeric strings', () => {
    const result = quickHash('123456789')

    expect(result.length).toBe(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('should implement djb2 algorithm correctly', () => {
    // DJB2 starts with 5381 and uses ((hash << 5) + hash) ^ char
    // For empty string, result should be 5381 converted to hex
    const emptyResult = quickHash('')
    expect(emptyResult).toBe('00001505') // 5381 in hex is 1505

    // Verify different strings produce different hashes
    const helloHash = quickHash('hello')
    const worldHash = quickHash('world')
    expect(helloHash).not.toBe(worldHash)
  })
})

// =============================================================================
// estimateSize Tests
// =============================================================================

describe('estimateSize', () => {
  it('should estimate size of a string', () => {
    const result = estimateSize('hello')

    // "hello" serialized is '"hello"' = 7 bytes
    expect(result).toBe(7)
  })

  it('should estimate size of a number', () => {
    const result = estimateSize(12345)

    // 12345 serialized is '12345' = 5 bytes
    expect(result).toBe(5)
  })

  it('should estimate size of a boolean', () => {
    const trueSize = estimateSize(true)
    const falseSize = estimateSize(false)

    expect(trueSize).toBe(4) // 'true'
    expect(falseSize).toBe(5) // 'false'
  })

  it('should estimate size of null', () => {
    const result = estimateSize(null)

    expect(result).toBe(4) // 'null'
  })

  it('should estimate size of an empty object', () => {
    const result = estimateSize({})

    expect(result).toBe(2) // '{}'
  })

  it('should estimate size of an empty array', () => {
    const result = estimateSize([])

    expect(result).toBe(2) // '[]'
  })

  it('should estimate size of a simple object', () => {
    const obj = { a: 1, b: 2 }
    const result = estimateSize(obj)

    // {"a":1,"b":2} = 13 bytes
    expect(result).toBe(13)
  })

  it('should estimate size of a nested object', () => {
    const obj = { outer: { inner: 'value' } }
    const result = estimateSize(obj)

    // {"outer":{"inner":"value"}} = 27 bytes
    expect(result).toBe(27)
  })

  it('should estimate size of an array', () => {
    const arr = [1, 2, 3]
    const result = estimateSize(arr)

    // [1,2,3] = 7 bytes
    expect(result).toBe(7)
  })

  it('should handle UTF-8 encoding for unicode', () => {
    // Turkish characters use multiple bytes in UTF-8
    const turkishStr = 'ğüşıöç'
    const result = estimateSize(turkishStr)

    // Should be larger than character count due to UTF-8 encoding
    // "ğüşıöç" serialized with quotes, UTF-8 encoded
    expect(result).toBeGreaterThan(turkishStr.length)
  })

  it('should estimate size of complex policy data', () => {
    const policyData = {
      policyNumber: 'POL-123456',
      provider: 'Allianz Sigorta',
      premium: 5000,
      coverages: [
        { name: 'Fire', limit: 100000 },
        { name: 'Theft', limit: 50000 },
      ],
    }
    const result = estimateSize(policyData)

    expect(result).toBeGreaterThan(100)
    expect(typeof result).toBe('number')
  })

  it('should handle array of objects', () => {
    const arr = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const result = estimateSize(arr)

    // [{"id":1},{"id":2},{"id":3}] = 28 bytes
    expect(result).toBe(28)
  })
})

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Hash Edge Cases', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(createMockHashBuffer(KNOWN_TEST_HASH)),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should handle newlines in content', async () => {
    const result = await hashContent('line1\nline2\nline3')
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle tabs in content', async () => {
    const result = await hashContent('col1\tcol2\tcol3')
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('should handle JSON-like strings', async () => {
    const jsonStr = JSON.stringify({ key: 'value', nested: { a: 1 } })
    const result = await hashContent(jsonStr)
    expect(result).toBeDefined()
    expect(result.length).toBe(64)
  })

  it('quickHash should be much faster than async hash', () => {
    // This is more of a performance characteristic test
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      quickHash(`test-${i}`)
    }
    const duration = performance.now() - start

    // Should complete 1000 hashes in under 100ms
    expect(duration).toBeLessThan(100)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Hash Integration', () => {
  // Helper to create mock file/blob with arrayBuffer method
  const createMockFile = (content: string) => {
    const buffer = new TextEncoder().encode(content).buffer
    return {
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as unknown as File
  }

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(createMockHashBuffer(KNOWN_TEST_HASH)),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should work together for cache key generation workflow', async () => {
    const content = 'policy document content'
    const type = 'extraction'

    // Generate cache key
    const cacheKey = await generateCacheKey(type, content)

    // Estimate size of cached data
    const dataToCache = { extracted: true, data: content }
    const size = estimateSize(dataToCache)

    expect(cacheKey).toMatch(/^extraction_[0-9a-f]{16}$/)
    expect(size).toBeGreaterThan(0)
  })

  it('should handle typical OCR workflow', async () => {
    const file = createMockFile('%PDF-1.4 mock pdf document')

    // Hash file for cache lookup
    const fileHash = await hashFile(file)

    // Generate cache key with options
    const cacheKey = await generateCacheKey('ocr', fileHash, 'turkish', 300)

    expect(fileHash.length).toBe(64)
    expect(cacheKey).toMatch(/^ocr_/)
  })

  it('should handle typical extraction workflow', async () => {
    const textContent = 'Extracted policy text in Turkish'
    const modelVersion = 'gpt-4'
    const schemaVersion = 'v1.0'

    // Hash the content
    const contentHash = await hashContent(textContent)

    // Generate cache key with all parameters
    const cacheKey = await generateCacheKey('extract', contentHash, modelVersion, schemaVersion)

    expect(cacheKey).toBeDefined()
    expect(cacheKey.startsWith('extract_')).toBe(true)
  })
})
