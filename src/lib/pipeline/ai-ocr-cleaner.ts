/**
 * Turkish OCR Cleaner - AI-First Approach
 *
 * Strategy:
 * 1. DETERMINISTIC: Remove obvious garbage (B^^^B, a!!!!) - handled by deterministic-preclean.ts
 * 2. AI-POWERED: Send to LLM for Turkish text correction
 * 3. VALIDATION: Verify critical data preserved
 *
 * The AI handles:
 * - Turkish character spacing (understands morphology)
 * - Word boundary detection (knows Turkish words)
 * - Context-aware correction (understands insurance terms)
 * - Glued word splitting (HUSUSİOTOMOBİL → HUSUSİ OTOMOBİL)
 *
 * Why AI over hardcoded lists:
 * - No maintenance needed for new words
 * - Understands context (SİGORTA ŞİRKETİ vs SİGORTAŞİRKETİ)
 * - Handles names, places, new terms automatically
 * - Cost: ~$0.001 per document with GPT-4o-mini/Claude Haiku
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AICleanupResult {
  text: string
  originalLength: number
  cleanedLength: number
  aiProvider: AIProviderName | 'offline' | 'multi'
  processingTimeMs: number
  validation: ValidationResult
  fallbackUsed: boolean
}

export interface ValidationResult {
  valid: boolean
  missing: string[]
  preserved: string[]
}

export type AIProviderName = 'openai' | 'anthropic' | 'gemini'

export interface AIProviderConfig {
  name: AIProviderName
  apiKey: string
  model?: string
  endpoint?: string // For proxy servers
}

export interface AICleanerOptions {
  /** Primary AI provider configuration */
  primaryProvider?: AIProviderConfig
  /** Fallback providers in order of preference */
  fallbackProviders?: AIProviderConfig[]
  /** Whether to use offline fallback if all AI providers fail */
  useOfflineFallback?: boolean
  /** API proxy URL (e.g., http://localhost:4001/api/ai) */
  proxyUrl?: string
  /** Timeout for AI calls in milliseconds */
  timeout?: number
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_TIMEOUT = 30000 // 30 seconds

const DEFAULT_MODELS: Record<AIProviderName, string> = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-3-haiku-20240307',
  gemini: 'gemini-1.5-flash',
}

// =============================================================================
// AI CORRECTION PROMPT
// This is the key - a well-crafted prompt for Turkish OCR correction
// =============================================================================

const TURKISH_OCR_CORRECTION_PROMPT = `You are a Turkish language expert specializing in OCR error correction for insurance documents.

The OCR has produced text with SPACING ERRORS. The main problems are:

1. SPACED LETTERS: Single letters separated by spaces that should be words
   Example: "S İ G O R T A" should be "SİGORTA"
   Example: "P O L İ Ç E" should be "POLİÇE"
   Example: "B İ RLE Şİ K" should be "BİRLEŞİK"

2. MIXED SPACING: Partial spacing in words
   Example: "S İ GORTA" should be "SİGORTA"
   Example: "POL İÇ ES İ" should be "POLİÇESİ"
   Example: "ANON İ M" should be "ANONİM"

3. GLUED WORDS: Words stuck together that should be separate
   Example: "HUSUSİOTOMOBİL" should be "HUSUSİ OTOMOBİL"
   Example: "SİGORTAŞİRKETİ" should be "SİGORTA ŞİRKETİ"
   Example: "SANAYİVE" should be "SANAYİ VE"

4. TURKISH SPECIAL CHARACTERS: İ, Ş, Ğ, Ü, Ö, Ç must be preserved correctly
   - İ (capital I with dot) is different from I (capital I without dot)
   - ı (lowercase i without dot) is different from i (lowercase i with dot)

RULES:
- Fix ALL Turkish word spacing issues
- DO NOT modify numbers, dates, amounts, or reference codes
- DO NOT add or remove content - only fix spacing
- Preserve line breaks
- Keep all punctuation
- If unsure about a word, keep it readable but don't guess

Return ONLY the corrected text. No explanations, no markdown, no quotes around the output.`

/**
 * Build the full prompt with the text to correct
 */
function buildPrompt(text: string): string {
  return `${TURKISH_OCR_CORRECTION_PROMPT}

TEXT TO CORRECT:
---
${text}
---

CORRECTED TEXT:`
}

// =============================================================================
// VALIDATION
// Ensure critical data wasn't lost or corrupted
// =============================================================================

/**
 * Extract critical data patterns that must be preserved
 */
function extractCriticalData(text: string): string[] {
  const patterns = [
    /\d{10,}/g, // Long numbers (policy numbers)
    /\d{2}\/\d{2}\/\d{4}/g, // Dates (DD/MM/YYYY)
    /\d{2}-\d{2}-\d{4}/g, // Dates (DD-MM-YYYY)
    /\d{4}-\d{2}-\d{2}/g, // Dates (YYYY-MM-DD)
    /\d{1,3}(?:\.\d{3})*,\d{2}/g, // Turkish formatted amounts (31.140,00)
    /\d{2}\s*[A-Z]{1,3}\s*\d{4,}/g, // Plate numbers (34 ABC 1234)
    /[A-Z0-9]{10,}/g, // Reference codes
    /T\.?C\.?\s*\d{11}/gi, // TC Kimlik numbers
  ]

  const critical: string[] = []
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    critical.push(...matches)
  }

  return [...new Set(critical)] // Dedupe
}

/**
 * Verify critical data is preserved in output
 */
function validateOutput(original: string, cleaned: string): ValidationResult {
  const criticalData = extractCriticalData(original)
  const missing: string[] = []
  const preserved: string[] = []

  for (const data of criticalData) {
    // Normalize spaces for comparison
    const normalizedData = data.replace(/\s+/g, '')
    const normalizedCleaned = cleaned.replace(/\s+/g, '')

    if (normalizedCleaned.includes(normalizedData)) {
      preserved.push(data)
    } else {
      missing.push(data)
    }
  }

  return { valid: missing.length === 0, missing, preserved }
}

// =============================================================================
// AI PROVIDER IMPLEMENTATIONS
// =============================================================================

/**
 * Call OpenAI API directly
 */
async function callOpenAIDirect(
  text: string,
  apiKey: string,
  model: string = DEFAULT_MODELS.openai,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const prompt = buildPrompt(text)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low for consistency
        max_tokens: Math.min(text.length * 2, 4000),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() || text
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call Anthropic Claude API directly
 */
async function callAnthropicDirect(
  text: string,
  apiKey: string,
  model: string = DEFAULT_MODELS.anthropic,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const prompt = buildPrompt(text)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(text.length * 2, 4000),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`
      )
    }

    const data = await response.json()
    return data.content[0]?.text?.trim() || text
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call Google Gemini API directly
 */
async function callGeminiDirect(
  text: string,
  apiKey: string,
  model: string = DEFAULT_MODELS.gemini,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const prompt = buildPrompt(text)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call AI via proxy server (for browser use)
 */
async function callViaProxy(
  text: string,
  proxyUrl: string,
  provider: AIProviderName = 'openai',
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const prompt = buildPrompt(text)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    // Use the existing /api/ai/chat endpoint with a special OCR correction mode
    const response = await fetch(`${proxyUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        provider,
        // Signal that this is an OCR correction request
        policyContext: 'OCR_CORRECTION_MODE',
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Proxy API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.response?.trim() || text
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call AI provider with configuration
 */
async function callAIProvider(
  text: string,
  config: AIProviderConfig,
  proxyUrl?: string,
  timeout?: number
): Promise<string> {
  const model = config.model || DEFAULT_MODELS[config.name]
  const actualTimeout = timeout || DEFAULT_TIMEOUT

  // If we have a proxy URL and no direct API key, use proxy
  if (proxyUrl && !config.apiKey) {
    return callViaProxy(text, proxyUrl, config.name, actualTimeout)
  }

  // Direct API calls require API key
  if (!config.apiKey) {
    throw new Error(`No API key provided for ${config.name} and no proxy URL available`)
  }

  switch (config.name) {
    case 'openai':
      return callOpenAIDirect(text, config.apiKey, model, actualTimeout)
    case 'anthropic':
      return callAnthropicDirect(text, config.apiKey, model, actualTimeout)
    case 'gemini':
      return callGeminiDirect(text, config.apiKey, model, actualTimeout)
    default:
      throw new Error(`Unknown AI provider: ${config.name}`)
  }
}

// =============================================================================
// OFFLINE FALLBACK
// Basic pattern-based correction when AI is not available
// =============================================================================

/**
 * Turkish uppercase characters including special ones
 */
const TURKISH_UPPER = 'A-ZÇĞİÖŞÜÂÎÛ'
const TURKISH_LOWER = 'a-zçğıöşüâîû'

/**
 * Fallback cleaner when AI is not available
 * Uses simple heuristics - less accurate but works offline
 *
 * This is intentionally conservative - it only collapses clear patterns
 * and may leave some spacing issues unfixed to avoid making things worse
 */
export function cleanTurkishOCROffline(text: string): string {
  if (!text) return ''

  let result = text

  // Iteratively collapse spaced sequences of single uppercase Turkish letters
  // Pattern: "A B C D" where each is a single letter with spaces between
  let prev = ''
  let iterations = 0
  const maxIterations = 10

  while (result !== prev && iterations < maxIterations) {
    prev = result

    // Match single uppercase letter + space + single uppercase letter
    // Only collapse when we're confident it's a spaced word pattern
    // Look for 3+ consecutive single letters with spaces
    result = result.replace(
      new RegExp(
        `(?<=[^${TURKISH_UPPER}]|^)` + // Not preceded by uppercase
          `([${TURKISH_UPPER}])` + // Single uppercase letter
          `[ \\t]+` + // Horizontal whitespace
          `([${TURKISH_UPPER}])` + // Single uppercase letter
          `(?=[ \\t]+[${TURKISH_UPPER}](?:[ \\t]+[${TURKISH_UPPER}]|[^${TURKISH_LOWER}]|$))`, // Must have more single letters following
        'gu'
      ),
      '$1$2'
    )
    iterations++
  }

  // Handle final pair in a sequence
  result = result.replace(
    new RegExp(
      `([${TURKISH_UPPER}]{2,})` + // Already collapsed letters
        `[ \\t]+` + // Space
        `([${TURKISH_UPPER}])` + // Single letter
        `(?=[^${TURKISH_UPPER}${TURKISH_LOWER}]|$)`, // Followed by non-letter or end
      'gu'
    ),
    '$1$2'
  )

  // Split obvious glued words
  // Pattern: word ending in İ/ı + common conjunction (VE, İLE, VEYA)
  // e.g., SANAYİVE → SANAYİ VE, TİCARETİVE → TİCARETİ VE
  const commonConjunctions = ['VE', 'İLE', 'VEYA']
  for (const conj of commonConjunctions) {
    // Match: Turkish letter (including İ) followed by conjunction
    const pattern = new RegExp(
      `([${TURKISH_UPPER}${TURKISH_LOWER}İı])(${conj})(?=[${TURKISH_UPPER}]|\\s|$)`,
      'g'
    )
    result = result.replace(pattern, '$1 $2')
  }

  // Split at clear lowercase-uppercase boundaries that look like glued words
  // e.g., "HUSUSİOTOMOBİL" → "HUSUSİ OTOMOBİL"
  // Look for: ...İ followed by uppercase (common Turkish suffix ending)
  result = result.replace(/([İıiI])([A-ZÇĞÖŞÜİ][a-zçğıöşüi]{2,})/g, '$1 $2')

  // Normalize whitespace
  result = result.replace(/[ \t]{2,}/g, ' ')

  return result.trim()
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Clean Turkish OCR text using AI with fallback chain
 *
 * @param text - Raw OCR text (should already have garbage removed by deterministic pre-clean)
 * @param options - AI provider configuration and options
 * @returns Cleaned text and metadata
 */
export async function cleanTurkishOCRWithAI(
  text: string,
  options: AICleanerOptions = {}
): Promise<AICleanupResult> {
  const startTime = Date.now()

  if (!text || typeof text !== 'string') {
    return {
      text: '',
      originalLength: 0,
      cleanedLength: 0,
      aiProvider: 'offline',
      processingTimeMs: 0,
      validation: { valid: true, missing: [], preserved: [] },
      fallbackUsed: false,
    }
  }

  const {
    primaryProvider,
    fallbackProviders = [],
    useOfflineFallback = true,
    proxyUrl,
    timeout = DEFAULT_TIMEOUT,
  } = options

  // Build provider chain
  const providers: AIProviderConfig[] = []
  if (primaryProvider) {
    providers.push(primaryProvider)
  }
  providers.push(...fallbackProviders)

  // Try each provider in order
  let corrected: string = text
  let usedProvider: AIProviderName | 'offline' | 'multi' = 'offline'
  let fallbackUsed = false
  let lastError: Error | null = null

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]
    try {
      corrected = await callAIProvider(text, provider, proxyUrl, timeout)
      usedProvider = provider.name
      fallbackUsed = i > 0
      lastError = null
      break
    } catch (error) {
      lastError = error as Error
      console.warn(`AI provider ${provider.name} failed:`, error)
      // Continue to next provider
    }
  }

  // If all AI providers failed and we have no result, try offline fallback
  if (lastError && useOfflineFallback) {
    console.warn('All AI providers failed, using offline fallback')
    corrected = cleanTurkishOCROffline(text)
    usedProvider = 'offline'
    fallbackUsed = true
  }

  // Validate output
  const validation = validateOutput(text, corrected)
  if (!validation.valid) {
    console.warn(`Warning: Some critical data may be missing: ${validation.missing.join(', ')}`)
  }

  return {
    text: corrected,
    originalLength: text.length,
    cleanedLength: corrected.length,
    aiProvider: usedProvider,
    processingTimeMs: Date.now() - startTime,
    validation,
    fallbackUsed,
  }
}

/**
 * Clean Turkish OCR using multiple AI providers and synthesize best result
 * More accurate but more expensive
 */
export async function cleanTurkishOCRMultiProvider(
  text: string,
  providers: AIProviderConfig[],
  options: { proxyUrl?: string; timeout?: number } = {}
): Promise<AICleanupResult & { allResults: Record<string, string> }> {
  const startTime = Date.now()
  const { proxyUrl, timeout = DEFAULT_TIMEOUT } = options

  if (!text || providers.length === 0) {
    return {
      text,
      originalLength: text?.length || 0,
      cleanedLength: text?.length || 0,
      aiProvider: 'multi',
      processingTimeMs: 0,
      validation: { valid: true, missing: [], preserved: [] },
      fallbackUsed: false,
      allResults: {},
    }
  }

  // Call all providers in parallel
  const results: Record<string, string> = {}
  const promises = providers.map(async (config) => {
    try {
      const result = await callAIProvider(text, config, proxyUrl, timeout)
      results[config.name] = result
    } catch (error) {
      console.error(`Error from ${config.name}:`, error)
      // Don't add to results - this provider failed
    }
  })

  await Promise.all(promises)

  // Synthesis: Use majority voting or pick the result that:
  // 1. Has valid critical data
  // 2. Is closest to average length (not too short, not too long)
  const validResults = Object.entries(results)
    .map(([provider, result]) => ({
      provider,
      result,
      validation: validateOutput(text, result),
    }))
    .filter((r) => r.validation.valid)

  let bestResult = text
  if (validResults.length > 0) {
    // Pick the result with best validation (most preserved data)
    validResults.sort((a, b) => b.validation.preserved.length - a.validation.preserved.length)
    bestResult = validResults[0].result
  } else if (Object.values(results).length > 0) {
    // No valid results, pick the longest one
    bestResult = Object.values(results).reduce((a, b) => (a.length > b.length ? a : b), text)
  }

  const validation = validateOutput(text, bestResult)

  return {
    text: bestResult,
    originalLength: text.length,
    cleanedLength: bestResult.length,
    aiProvider: 'multi',
    processingTimeMs: Date.now() - startTime,
    validation,
    fallbackUsed: validResults.length === 0 && Object.keys(results).length > 0,
    allResults: results,
  }
}

// =============================================================================
// PROMPT EXPORT (for use in other modules)
// =============================================================================

/**
 * Get the Turkish OCR correction prompt for use in other modules
 */
export function getTurkishOCRCorrectionPrompt(): string {
  return TURKISH_OCR_CORRECTION_PROMPT
}

/**
 * Build complete prompt with text
 */
export function buildTurkishOCRPrompt(text: string): string {
  return buildPrompt(text)
}
