/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 * Includes cost tracking and budget enforcement.
 */

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
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
let geminiClient: GoogleGenAI | null = null

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

function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
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

      // ── Fallback chain: try requested provider, then fallbacks, then Gemini ──
      let lastError: unknown
      const successProvider: 'openai' | 'anthropic' | 'gemini' | '' = ''

      // Helper to attempt a provider
      async function tryChatProvider(
        providerName: string,
        caller: () => Promise<boolean>
      ): Promise<boolean> {
        try {
          return await caller()
        } catch (err) {
          lastError = err
          log.warn(providerName + ' chat failed, attempting fallback', {
            error: err instanceof Error ? err.message : String(err),
          })
          return false
        }
      }

      // Helper to respond with success
      function respondChat(
        responseText: string,
        providerName: string,
        model: string,
        inputTokens: number,
        outputTokens: number,
        cost: { totalCost: number; inputCost: number; outputCost: number }
      ) {
        recordUsage({
          provider: providerName,
          model,
          operation: 'chat',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          timestamp: new Date().toISOString(),
        }).catch(() => {})

        recordOverviewMetrics({
          requestId: `chat-${Date.now()}`,
          provider: providerName,
          model,
          operation: 'chat',
          success: true,
          durationMs: Date.now() - chatStart,
          inputTokens,
          outputTokens,
          cost: cost.totalCost,
          userId: req.headers['x-user-id'] as string | undefined,
        })

        res.json({
          success: true,
          response: responseText,
          provider: providerName,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          cost: cost.totalCost,
        })
      }

      // Build messages for OpenAI-style API
      const openaiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...conversationHistory.map((msg: ChatMessage) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: message },
      ]

      // Build messages for Anthropic-style API
      const anthropicMessages = conversationHistory.map((msg: ChatMessage) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))
      anthropicMessages.push({ role: 'user' as const, content: message })

      // ── TRY 1: OpenAI ──
      if (!successProvider && useProvider === 'openai') {
        const client = getOpenAIClient()
        if (client) {
          const succeeded = await tryChatProvider('openai', async () => {
            const response = await client.chat.completions.create({
              model: aiConfig.openaiBackupModel,
              messages: openaiMessages,
              max_tokens: 1024,
              temperature: aiConfig.chatTemperature,
            })
            const content = response.choices[0]?.message?.content
            if (!content) return false
            const chatModel = response.model || aiConfig.openaiBackupModel
            const inputTokens = response.usage?.prompt_tokens || 0
            const outputTokens = response.usage?.completion_tokens || 0
            const cost = calculateCost(chatModel, inputTokens, outputTokens)
            respondChat(content, 'openai', chatModel, inputTokens, outputTokens, cost)
            return true
          })
          if (succeeded) {
            log.info('OpenAI chat succeeded', { requestId: `chat-${Date.now()}` })
            return
          }
        }
      }

      // ── TRY 2: Anthropic ──
      if (!successProvider && useProvider === 'anthropic') {
        const client = getAnthropicClient()
        if (client) {
          const succeeded = await tryChatProvider('anthropic', async () => {
            const response = await client.messages.create({
              model: aiConfig.anthropicBackupModel,
              max_tokens: 1024,
              system: systemPrompt,
              messages: anthropicMessages,
            })
            const textBlock = response.content.find((block) => block.type === 'text')
            if (!textBlock || textBlock.type !== 'text') return false
            const chatModel = response.model || aiConfig.anthropicBackupModel
            const inputTokens = response.usage.input_tokens
            const outputTokens = response.usage.output_tokens
            const cost = calculateCost(chatModel, inputTokens, outputTokens)
            respondChat(textBlock.text, 'anthropic', chatModel, inputTokens, outputTokens, cost)
            return true
          })
          if (succeeded) {
            log.info('Anthropic chat succeeded', { requestId: `chat-${Date.now()}` })
            return
          }
        }
      }

      // ── TRY 3: Gemini fallback (always try if previous providers failed) ──
      if (!successProvider) {
        const client = getGeminiClient()
        if (client) {
          const succeeded = await tryChatProvider('gemini', async () => {
            const geminiSystemMsg =
              systemPrompt +
              (conversationHistory.length > 0
                ? '\n\nConversation history:\n' +
                  conversationHistory.map((m) => m.role + ': ' + m.content).join('\n')
                : '') +
              '\n\nUser: ' +
              message

            const response = await client.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [{ role: 'user', parts: [{ text: geminiSystemMsg }] }],
              config: {
                temperature: aiConfig.chatTemperature,
                maxOutputTokens: 1024,
              },
            })

            const content = response.text
            if (!content) return false

            const inputTokens = response.usageMetadata?.promptTokenCount || 0
            const outputTokens = response.usageMetadata?.candidatesTokenCount || 0
            const cost = calculateCost('gemini-2.5-flash', inputTokens, outputTokens)
            respondChat(content, 'gemini', 'gemini-2.5-flash', inputTokens, outputTokens, cost)
            return true
          })
          if (succeeded) {
            log.info('Gemini chat succeeded', { requestId: `chat-${Date.now()}` })
            return
          }
        }
      }

      // ── ALL PROVIDERS FAILED ──
      const errorMessage = lastError instanceof Error ? lastError.message : 'All providers failed'
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
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
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
        timestamp: new Date().toISOString(),
      })
    }
  }
)
// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

export default router
