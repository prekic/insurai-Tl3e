import {
  getOpenAIClient,
  AI_CONFIG,
  isProxyConfigured,
  extractViaProxy,
} from '../config'
import {
  ExtractedPolicyData,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
} from '../extraction-schema'
import { aiCache } from '../cache'
import { costTracker, estimateTokens } from '../cost-tracking'
import { rateLimiter, auditLogger, createTimedAudit } from '@/lib/security'

/**
 * Get current user ID for rate limiting
 * Falls back to a session-based identifier if not authenticated
 */
function getCurrentUserId(): string {
  // Try to get from localStorage (set by auth context)
  if (typeof localStorage !== 'undefined') {
    const userId = localStorage.getItem('insurai_user_id')
    if (userId) return userId
  }
  // Fall back to session identifier
  return 'anonymous_' + (typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('session_id') ?? 'unknown'
    : 'unknown')
}

/**
 * Extract policy data using OpenAI GPT-4
 * Uses secure backend proxy in production, direct API in development
 * Implements caching for cost reduction (~60% savings on repeated documents)
 * Includes rate limiting, audit logging, and cost tracking for production readiness
 */
export async function extractWithOpenAI(documentText: string): Promise<ExtractedPolicyData> {
  const userId = getCurrentUserId()
  const model = AI_CONFIG.openai.extractionModel

  // Check rate limit
  const rateLimitResult = rateLimiter.consume('ai_extraction', userId)
  if (!rateLimitResult.allowed) {
    const error = new Error('AI extraction rate limit exceeded. Please wait before processing more documents.')
    await auditLogger.logAI('ai.extraction_failed', {
      provider: 'openai',
      documentLength: documentText.length,
    }, {
      userId,
      success: false,
      errorMessage: 'Rate limit exceeded',
    })
    throw error
  }

  // Start timed audit
  const timedAudit = createTimedAudit('ai.extraction_started', {
    provider: 'openai',
    documentLength: documentText.length,
  }, { userId })

  // Initialize cache and cost tracker
  await Promise.all([
    aiCache.initialize(),
    costTracker.initialize(),
  ])

  // Truncate very long documents to fit context window
  const maxChars = 30000
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  // Build the user message
  const userMessage = `Please extract the insurance policy information from this document:\n\n${truncatedText}`

  // Estimate input tokens for cost tracking
  const estimatedInputTokens = estimateTokens(EXTRACTION_SYSTEM_PROMPT + userMessage)

  // Check cache first
  const cached = await aiCache.getExtraction(truncatedText, 'openai')
  if (cached) {
    // Track cached request (shows cost savings)
    await costTracker.recordUsage({
      provider: 'openai',
      model,
      operation: 'extraction',
      inputTokens: estimatedInputTokens,
      outputTokens: 0,
      cacheHit: true,
      documentLength: truncatedText.length,
      success: true,
      userId,
    })

    await auditLogger.logAI('ai.extraction_cached', {
      provider: 'openai',
      documentLength: truncatedText.length,
      cacheHit: true,
      confidence: cached.confidence?.overall ?? 0.7,
    }, { userId, success: true })
    return cached
  }

  const startTime = Date.now()
  let result: ExtractedPolicyData
  let actualInputTokens = estimatedInputTokens
  let actualOutputTokens = 0

  try {
    // Use proxy if configured (production)
    if (isProxyConfigured()) {
      console.log('[OpenAI Extract] Using proxy, calling extractViaProxy...')
      const proxyResult = await extractViaProxy('openai', userMessage, EXTRACTION_SYSTEM_PROMPT)

      console.log('[OpenAI Extract] Proxy response received:', {
        success: proxyResult.success,
        hasData: !!proxyResult.data,
        error: proxyResult.error,
        provider: proxyResult.provider,
        fallback: proxyResult.fallback,
        dataType: proxyResult.data ? typeof proxyResult.data : 'undefined',
        dataKeys: proxyResult.data ? Object.keys(proxyResult.data).slice(0, 10) : [],
      })

      if (!proxyResult.success || !proxyResult.data) {
        const errorMsg = proxyResult.error || 'OpenAI extraction via proxy failed'
        console.error('[OpenAI Extract] Proxy failed:', errorMsg)
        throw new Error(errorMsg)
      }

      result = proxyResult.data as unknown as ExtractedPolicyData

      console.log('[OpenAI Extract] Parsed result:', {
        hasConfidence: !!result.confidence,
        confidenceOverall: result.confidence?.overall,
        hasCoverages: !!result.coverages,
        coveragesIsArray: Array.isArray(result.coverages),
        coveragesLength: Array.isArray(result.coverages) ? result.coverages.length : 'N/A',
        hasAmendmentInfo: !!result.amendmentInfo,
        policyNumber: result.policyNumber,
        provider: result.provider,
        policyType: result.policyType,
      })

      // Ensure required fields exist (server may not enforce schema)
      // Add defaults for any missing required fields
      if (!result.confidence) {
        console.log('[OpenAI Extract] Adding default confidence scores')
        result.confidence = {
          overall: 0.7,
          policyNumber: 0.7,
          provider: 0.7,
          dates: 0.7,
          premium: 0.7,
          coverages: 0.7,
        }
      }
      if (!result.coverages || !Array.isArray(result.coverages)) {
        console.log('[OpenAI Extract] Adding default coverages array')
        result.coverages = []
      }
      if (!result.specialConditions || !Array.isArray(result.specialConditions)) {
        result.specialConditions = []
      }
      if (!result.exclusions || !Array.isArray(result.exclusions)) {
        result.exclusions = []
      }
      if (!result.amendmentInfo) {
        console.log('[OpenAI Extract] Adding default amendmentInfo')
        result.amendmentInfo = {
          isAmendment: false,
          amendmentNumber: null,
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        }
      }

      console.log('[OpenAI Extract] After applying defaults - returning result')

      // Estimate output tokens from response
      actualOutputTokens = estimateTokens(JSON.stringify(result))
    } else {
      // Fall back to direct API (development)
      const client = getOpenAIClient()

      if (!client) {
        throw new Error('OpenAI client not available')
      }

      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: EXTRACTION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACTION_JSON_SCHEMA,
        },
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
      })

      const content = response.choices[0]?.message?.content

      if (!content) {
        throw new Error('No response from OpenAI model')
      }

      result = JSON.parse(content) as ExtractedPolicyData

      // Use actual token counts from response if available
      if (response.usage) {
        actualInputTokens = response.usage.prompt_tokens
        actualOutputTokens = response.usage.completion_tokens
      } else {
        actualOutputTokens = estimateTokens(content)
      }
    }

    const durationMs = Date.now() - startTime

    // Track successful API call with cost
    await costTracker.recordUsage({
      provider: 'openai',
      model,
      operation: 'extraction',
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
      cacheHit: false,
      documentLength: truncatedText.length,
      durationMs,
      success: true,
      userId,
    })

    // Cache the result
    await aiCache.setExtraction(truncatedText, 'openai', result)

    // Log successful extraction with cost info
    console.log('[OpenAI Extract] Extraction complete, logging audit...')
    await timedAudit.complete({
      provider: 'openai',
      confidence: result.confidence?.overall ?? 0.7,
      cacheHit: false,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime

    // Track failed request
    await costTracker.recordUsage({
      provider: 'openai',
      model,
      operation: 'extraction',
      inputTokens: actualInputTokens,
      outputTokens: 0,
      cacheHit: false,
      documentLength: truncatedText.length,
      durationMs,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      userId,
    })

    // Log failed extraction
    await timedAudit.fail(error instanceof Error ? error : new Error(String(error)), {
      provider: 'openai',
    })
    throw error
  }
}
