import {
  getAnthropicClient,
  AI_CONFIG,
  isProxyConfigured,
  extractViaProxy,
} from '../config'
import { ExtractedPolicyData, EXTRACTION_SYSTEM_PROMPT } from '../extraction-schema'
import { aiCache } from '../cache'
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
  return 'anonymous_' + (typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('session_id') ?? 'unknown'
    : 'unknown')
}

/**
 * Extract policy data using Anthropic Claude
 * Uses secure backend proxy in production, direct API in development
 * Implements caching for cost reduction (~60% savings on repeated documents)
 * Includes rate limiting and audit logging for production readiness
 */
export async function extractWithClaude(documentText: string): Promise<ExtractedPolicyData> {
  const userId = getCurrentUserId()

  // Check rate limit
  const rateLimitResult = rateLimiter.consume('ai_extraction', userId)
  if (!rateLimitResult.allowed) {
    const error = new Error('AI extraction rate limit exceeded. Please wait before processing more documents.')
    await auditLogger.logAI('ai.extraction_failed', {
      provider: 'anthropic',
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
    provider: 'anthropic',
    documentLength: documentText.length,
  }, { userId })

  // Initialize cache if not already done
  await aiCache.initialize()

  // Truncate very long documents to fit context window
  const maxChars = 100000 // Claude has larger context window
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  // Check cache first
  const cached = await aiCache.getExtraction(truncatedText, 'anthropic')
  if (cached) {
    await auditLogger.logAI('ai.extraction_cached', {
      provider: 'anthropic',
      documentLength: truncatedText.length,
      cacheHit: true,
      confidence: cached.confidence.overall,
    }, { userId, success: true })
    return cached
  }

  const userMessage = `${CLAUDE_JSON_PROMPT}\n\nPlease extract the insurance policy information from this document:\n\n${truncatedText}`

  let result: ExtractedPolicyData

  try {
    // Use proxy if configured (production)
    if (isProxyConfigured()) {
      const proxyResult = await extractViaProxy('anthropic', userMessage, EXTRACTION_SYSTEM_PROMPT)

      if (!proxyResult.success || !proxyResult.data) {
        throw new Error(proxyResult.error || 'Claude extraction via proxy failed')
      }

      result = proxyResult.data as unknown as ExtractedPolicyData
    } else {
      // Fall back to direct API (development)
      const client = getAnthropicClient()

      if (!client) {
        throw new Error('Anthropic client not available')
      }

      const response = await client.messages.create({
        model: AI_CONFIG.anthropic.extractionModel,
        max_tokens: AI_CONFIG.maxTokens,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      })

      // Extract text content from response
      const textBlock = response.content.find((block) => block.type === 'text')
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
    }

    // Cache the result
    await aiCache.setExtraction(truncatedText, 'anthropic', result)

    // Log successful extraction
    await timedAudit.complete({
      provider: 'anthropic',
      confidence: result.confidence.overall,
      cacheHit: false,
      estimatedCost: 0.03,
    })

    return result
  } catch (error) {
    // Log failed extraction
    await timedAudit.fail(error instanceof Error ? error : new Error(String(error)), {
      provider: 'anthropic',
    })
    throw error
  }
}
