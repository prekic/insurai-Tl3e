import { getOpenAIClient, AI_CONFIG } from '../config'
import { ExtractedPolicyData, EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from '../extraction-schema'

/**
 * Extract policy data using OpenAI GPT-4
 */
export async function extractWithOpenAI(documentText: string): Promise<ExtractedPolicyData> {
  const client = getOpenAIClient()

  if (!client) {
    throw new Error('OpenAI client not available')
  }

  // Truncate very long documents to fit context window
  const maxChars = 30000
  const truncatedText =
    documentText.length > maxChars
      ? documentText.slice(0, maxChars) + '\n\n[Document truncated...]'
      : documentText

  const response = await client.chat.completions.create({
    model: AI_CONFIG.openai.extractionModel,
    messages: [
      {
        role: 'system',
        content: EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Please extract the insurance policy information from this document:\n\n${truncatedText}`,
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
