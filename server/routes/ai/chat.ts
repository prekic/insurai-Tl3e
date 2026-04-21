/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 * Includes cost tracking and budget enforcement.
 */

import Anthropic from '@anthropic-ai/sdk'
import { Request, Response, Router } from 'express'
import OpenAI from 'openai'
import logger from '../../lib/logger.js'
import { calculateCost, recordUsage } from '../../middleware/cost-control.js'
import { chatLimiter } from '../../middleware/rate-limit.js'
import {
  validateChat,
  validateJSON,
  type ChatInput,
  type ChatMessage,
} from '../../middleware/validation.js'
import { getAIConfig } from '../../services/config-service.js'
import { getChatPrompt } from '../../services/prompt-service.js'

const log = logger.child('AI')

const router = Router()

import { recordOverviewMetrics } from './shared.js'

// Initialize clients (lazy - only when keys are available)
let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

const CHAT_SYSTEM_PROMPT_FALLBACK = `You are an expert insurance policy assistant for the Turkish insurance market. You help users understand their insurance policies, answer questions about coverage, compare policies, and identify potential gaps or issues.

Key guidelines:
- Be helpful, professional, and concise
- When discussing coverage, always mention specific limits and deductibles when available
- If you're unsure about something, say so rather than making up information
- Use Turkish insurance terminology when appropriate (e.g., Kasko, DASK, Trafik Sigortası)
- Currency should be in TRY (Turkish Lira)
- When comparing policies, highlight key differences in coverage, limits, and exclusions
- If asked about something outside the scope of the provided policy information, politely redirect to the policy content

If the user provides policy context, use that information to answer questions accurately.`

/**
 * POST /api/ai/chat
 * Multi-turn chat endpoint for policy assistant
 * Rate limited: 60 requests per hour
 * Supports conversation history for context
 * Uses admin-managed prompt from database with fallback
 */
router.post(
  '/chat',
  validateJSON,
  chatLimiter,
  validateChat,
  async (req: Request, res: Response) => {
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    const chatStart = Date.now()

    try {
      const { message, conversationHistory, policyContext, provider } = req.body as ChatInput

      // Try the requested provider, fall back to the other if not available
      let useProvider = provider
      if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
        useProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai'
      } else if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
        useProvider = process.env.OPENAI_API_KEY ? 'openai' : 'anthropic'
      }

      // Get system prompt from admin (with fallback)
      let systemPrompt: string
      const renderedPrompt = await getChatPrompt(message, policyContext)
      if (renderedPrompt) {
        systemPrompt = renderedPrompt.systemPrompt
        log.info('Using chat prompt template', {
          template: renderedPrompt.templateName,
          version: renderedPrompt.version,
        })
      } else {
        // Fallback to hardcoded prompt
        systemPrompt = CHAT_SYSTEM_PROMPT_FALLBACK
        if (policyContext) {
          systemPrompt += `\n\nPolicy Information:\n${policyContext}`
        }
        log.info('Using fallback chat prompt', { reason: 'admin prompt unavailable' })
      }

      // Get AI config for chat settings
      const aiConfig = await getAIConfig()

      if (useProvider === 'openai') {
        const client = getOpenAIClient()
        if (!client) {
          return res.status(503).json({
            error: IS_PRODUCTION ? 'Chat service unavailable' : 'OpenAI not configured',
            code: 'PROVIDER_NOT_CONFIGURED',
          })
        }

        // Build messages array with history
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: message },
        ]

        const response = await client.chat.completions.create({
          model: aiConfig.openaiBackupModel, // Use backup/fast model for chat
          messages,
          max_tokens: 1024,
          temperature: aiConfig.chatTemperature,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          return res.status(500).json({
            error: IS_PRODUCTION ? 'Unable to generate response' : 'Empty response from OpenAI',
            code: 'EMPTY_RESPONSE',
          })
        }

        // Track cost usage for chat
        const chatModel = response.model || aiConfig.openaiBackupModel
        const inputTokens = response.usage?.prompt_tokens || 0
        const outputTokens = response.usage?.completion_tokens || 0
        const cost = calculateCost(chatModel, inputTokens, outputTokens)

        // Record usage asynchronously
        recordUsage({
          provider: 'openai',
          model: chatModel,
          operation: 'chat',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          timestamp: new Date().toISOString(),
        }).catch((err) => {
          if (!IS_PRODUCTION)
            log.debug('Cost tracking failed', {
              error: err instanceof Error ? err.message : String(err),
            })
        })

        recordOverviewMetrics({
          requestId: `chat-${Date.now()}`,
          provider: 'openai',
          model: chatModel,
          operation: 'chat',
          success: true,
          durationMs: Date.now() - chatStart,
          inputTokens,
          outputTokens,
          cost: cost.totalCost,
          userId: req.headers['x-user-id'] as string | undefined,
        })

        return res.json({
          success: true,
          response: content,
          provider: 'openai',
          usage: response.usage,
          cost: cost.totalCost,
        })
      } else {
        // Anthropic
        const client = getAnthropicClient()
        if (!client) {
          return res.status(503).json({
            error: IS_PRODUCTION ? 'Chat service unavailable' : 'Anthropic not configured',
            code: 'PROVIDER_NOT_CONFIGURED',
          })
        }

        // Build messages array with history
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory.map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: message },
        ]

        const response = await client.messages.create({
          model: aiConfig.anthropicBackupModel, // Use backup/fast model for chat
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        })

        const textBlock = response.content.find((block) => block.type === 'text')
        if (!textBlock || textBlock.type !== 'text') {
          return res.status(500).json({
            error: IS_PRODUCTION ? 'Unable to generate response' : 'Empty response from Anthropic',
            code: 'EMPTY_RESPONSE',
          })
        }

        // Track cost usage for chat
        const chatModel = response.model || aiConfig.anthropicBackupModel
        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        const cost = calculateCost(chatModel, inputTokens, outputTokens)

        // Record usage asynchronously
        recordUsage({
          provider: 'anthropic',
          model: chatModel,
          operation: 'chat',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          timestamp: new Date().toISOString(),
        }).catch((err) => {
          if (!IS_PRODUCTION)
            log.debug('Cost tracking failed', {
              error: err instanceof Error ? err.message : String(err),
            })
        })

        recordOverviewMetrics({
          requestId: `chat-${Date.now()}`,
          provider: 'anthropic',
          model: chatModel,
          operation: 'chat',
          success: true,
          durationMs: Date.now() - chatStart,
          inputTokens,
          outputTokens,
          cost: cost.totalCost,
          userId: req.headers['x-user-id'] as string | undefined,
        })

        return res.json({
          success: true,
          response: textBlock.text,
          provider: 'anthropic',
          usage: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
          },
          cost: cost.totalCost,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: (req.body as ChatInput).provider || 'unknown',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message: errorMessage,
      }

      if (!IS_PRODUCTION) {
        log.debug('Chat failed', errorDetails)
      }

      // Determine specific error code
      let code = 'CHAT_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process your message' : 'Chat request failed'

      if (errorMessage.includes('401') || errorMessage.includes('API key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'Chat service temporarily unavailable' : 'API key is invalid'
      } else if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Rate limit exceeded'
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Request timed out'
      }

      res.status(500).json({
        error: userMessage,
        code,
        ...(!IS_PRODUCTION && { details: errorMessage }),
        timestamp: errorDetails.timestamp,
      })
    }
  }
)
// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

export default router
