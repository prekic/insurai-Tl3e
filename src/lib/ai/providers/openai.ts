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

/**
 * Extract policy data using OpenAI GPT-4
 * Uses secure backend proxy in production, direct API in development
 */
export async function extractWithOpenAI(documentText: string): Promise<ExtractedPolicyData> {
  // Truncate very long documents to fit context window
  const maxChars = 30000
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  const userMessage = `Please extract the insurance policy information from this document:\n\n${truncatedText}`

  // Use proxy if configured (production)
  if (isProxyConfigured()) {
    const result = await extractViaProxy('openai', userMessage, EXTRACTION_SYSTEM_PROMPT)

    if (!result.success || !result.data) {
      throw new Error(result.error || 'OpenAI extraction via proxy failed')
    }

    return result.data as unknown as ExtractedPolicyData
  }

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

  return JSON.parse(content) as ExtractedPolicyData
}
