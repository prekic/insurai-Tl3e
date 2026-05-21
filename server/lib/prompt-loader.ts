/**
 * Prompt Loader
 *
 * Centralised prompt-loading facade for ALL providers in the extraction
 * pipeline. Every extraction path (Anthropic, OpenAI, DeepSeek, debate)
 * MUST go through this module to guarantee identical system prompts.
 *
 * This is Fix-2 of the fallback chain hardening: "identical v4 system prompt
 * across all three providers".
 */

import { getExtractionPrompt } from '../services/prompt-service.js'
import { buildAnthropicSchemaPrompt } from '../lib/ai-prompts.js'
import { getAIConfig } from '../services/config-service.js'
import { logger } from '../lib/logger.js'

const log = logger.child('prompt-loader')

export interface LoadedPrompts {
  /** Prompt suitable for OpenAI / DeepSeek (json_schema response_format) */
  openaiSystemPrompt: string
  /** Prompt suitable for Anthropic (appended Anthropic schema prompt) */
  anthropicSystemPrompt: string
  /** Final user prompt (may have been rendered from template) */
  userPrompt: string
  /** Prompt template metadata (undefined if client-provided or fallback) */
  templateMeta?: {
    templateName: string
    version: number
  }
}

/**
 * Load prompts for a single extraction request.
 *
 * Source priority:
 *   1. Client-provided `systemPrompt` body field (legacy backward compat)
 *   2. Admin-managed prompt from Supabase `prompt_templates` table
 *   3. Hardcoded fallback ("Extract policy information as JSON.")
 *
 * For OpenAI/DeepSeek:
 *   - `openaiSystemPrompt` is used directly as the system message.
 *
 * For Anthropic:
 *   - `anthropicSystemPrompt` includes the json-schema definition appended
 *     because the Anthropic API doesn't support response_format: json_schema.
 *
 * @param documentText - The OCR'd document text
 * @param policyType   - Optional policy type hint ("kasko", "traffic", etc.)
 * @param clientPrompt - Optional client-provided system prompt (overrides admin prompt)
 */
export async function loadPrompts(
  documentText: string,
  policyType?: string,
  clientPrompt?: string
): Promise<LoadedPrompts> {
  // Load AI config for schema prompt weights
  const aiConfig = await getAIConfig()
  const confidenceWeights = {
    policyNumber: aiConfig.confidenceWeightPolicyNumber,
    provider: aiConfig.confidenceWeightProvider,
    dates: aiConfig.confidenceWeightDates,
    premium: aiConfig.confidenceWeightPremium,
    coverages: aiConfig.confidenceWeightCoverages,
  }
  const anthropicSchemaPrompt = buildAnthropicSchemaPrompt(confidenceWeights)

  if (clientPrompt) {
    // Backward compat: client provided the full system prompt
    return {
      openaiSystemPrompt: clientPrompt,
      anthropicSystemPrompt: `${clientPrompt}\n\n${anthropicSchemaPrompt}`,
      userPrompt: documentText,
    }
  }

  // Load admin-managed prompt from Supabase
  const renderedPrompt = await getExtractionPrompt(documentText, policyType)

  if (renderedPrompt) {
    return {
      openaiSystemPrompt: renderedPrompt.systemPrompt,
      anthropicSystemPrompt: `${renderedPrompt.systemPrompt}\n\n${anthropicSchemaPrompt}`,
      userPrompt: renderedPrompt.userPrompt,
      templateMeta: {
        templateName: renderedPrompt.templateName,
        version: renderedPrompt.version,
      },
    }
  }

  // Hardcoded fallback (should never happen in production with Supabase configured)
  log.warn('No admin prompt available — using hardcoded fallback')
  return {
    openaiSystemPrompt: 'Extract policy information as JSON.',
    anthropicSystemPrompt: `Extract policy information as JSON.\n\n${anthropicSchemaPrompt}`,
    userPrompt: documentText,
  }
}

/**
 * Get the prompt version string for logging / response metadata.
 * Returns undefined when no template was used (client-provided or fallback).
 */
export function getPromptVersionTag(meta: LoadedPrompts['templateMeta']): string | undefined {
  if (!meta) return undefined
  return `${meta.templateName} v${meta.version}`
}
