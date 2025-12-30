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

/**
 * Extract policy data using OpenAI GPT-4
 * Uses secure backend proxy in production, direct API in development
 * Implements caching for cost reduction (~60% savings on repeated documents)
 */
export async function extractWithOpenAI(documentText: string): Promise<ExtractedPolicyData> {
  // Initialize cache if not already done
  await aiCache.initialize()

  // Truncate very long documents to fit context window
  const maxChars = 30000
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  // Check cache first
  const cached = await aiCache.getExtraction(truncatedText, 'openai')
  if (cached) {
    return cached
  }

  const userMessage = `Please extract the insurance policy information from this document:\n\n${truncatedText}`

  let result: ExtractedPolicyData

  // Use proxy if configured (production)
  if (isProxyConfigured()) {
    const proxyResult = await extractViaProxy('openai', userMessage, EXTRACTION_SYSTEM_PROMPT)

    if (!proxyResult.success || !proxyResult.data) {
      throw new Error(proxyResult.error || 'OpenAI extraction via proxy failed')
    }

    result = proxyResult.data as unknown as ExtractedPolicyData
  } else {
    // Fall back to direct API (development)
    const client = getOpenAIClient()

    if (!client) {
      throw new Error('OpenAI client not available')
    }

    const response = await client.chat.completions.create({
      model: AI_CONFIG.openai.extractionModel,
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
  }

  // Cache the result
  await aiCache.setExtraction(truncatedText, 'openai', result)

  return result
}
