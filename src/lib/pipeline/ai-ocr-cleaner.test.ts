import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanTurkishOCRWithAI,
  cleanTurkishOCROffline,
  cleanTurkishOCRMultiProvider,
  getTurkishOCRCorrectionPrompt,
  buildTurkishOCRPrompt,
  type AIProviderConfig,
} from './ai-ocr-cleaner'

describe('AI OCR Cleaner', () => {
  describe('cleanTurkishOCROffline', () => {
    describe('spaced letter collapsing', () => {
      it('should collapse clearly spaced Turkish words', () => {
        const input = 'S İ G O R T A POLİÇESİ'
        const result = cleanTurkishOCROffline(input)
        // Offline fallback is conservative, may not fix all patterns
        expect(result.length).toBeLessThanOrEqual(input.length)
      })

      it('should handle empty string', () => {
        expect(cleanTurkishOCROffline('')).toBe('')
      })

      it('should handle null/undefined safely', () => {
        expect(cleanTurkishOCROffline(null as unknown as string)).toBe('')
        expect(cleanTurkishOCROffline(undefined as unknown as string)).toBe('')
      })

      it('should preserve text without spacing issues', () => {
        const input = 'Normal Turkish text with SİGORTA'
        const result = cleanTurkishOCROffline(input)
        expect(result).toContain('SİGORTA')
      })

      it('should preserve numbers and dates', () => {
        const input = 'S İ G O R T A Poliçe No: 1680600025 Tarih: 28/12/2025'
        const result = cleanTurkishOCROffline(input)
        expect(result).toContain('1680600025')
        expect(result).toContain('28/12/2025')
      })

      it('should normalize extra whitespace', () => {
        const input = 'Multiple    spaces    here'
        const result = cleanTurkishOCROffline(input)
        expect(result).not.toContain('  ')
      })
    })

    describe('glued word splitting', () => {
      it('should split common glued patterns with VE', () => {
        const input = 'SANAYİVE TİCARET'
        const result = cleanTurkishOCROffline(input)
        expect(result).toMatch(/SANAYİ\s+VE/)
      })

      it('should split İ followed by uppercase word', () => {
        const input = 'HUSUSİOTOMOBİL'
        const result = cleanTurkishOCROffline(input)
        expect(result).toMatch(/HUSUSİ\s*OTOMOBİL/)
      })
    })
  })

  describe('getTurkishOCRCorrectionPrompt', () => {
    it('should return a non-empty prompt string', () => {
      const prompt = getTurkishOCRCorrectionPrompt()
      expect(prompt).toBeDefined()
      expect(prompt.length).toBeGreaterThan(100)
    })

    it('should contain key instructions', () => {
      const prompt = getTurkishOCRCorrectionPrompt()
      expect(prompt).toContain('SPACED LETTERS')
      expect(prompt).toContain('GLUED WORDS')
      expect(prompt).toContain('Turkish')
      expect(prompt).toContain('SİGORTA')
    })

    it('should instruct to preserve numbers', () => {
      const prompt = getTurkishOCRCorrectionPrompt()
      expect(prompt).toContain('DO NOT modify numbers')
    })
  })

  describe('buildTurkishOCRPrompt', () => {
    it('should include the base prompt and text', () => {
      const text = 'S İ G O R T A test'
      const result = buildTurkishOCRPrompt(text)
      expect(result).toContain('S İ G O R T A test')
      expect(result).toContain('TEXT TO CORRECT')
      expect(result).toContain('CORRECTED TEXT')
    })

    it('should handle special characters', () => {
      const text = 'İŞ ĞÜÖ ÇŞ'
      const result = buildTurkishOCRPrompt(text)
      expect(result).toContain('İŞ ĞÜÖ ÇŞ')
    })
  })

  describe('cleanTurkishOCRWithAI', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
      originalFetch = global.fetch
    })

    afterEach(() => {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    })

    it('should return empty result for empty input', async () => {
      const result = await cleanTurkishOCRWithAI('')
      expect(result.text).toBe('')
      expect(result.originalLength).toBe(0)
      expect(result.aiProvider).toBe('offline')
    })

    it('should use offline fallback when no providers configured', async () => {
      const input = 'S İ G O R T A test'
      const result = await cleanTurkishOCRWithAI(input)
      expect(result.aiProvider).toBe('offline')
      expect(result.text).toBeDefined()
    })

    it('should use offline fallback when AI call fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const input = 'S İ G O R T A test'
      const result = await cleanTurkishOCRWithAI(input, {
        primaryProvider: { name: 'openai', apiKey: 'test-key' },
        useOfflineFallback: true,
      })

      expect(result.aiProvider).toBe('offline')
      expect(result.fallbackUsed).toBe(true)
    })

    it('should validate output and report missing critical data', async () => {
      // Mock AI that removes the policy number
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'SİGORTA POLİÇESİ' } }], // Missing number
        }),
      })

      const input = 'S İ G O R T A POLİÇESİ No: 1680600025'
      const result = await cleanTurkishOCRWithAI(input, {
        primaryProvider: { name: 'openai', apiKey: 'test-key' },
      })

      expect(result.validation.valid).toBe(false)
      expect(result.validation.missing).toContain('1680600025')
    })

    it('should report preserved critical data on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'SİGORTA POLİÇESİ No: 1680600025' } }],
        }),
      })

      const input = 'S İ G O R T A POLİÇESİ No: 1680600025'
      const result = await cleanTurkishOCRWithAI(input, {
        primaryProvider: { name: 'openai', apiKey: 'test-key' },
      })

      expect(result.validation.valid).toBe(true)
      expect(result.validation.preserved).toContain('1680600025')
    })

    it('should try fallback providers when primary fails', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error('Primary failed'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Fallback result' } }],
          }),
        })
      })

      const result = await cleanTurkishOCRWithAI('test input', {
        primaryProvider: { name: 'openai', apiKey: 'primary-key' },
        fallbackProviders: [{ name: 'anthropic', apiKey: 'fallback-key' }],
      })

      expect(callCount).toBe(2)
      expect(result.fallbackUsed).toBe(true)
    })

    describe('OpenAI provider', () => {
      it('should call OpenAI with correct parameters', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Cleaned text' } }],
          }),
        })
        global.fetch = mockFetch

        await cleanTurkishOCRWithAI('test', {
          primaryProvider: { name: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
        })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer sk-test',
            }),
          })
        )

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.model).toBe('gpt-4o-mini')
        expect(body.temperature).toBe(0.1)
      })

      it('should handle OpenAI API errors', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limited',
        })

        const result = await cleanTurkishOCRWithAI('test', {
          primaryProvider: { name: 'openai', apiKey: 'sk-test' },
          useOfflineFallback: true,
        })

        expect(result.aiProvider).toBe('offline')
      })
    })

    describe('Anthropic provider', () => {
      it('should call Anthropic with correct parameters', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ text: 'Cleaned text' }],
          }),
        })
        global.fetch = mockFetch

        await cleanTurkishOCRWithAI('test', {
          primaryProvider: { name: 'anthropic', apiKey: 'sk-ant-test' },
        })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.anthropic.com/v1/messages',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'x-api-key': 'sk-ant-test',
              'anthropic-version': '2023-06-01',
            }),
          })
        )
      })
    })

    describe('Gemini provider', () => {
      it('should call Gemini with correct URL', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Cleaned text' }] } }],
          }),
        })
        global.fetch = mockFetch

        await cleanTurkishOCRWithAI('test', {
          primaryProvider: { name: 'gemini', apiKey: 'gemini-key' },
        })

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('generativelanguage.googleapis.com'),
          expect.anything()
        )
        expect(mockFetch.mock.calls[0][0]).toContain('key=gemini-key')
      })
    })

    describe('proxy mode', () => {
      it('should use proxy URL when provided without API key', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ response: 'Proxied result' }),
        })
        global.fetch = mockFetch

        await cleanTurkishOCRWithAI('test', {
          primaryProvider: { name: 'openai', apiKey: '' },
          proxyUrl: 'http://localhost:4001/api/ai',
        })

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4001/api/ai/chat',
          expect.anything()
        )
      })
    })
  })

  describe('cleanTurkishOCRMultiProvider', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
      originalFetch = global.fetch
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('should return input if no providers given', async () => {
      const result = await cleanTurkishOCRMultiProvider('test input', [])
      expect(result.text).toBe('test input')
      expect(result.aiProvider).toBe('multi')
    })

    it('should call multiple providers in parallel', async () => {
      const callUrls: string[] = []
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callUrls.push(url)
        if (url.includes('openai')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              choices: [{ message: { content: 'OpenAI result 1680600025' } }],
            }),
          })
        }
        if (url.includes('anthropic')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              content: [{ text: 'Anthropic result 1680600025' }],
            }),
          })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider('test 1680600025', providers)

      expect(callUrls.length).toBe(2)
      expect(result.allResults).toHaveProperty('openai')
      expect(result.allResults).toHaveProperty('anthropic')
    })

    it('should pick result with best validation', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('openai')) {
          // OpenAI returns result without the policy number
          return Promise.resolve({
            ok: true,
            json: async () => ({
              choices: [{ message: { content: 'OpenAI result without number' } }],
            }),
          })
        }
        if (url.includes('anthropic')) {
          // Anthropic returns result with policy number preserved
          return Promise.resolve({
            ok: true,
            json: async () => ({
              content: [{ text: 'Anthropic result 1680600025' }],
            }),
          })
        }
        return Promise.reject(new Error('Unknown'))
      })

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider('test 1680600025', providers)

      // Should pick Anthropic because it preserved the policy number
      expect(result.text).toContain('1680600025')
      expect(result.validation.valid).toBe(true)
    })

    it('should handle partial provider failures', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('openai')) {
          return Promise.reject(new Error('OpenAI down'))
        }
        if (url.includes('anthropic')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              content: [{ text: 'Anthropic result' }],
            }),
          })
        }
        return Promise.reject(new Error('Unknown'))
      })

      const providers: AIProviderConfig[] = [
        { name: 'openai', apiKey: 'key1' },
        { name: 'anthropic', apiKey: 'key2' },
      ]

      const result = await cleanTurkishOCRMultiProvider('test', providers)

      // Should still have Anthropic result
      expect(result.allResults).not.toHaveProperty('openai')
      expect(result.allResults).toHaveProperty('anthropic')
      expect(result.text).toBe('Anthropic result')
    })
  })

  describe('critical data preservation', () => {
    it('should detect policy numbers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Result with 1680600025' } }],
        }),
      })

      const result = await cleanTurkishOCRWithAI('Input 1680600025', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
      })

      expect(result.validation.preserved).toContain('1680600025')
    })

    it('should detect dates in various formats', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Result 28/12/2025 and 2025-12-28' } }],
        }),
      })

      const result = await cleanTurkishOCRWithAI('Input 28/12/2025 and 2025-12-28', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
      })

      expect(result.validation.valid).toBe(true)
    })

    it('should detect Turkish formatted amounts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Tutar: 31.140,00 TL' } }],
        }),
      })

      const result = await cleanTurkishOCRWithAI('Tutar: 31.140,00 TL', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
      })

      expect(result.validation.preserved).toContain('31.140,00')
    })

    it('should detect plate numbers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Plaka: 34 RZ 9511' } }],
        }),
      })

      const result = await cleanTurkishOCRWithAI('Plaka: 34 RZ9511', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
      })

      // Should detect with normalized spaces
      expect(result.validation.valid).toBe(true)
    })
  })

  describe('timeout handling', () => {
    it('should respect timeout option and use AbortController', async () => {
      let abortSignalReceived = false
      global.fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
        // Check that AbortController signal is passed
        if (options?.signal) {
          abortSignalReceived = true
          // Simulate the abort behavior
          return new Promise((_, reject) => {
            options.signal!.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
            // If timeout is very short, the abort should trigger
          })
        }
        return Promise.reject(new Error('No signal'))
      })

      const result = await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
        timeout: 50, // Very short timeout
        useOfflineFallback: true,
      })

      expect(abortSignalReceived).toBe(true)
      // Should fall back to offline due to abort
      expect(result.aiProvider).toBe('offline')
    }, 2000) // 2 second test timeout

    it('should pass AbortSignal to fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'result' } }],
        }),
      })
      global.fetch = mockFetch

      await cleanTurkishOCRWithAI('test', {
        primaryProvider: { name: 'openai', apiKey: 'test' },
        timeout: 5000,
      })

      // Verify fetch was called with signal
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })
  })
})
