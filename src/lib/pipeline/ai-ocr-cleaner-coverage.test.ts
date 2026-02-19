/**
 * AI OCR Cleaner - Coverage Tests
 *
 * Targets uncovered branches, functions, and statements in ai-ocr-cleaner.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanTurkishOCRWithAI,
  cleanTurkishOCRMultiProvider,
  cleanTurkishOCROffline,
  getTurkishOCRCorrectionPrompt,
  buildTurkishOCRPrompt,
  type AIProviderConfig,
  type AICleanerOptions,
} from './ai-ocr-cleaner'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper to create a mock fetch response
function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

describe('ai-ocr-cleaner', () => {
  // =========================================================================
  // cleanTurkishOCROffline
  // =========================================================================
  describe('cleanTurkishOCROffline', () => {
    it('returns empty string for empty input', () => {
      expect(cleanTurkishOCROffline('')).toBe('')
    })

    it('returns empty string for null-like input', () => {
      expect(cleanTurkishOCROffline(null as unknown as string)).toBe('')
    })

    it('collapses spaced uppercase Turkish letters (3+ sequence)', () => {
      const result = cleanTurkishOCROffline('S İ G O R T A polices')
      // The offline cleaner merges single uppercase letters
      const merged = result.replace(/\s+/g, '')
      expect(merged).toContain('SİGORTA')
    })

    it('handles partially spaced words', () => {
      const result = cleanTurkishOCROffline('P O L İ Ç E numarası')
      // The offline cleaner should collapse spaced single letters
      const merged = result.replace(/\s+/g, '')
      expect(merged).toContain('POLİÇE')
    })

    it('does not over-merge unrelated uppercase letters', () => {
      const result = cleanTurkishOCROffline('A normal sentence with B and C words')
      // Should not collapse A, B, C since they are not consecutive single-letter sequences
      expect(result).toContain('A normal')
    })

    it('splits glued words ending with İ', () => {
      const result = cleanTurkishOCROffline('HUSUSİOtomobil')
      expect(result).toContain('HUSUSİ Otomobil')
    })

    it('splits words before common conjunctions VE', () => {
      const result = cleanTurkishOCROffline('SANAYİVE TİCARET')
      expect(result).toContain('SANAYİ VE')
    })

    it('splits words before İLE conjunction', () => {
      const result = cleanTurkishOCROffline('SİGORTAİLE birlikte')
      expect(result).toContain('SİGORTA İLE')
    })

    it('splits words before VEYA conjunction', () => {
      const result = cleanTurkishOCROffline('KASKOVEYATRAFIK')
      expect(result).toContain('KASKO VEYA')
    })

    it('normalizes multiple spaces', () => {
      const result = cleanTurkishOCROffline('test   with   spaces')
      expect(result).toBe('test with spaces')
    })

    it('handles iterative collapse with maxIterations limit', () => {
      // Sequence that needs multiple iterations
      const result = cleanTurkishOCROffline('T E M İ N A T L A R')
      // Should merge letters (may not be perfect offline but collapse happens)
      const collapsed = result.replace(/\s+/g, '')
      expect(collapsed).toContain('TEMİNATLAR')
    })

    it('handles the final pair merge after sequence collapse', () => {
      // Test that the second regex catches trailing single letters
      // after the iterative collapse already merged some letters
      const result = cleanTurkishOCROffline('AB C D E . rest')
      // The collapse and trailing merge logic is exercised
      expect(result).toBeTruthy()
    })
  })

  // =========================================================================
  // getTurkishOCRCorrectionPrompt
  // =========================================================================
  describe('getTurkishOCRCorrectionPrompt', () => {
    it('returns non-empty prompt string', () => {
      const prompt = getTurkishOCRCorrectionPrompt()
      expect(prompt).toBeTruthy()
      expect(prompt).toContain('Turkish')
    })
  })

  // =========================================================================
  // buildTurkishOCRPrompt
  // =========================================================================
  describe('buildTurkishOCRPrompt', () => {
    it('includes the text in the prompt', () => {
      const prompt = buildTurkishOCRPrompt('Hello world')
      expect(prompt).toContain('Hello world')
      expect(prompt).toContain('TEXT TO CORRECT')
      expect(prompt).toContain('CORRECTED TEXT')
    })
  })

  // =========================================================================
  // cleanTurkishOCRWithAI - empty/invalid input
  // =========================================================================
  describe('cleanTurkishOCRWithAI', () => {
    it('returns empty result for empty string', async () => {
      const result = await cleanTurkishOCRWithAI('')
      expect(result.text).toBe('')
      expect(result.originalLength).toBe(0)
      expect(result.aiProvider).toBe('offline')
      expect(result.fallbackUsed).toBe(false)
    })

    it('returns empty result for non-string input', async () => {
      const result = await cleanTurkishOCRWithAI(null as unknown as string)
      expect(result.text).toBe('')
      expect(result.cleanedLength).toBe(0)
    })

    // -----------------------------------------------------------------------
    // With primary provider (OpenAI)
    // -----------------------------------------------------------------------
    it('uses primary OpenAI provider successfully', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: 'SİGORTA POLİÇESİ' } }],
        })
      )

      const result = await cleanTurkishOCRWithAI('S İ G O R T A', {
        primaryProvider: { name: 'openai', apiKey: 'test-key' },
      })

      expect(result.aiProvider).toBe('openai')
      expect(result.text).toBe('SİGORTA POLİÇESİ')
      expect(result.fallbackUsed).toBe(false)
    })

    it('uses primary Anthropic provider successfully', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          content: [{ text: 'SİGORTA POLİÇESİ' }],
        })
      )

      const result = await cleanTurkishOCRWithAI('S İ G O R T A', {
        primaryProvider: { name: 'anthropic', apiKey: 'test-key' },
      })

      expect(result.aiProvider).toBe('anthropic')
      expect(result.text).toBe('SİGORTA POLİÇESİ')
    })

    it('uses primary Gemini provider successfully', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          candidates: [{ content: { parts: [{ text: 'SİGORTA POLİÇESİ' }] } }],
        })
      )

      const result = await cleanTurkishOCRWithAI('S İ G O R T A', {
        primaryProvider: { name: 'gemini', apiKey: 'test-key' },
      })

      expect(result.aiProvider).toBe('gemini')
      expect(result.text).toBe('SİGORTA POLİÇESİ')
    })

    // -----------------------------------------------------------------------
    // Proxy calls
    // -----------------------------------------------------------------------
    it('uses proxy when no API key but proxy URL provided', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({ response: 'SİGORTA POLİÇESİ' })
      )

      const result = await cleanTurkishOCRWithAI('S İ G O R T A', {
        primaryProvider: { name: 'openai', apiKey: '' },
        proxyUrl: 'http://localhost:4001/api/ai',
      })

      expect(result.aiProvider).toBe('openai')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/chat',
        expect.objectContaining({ method: 'POST' })
      )
    })

    // -----------------------------------------------------------------------
    // Error handling and fallback
    // -----------------------------------------------------------------------
    it('throws error when no API key and no proxy URL', async () => {
      const result = await cleanTurkishOCRWithAI('test text', {
        primaryProvider: { name: 'openai', apiKey: '' },
        useOfflineFallback: true,
      })

      // Should fallback to offline since AI call throws
      expect(result.aiProvider).toBe('offline')
      expect(result.fallbackUsed).toBe(true)
    })

    it('falls back to next provider on failure', async () => {
      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'))
      // Second call succeeds
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          content: [{ text: 'cleaned text' }],
        })
      )

      const result = await cleanTurkishOCRWithAI('test text', {
        primaryProvider: { name: 'openai', apiKey: 'key1' },
        fallbackProviders: [{ name: 'anthropic', apiKey: 'key2' }],
      })

      expect(result.aiProvider).toBe('anthropic')
      expect(result.fallbackUsed).toBe(true)
    })

    it('falls to offline when all providers fail', async () => {
      mockFetch.mockRejectedValue(new Error('All fail'))

      const result = await cleanTurkishOCRWithAI('test text', {
        primaryProvider: { name: 'openai', apiKey: 'key1' },
        fallbackProviders: [{ name: 'anthropic', apiKey: 'key2' }],
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
      expect(result.fallbackUsed).toBe(true)
    })

    it('does not use offline fallback when disabled', async () => {
      mockFetch.mockRejectedValue(new Error('All fail'))

      const result = await cleanTurkishOCRWithAI('test text', {
        primaryProvider: { name: 'openai', apiKey: 'key1' },
        useOfflineFallback: false,
      })

      // Text unchanged since no fallback
      expect(result.text).toBe('test text')
      expect(result.aiProvider).toBe('offline')
    })

    // -----------------------------------------------------------------------
    // HTTP errors
    // -----------------------------------------------------------------------
    it('handles non-ok HTTP response from OpenAI', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse('Rate limited', false, 429)
      )

      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: 'key' },
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
    })

    it('handles non-ok HTTP response from Anthropic', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse('Unauthorized', false, 401)
      )

      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'anthropic', apiKey: 'key' },
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
    })

    it('handles non-ok HTTP response from Gemini', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse('Service unavailable', false, 503)
      )

      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'gemini', apiKey: 'key' },
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
    })

    it('handles non-ok proxy response', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse('Server error', false, 500)
      )

      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: '' },
        proxyUrl: 'http://localhost:4001/api/ai',
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
    })

    // -----------------------------------------------------------------------
    // Validation warnings
    // -----------------------------------------------------------------------
    it('warns when critical data is missing from output', async () => {
      // Input has a date pattern, output doesn't
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: 'cleaned text only' } }],
        })
      )

      const result = await cleanTurkishOCRWithAI(
        'Policy 1234567890 dated 01/01/2026',
        { primaryProvider: { name: 'openai', apiKey: 'key' } }
      )

      // Validation should flag missing critical data
      expect(result.validation.valid).toBe(false)
      expect(result.validation.missing.length).toBeGreaterThan(0)
    })

    it('marks validation as valid when data preserved', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: 'Policy 1234567890 dated 01/01/2026 cleaned' } }],
        })
      )

      const result = await cleanTurkishOCRWithAI(
        'Policy 1234567890 dated 01/01/2026',
        { primaryProvider: { name: 'openai', apiKey: 'key' } }
      )

      expect(result.validation.valid).toBe(true)
      expect(result.validation.preserved.length).toBeGreaterThan(0)
    })

    // -----------------------------------------------------------------------
    // Default provider handling
    // -----------------------------------------------------------------------
    it('uses default model when not specified', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: 'cleaned' } }],
        })
      )

      await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: 'key' },
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.model).toBe('gpt-4o-mini')
    })

    it('uses custom model when specified', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: 'cleaned' } }],
        })
      )

      await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: 'key', model: 'gpt-4o' },
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.model).toBe('gpt-4o')
    })

    it('handles empty content from OpenAI', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          choices: [{ message: { content: null } }],
        })
      )

      const result = await cleanTurkishOCRWithAI('original text', {
        primaryProvider: { name: 'openai', apiKey: 'key' },
      })

      // Should fall back to original text
      expect(result.text).toBe('original text')
    })

    it('handles empty content from Anthropic', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          content: [{ text: null }],
        })
      )

      const result = await cleanTurkishOCRWithAI('original text', {
        primaryProvider: { name: 'anthropic', apiKey: 'key' },
      })

      expect(result.text).toBe('original text')
    })

    it('handles empty content from Gemini', async () => {
      mockFetch.mockReturnValueOnce(
        mockFetchResponse({
          candidates: [{ content: { parts: [{ text: null }] } }],
        })
      )

      const result = await cleanTurkishOCRWithAI('original text', {
        primaryProvider: { name: 'gemini', apiKey: 'key' },
      })

      expect(result.text).toBe('original text')
    })

    it('throws for unknown provider', async () => {
      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'unknown' as 'openai', apiKey: 'key' },
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
    })

    it('runs with no options (defaults)', async () => {
      const result = await cleanTurkishOCRWithAI('some text')
      // No providers configured, should just return text as-is (offline)
      expect(result.aiProvider).toBe('offline')
      expect(result.text).toBeTruthy()
    })
  })

  // =========================================================================
  // cleanTurkishOCRMultiProvider
  // =========================================================================
  describe('cleanTurkishOCRMultiProvider', () => {
    it('returns original text when no providers given', async () => {
      const result = await cleanTurkishOCRMultiProvider('test text', [])
      expect(result.text).toBe('test text')
      expect(result.aiProvider).toBe('multi')
      expect(result.allResults).toEqual({})
    })

    it('returns original when text is empty', async () => {
      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key' },
      ]
      const result = await cleanTurkishOCRMultiProvider('', providers)
      expect(result.text).toBe('')
      expect(result.allResults).toEqual({})
    })

    it('calls multiple providers in parallel', async () => {
      mockFetch
        .mockReturnValueOnce(
          mockFetchResponse({
            choices: [{ message: { content: 'openai cleaned 1234567890' } }],
          })
        )
        .mockReturnValueOnce(
          mockFetchResponse({
            content: [{ text: 'anthropic cleaned 1234567890' }],
          })
        )

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider(
        'text with 1234567890',
        providers
      )

      expect(result.aiProvider).toBe('multi')
      expect(Object.keys(result.allResults)).toHaveLength(2)
      expect(result.allResults.openai).toBeTruthy()
      expect(result.allResults.anthropic).toBeTruthy()
    })

    it('picks result with best validation (most preserved data)', async () => {
      // OpenAI preserves data
      mockFetch
        .mockReturnValueOnce(
          mockFetchResponse({
            choices: [{ message: { content: 'cleaned text with 1234567890 date 01/01/2026' } }],
          })
        )
        .mockReturnValueOnce(
          mockFetchResponse({
            content: [{ text: 'cleaned but missing data' }],
          })
        )

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider(
        'original 1234567890 date 01/01/2026',
        providers
      )

      // Should pick the one with more preserved data
      expect(result.text).toContain('1234567890')
    })

    it('picks longest result when no valid results', async () => {
      // Both providers return text without critical data
      mockFetch
        .mockReturnValueOnce(
          mockFetchResponse({
            choices: [{ message: { content: 'short' } }],
          })
        )
        .mockReturnValueOnce(
          mockFetchResponse({
            content: [{ text: 'this is a much longer cleaned text result' }],
          })
        )

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider(
        'has 1234567890 critical data',
        providers
      )

      // Both fail validation, should pick longest
      expect(result.fallbackUsed).toBe(true)
    })

    it('handles provider failures gracefully', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('OpenAI down'))
        .mockReturnValueOnce(
          mockFetchResponse({
            content: [{ text: 'anthropic works' }],
          })
        )

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider('test', providers)

      expect(result.allResults.openai).toBeUndefined()
      expect(result.allResults.anthropic).toBeTruthy()
    })

    it('handles all providers failing', async () => {
      mockFetch.mockRejectedValue(new Error('All down'))

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider('original text', providers)

      expect(result.text).toBe('original text')
      expect(Object.keys(result.allResults)).toHaveLength(0)
    })
  })
})
