import { getAnthropicClient, AI_CONFIG, isProxyConfigured, extractViaProxy } from '../config'
import { ExtractedPolicyData, EXTRACTION_SYSTEM_PROMPT } from '../extraction-schema'
import { aiCache } from '../cache'
import { costTracker, estimateTokens } from '../cost-tracking'
import { rateLimiter, auditLogger, createTimedAudit } from '@/lib/security'

/**
 * Claude-specific JSON schema prompt
 * Claude uses a different approach for structured output
 */
const CLAUDE_JSON_PROMPT = `${EXTRACTION_SYSTEM_PROMPT}

## Output Format

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "policyNumber": string | null,
  "provider": string | null,
  "policyType": "kasko" | "traffic" | "home" | "health" | "life" | "dask" | "business" | null,
  "insuredName": string | null,
  "insuredAddress": string | null,
  "startDate": string | null,  // YYYY-MM-DD format
  "endDate": string | null,    // YYYY-MM-DD format
  "premium": number | null,
  "currency": string | null,
  "paymentFrequency": "annual" | "semi-annual" | "quarterly" | "monthly" | null,
  "coverages": [
    {
      "name": string,
      "limit": number | null,
      "deductible": number | null,
      "description": string | null
    }
  ],
  "specialConditions": string[],
  "exclusions": string[],
  "confidence": {
    "overall": number,      // 0-1
    "policyNumber": number, // 0-1
    "provider": number,     // 0-1
    "dates": number,        // 0-1
    "premium": number,      // 0-1
    "coverages": number     // 0-1
  }
}

Do not include any text before or after the JSON. Only output valid JSON.`

/**
 * Get current user ID for rate limiting
 */
function getCurrentUserId(): string {
  if (typeof localStorage !== 'undefined') {
    const userId = localStorage.getItem('insurai_user_id')
    if (userId) return userId
  }
  return (
    'anonymous_' +
    (typeof sessionStorage !== 'undefined'
      ? (sessionStorage.getItem('session_id') ?? 'unknown')
      : 'unknown')
  )
}

/**
 * Extract policy data using Anthropic Claude
 * Uses secure backend proxy in production, direct API in development
 * Implements caching for cost reduction (~60% savings on repeated documents)
 * Includes rate limiting, audit logging, and cost tracking for production readiness
 */
export async function extractWithClaude(
  documentText: string,
  notifyUserId?: string
): Promise<ExtractedPolicyData> {
  const userId = getCurrentUserId()
  const model = AI_CONFIG.anthropic.extractionModel

  // Check rate limit
  const rateLimitResult = rateLimiter.consume('ai_extraction', userId)
  if (!rateLimitResult.allowed) {
    const error = new Error(
      'AI extraction rate limit exceeded. Please wait before processing more documents.'
    )
    await auditLogger.logAI(
      'ai.extraction_failed',
      {
        provider: 'anthropic',
        documentLength: documentText.length,
      },
      {
        userId,
        success: false,
        errorMessage: 'Rate limit exceeded',
      }
    )
    throw error
  }

  // Start timed audit
  const timedAudit = createTimedAudit(
    'ai.extraction_started',
    {
      provider: 'anthropic',
      documentLength: documentText.length,
    },
    { userId }
  )

  // Initialize cache and cost tracker
  await Promise.all([aiCache.initialize(), costTracker.initialize()])

  // Truncate very long documents to fit context window
  const maxChars = 100000 // Claude has larger context window
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  // Build the user message
  const userMessage = `${CLAUDE_JSON_PROMPT}\n\nPlease extract the insurance policy information from this document:\n\n${truncatedText}`

  // Estimate input tokens for cost tracking
  const estimatedInputTokens = estimateTokens(userMessage)

  // Check cache first
  const cached = await aiCache.getExtraction(truncatedText, 'anthropic', {
    promptVersion: 'v2-evidence',
  })
  if (cached) {
    // Track cached request (shows cost savings)
    await costTracker.recordUsage({
      provider: 'anthropic',
      model,
      operation: 'extraction',
      inputTokens: estimatedInputTokens,
      outputTokens: 0,
      cacheHit: true,
      documentLength: truncatedText.length,
      success: true,
      userId,
    })

    await auditLogger.logAI(
      'ai.extraction_cached',
      {
        provider: 'anthropic',
        documentLength: truncatedText.length,
        cacheHit: true,
        confidence: cached.confidence?.overall ?? 0.7,
      },
      { userId, success: true }
    )
    return cached
  }

  const startTime = Date.now()
  let result: ExtractedPolicyData
  let actualInputTokens = estimatedInputTokens
  let actualOutputTokens = 0

  try {
    // Use proxy if configured (production)
    if (isProxyConfigured()) {
      const proxyResult = await extractViaProxy(
        'anthropic',
        userMessage,
        EXTRACTION_SYSTEM_PROMPT,
        notifyUserId
      )

      if (!proxyResult.success || !proxyResult.data) {
        throw new Error(proxyResult.error || 'Claude extraction via proxy failed')
      }

      result = proxyResult.data as unknown as ExtractedPolicyData

      // Attach proxy metadata for observability logging
      result._proxyMeta = {
        requestId: proxyResult.requestId,
        route: proxyResult.route,
        provider: proxyResult.provider,
        fallback: proxyResult.fallback,
        fallbackReason: proxyResult.fallbackReason,
        fallbackChain: proxyResult.fallbackChain,
      }

      // Ensure required fields exist (server may not enforce schema)
      // Add defaults for any missing required fields
      if (!result.confidence) {
        result.confidence = {
          overall: 0.7,
          policyNumber: 0.7,
          provider: 0.7,
          dates: 0.7,
          premium: 0.7,
          coverages: 0.7,
        }
      }
      if (!result.coverages) {
        result.coverages = []
      }
      if (!result.specialConditions) {
        result.specialConditions = []
      }
      if (!result.exclusions) {
        result.exclusions = []
      }
      if (!result.amendmentInfo) {
        result.amendmentInfo = {
          isAmendment: false,
          amendmentNumber: null,
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        }
      }

      // Estimate output tokens from response
      actualOutputTokens = estimateTokens(JSON.stringify(result))
    } else {
      // Fall back to direct API (development)
      const client = await getAnthropicClient()

      if (!client) {
        throw new Error('Anthropic client not available')
      }

      const response = await client.messages.create({
        model,
        max_tokens: AI_CONFIG.maxTokens,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      })

      // Extract text content from response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlock = response.content.find((block: any) => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude model')
      }

      const content = textBlock.text.trim()

      // Parse JSON (Claude may include markdown code blocks)
      let jsonContent = content

      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim()
      }

      try {
        result = JSON.parse(jsonContent) as ExtractedPolicyData
      } catch (parseError) {
        // Try to extract JSON from the response
        const jsonStart = content.indexOf('{')
        const jsonEnd = content.lastIndexOf('}')
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonContent = content.slice(jsonStart, jsonEnd + 1)
          result = JSON.parse(jsonContent) as ExtractedPolicyData
        } else {
          throw new Error(`Failed to parse Claude response as JSON: ${parseError}`)
        }
      }

      // Use actual token counts from response if available
      if (response.usage) {
        actualInputTokens = response.usage.input_tokens
        actualOutputTokens = response.usage.output_tokens
      } else {
        actualOutputTokens = estimateTokens(content)
      }
    }

    const durationMs = Date.now() - startTime

    // Track successful API call with cost
    await costTracker.recordUsage({
      provider: 'anthropic',
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
    await aiCache.setExtraction(truncatedText, 'anthropic', result, {
      promptVersion: 'v2-evidence',
    })

    // Log successful extraction with cost info
    console.warn('[Claude Extract] Extraction complete, logging audit...')
    await timedAudit.complete({
      provider: 'anthropic',
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
      provider: 'anthropic',
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
      provider: 'anthropic',
    })
    throw error
  }
}
