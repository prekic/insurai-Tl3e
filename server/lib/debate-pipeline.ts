/**
 * Multi-LLM Debate Pipeline
 *
 * Runs up to 3 rounds of cross-validation between two extractors,
 * using a comparator to detect disagreements and optional arbitration.
 *
 * Architecture:
 *   Round 1: Two independent extractors (same prompt, separate calls)
 *   Round 2: Both see each other's output + extractions, cross-review and revise
 *   Round 3: Arbitrator LLM reviews all 4 outputs + original doc text, produces final
 *
 * Early-exit: if comparator says "agreed" at any round, skip remaining rounds.
 */

import OpenAI from 'openai'
import { EXTRACTION_JSON_SCHEMA } from '../../shared/extraction-schema.js'
import { calculateCost } from '../../src/lib/ai/cost-tracking/index.js'

export interface DebateConfig {
  model?: string
  maxRounds?: number // 1-3, default 3
  temperature?: number
  extractTimeout?: number // per call, default 180s
}

export interface ExtractionWithMeta {
  content: string
  parsed: Record<string, unknown>
  usage: {
    inputTokens: number
    outputTokens: number
    cost: number
    model: string
    source: string // 'extractor_a' | 'extractor_b' | 'arbitrator'
    round?: number
  }
}

export interface DebateResult {
  final: ExtractionWithMeta
  roundCount: number
  rounds: ExtractionWithMeta[]
  disagreements: string[]
  totalCost: number
  totalTokens: number
}

// ─── Comparator Prompts ───────────────────────────────────────────────────────

const COMPARATOR_SYSTEM_PROMPT = `You are an expert Insurance Policy JSON Comparator. Your task is to compare two JSON extractions of the same policy document and identify meaningful disagreements.

Focus on DIFFERENCES THAT MATTER:
1. Premium/Financial fields (premiumNet, premiumTax, premium, paymentFrequency)
2. NCD discount % and kademe
3. Coverage limits (especially when one says null/None and other has a value)
4. Missing coverages (one found a coverage the other missed entirely)
5. Exclusions (major differences in count or detail)
6. Policy metadata (policyNumber, provider, dates, vehicle info)
7. isBundle, insuredEntityType

IGNORE minor differences: trailing zeros, whitespace, field ordering, tr/en label variations.

Output ONLY valid JSON:
{
  "agreed": boolean,        // true if no meaningful disagreements found
  "assessment": string,     // brief summary of agreement level
  "disagreements": [{       // empty array if agreed
    "field": "field.path",
    "valueA": "...",
    "valueB": "...",
    "significance": "critical" | "major" | "minor"
  }],
  "requiresRound2": boolean // true if critical or major disagreements exist
}`

const ARBITRATOR_SYSTEM_PROMPT = `You are an expert Insurance Policy Arbitrator. Given two extraction attempts (Original and Revised) from TWO different extractors — four JSON outputs total.

Produce the single best, most accurate extraction by:
1. Identifying which values are most consistent with the original document text
2. Preferring values that both extractors converged on after seeing each other's work
3. For persistent disagreements, choosing the most reasonable value based on the document

If an extractor hallucinated a value (e.g. limit of 100,000 when document says 5,000), prefer the correct value.

Output ONLY valid complete extraction JSON. Be comprehensive — include all fields, coverages, exclusions, and metadata.`

const ROUND2_PROMPT_SUFFIX = `\n\nIMPORTANT: Another AI has extracted data from the same document. Review their output below — if they found coverages or values you missed, incorporate them. If you think their values are wrong, keep yours.\n\nOTHER EXTRACTOR'S OUTPUT:\n`

const ROUND3_PROMPT_SUFFIX = `\n\nYou are extracting this data a FINAL time. Two previous rounds have completed. Review all previous attempts and produce the best possible extraction.\n`

// ─── Core Pipeline ────────────────────────────────────────────────────────────

async function callExtractor(
  client: OpenAI,
  systemMsg: string,
  userMsg: string,
  config: DebateConfig & { source: string; round: number }
): Promise<ExtractionWithMeta> {
  const response = await client.chat.completions.create(
    {
      model: config.model || 'gpt-5.4',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: EXTRACTION_JSON_SCHEMA,
      },
      temperature: config.temperature ?? 0.1,
    },
    { signal: AbortSignal.timeout(config.extractTimeout ?? 180_000) }
  )

  const content = response.choices[0]?.message?.content || ''
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = {}
  }

  const usedModel = response.model || config.model || 'gpt-5.4'
  const inputTokens = response.usage?.prompt_tokens || 0
  const outputTokens = response.usage?.completion_tokens || 0

  return {
    content,
    parsed,
    usage: {
      inputTokens,
      outputTokens,
      cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
      model: usedModel,
      source: config.source,
      round: config.round,
    },
  }
}

async function compareExtractions(
  client: OpenAI,
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Promise<{
  agreed: boolean
  assessment: string
  disagreements: Array<{ field: string; valueA: string; valueB: string; significance: string }>
  requiresRound2: boolean
}> {
  const response = await client.chat.completions.create(
    {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COMPARATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Compare these two extractions of the same policy document:\n\nEXTRACTOR A:\n${JSON.stringify(a, null, 2)}\n\nEXTRACTOR B:\n${JSON.stringify(b, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    },
    { signal: AbortSignal.timeout(60_000) }
  )

  const content = response.choices[0]?.message?.content || '{}'
  try {
    return JSON.parse(content)
  } catch {
    return {
      agreed: false,
      assessment: 'Comparator parse failed',
      disagreements: [],
      requiresRound2: true,
    }
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run the multi-LLM debate pipeline.
 *
 * @param client - OpenAI client instance
 * @param systemPrompt - System prompt (from prompt service's systemPrompt field)
 * @param userPrompt - User prompt (from prompt service's userPrompt OR raw documentText)
 * @param originalDocumentText - Raw document text for arbitrator reference (not injected into extractor prompts)
 * @param debateConfig - Configuration options
 */
export async function runDebatePipeline(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  originalDocumentText: string,
  debateConfig: DebateConfig = {}
): Promise<DebateResult> {
  const maxRounds = Math.min(debateConfig.maxRounds ?? 3, 3)
  const results: ExtractionWithMeta[] = []
  const disagreements: string[] = []
  let totalCost = 0
  let totalTokens = 0

  // ── Round 1: Two independent extractions in parallel ────────────────

  const [extractorA, extractorB] = await Promise.all([
    callExtractor(client, systemPrompt, userPrompt, {
      ...debateConfig,
      source: 'extractor_a',
      round: 1,
    }),
    callExtractor(client, systemPrompt, userPrompt, {
      ...debateConfig,
      source: 'extractor_b',
      round: 1,
    }),
  ])

  results.push(extractorA, extractorB)
  totalCost += extractorA.usage.cost + extractorB.usage.cost
  totalTokens += extractorA.usage.inputTokens + extractorA.usage.outputTokens
  totalTokens += extractorB.usage.inputTokens + extractorB.usage.outputTokens

  // ── Compare Round 1 ─────────────────────────────────────────────────

  const comparison1 = await compareExtractions(client, extractorA.parsed, extractorB.parsed)

  if (comparison1.agreed || maxRounds === 1) {
    return {
      final: extractorA,
      roundCount: 1,
      rounds: results,
      disagreements: [],
      totalCost,
      totalTokens,
    }
  }

  // Track disagreements
  for (const d of comparison1.disagreements) {
    if (d.significance === 'critical' || d.significance === 'major') {
      disagreements.push(`${d.field}: A=${d.valueA} vs B=${d.valueB}`)
    }
  }

  if (maxRounds < 2) {
    return {
      final: extractorA,
      roundCount: 1,
      rounds: results,
      disagreements,
      totalCost,
      totalTokens,
    }
  }

  // ── Round 2: Cross-review ──────────────────────────────────────────

  const round2PromptB_extra = `\n\n${ROUND2_PROMPT_SUFFIX}${JSON.stringify(extractorA.parsed, null, 2)}`
  const round2PromptA_extra = `\n\n${ROUND2_PROMPT_SUFFIX}${JSON.stringify(extractorB.parsed, null, 2)}`

  const [revisedA, revisedB] = await Promise.all([
    callExtractor(client, systemPrompt, userPrompt + round2PromptA_extra, {
      ...debateConfig,
      source: 'extractor_a',
      round: 2,
    }),
    callExtractor(client, systemPrompt, userPrompt + round2PromptB_extra, {
      ...debateConfig,
      source: 'extractor_b',
      round: 2,
    }),
  ])

  results.push(revisedA, revisedB)
  totalCost += revisedA.usage.cost + revisedB.usage.cost
  totalTokens += revisedA.usage.inputTokens + revisedA.usage.outputTokens

  // ── Compare Round 2 ────────────────────────────────────────────────

  const comparison2 = await compareExtractions(client, revisedA.parsed, revisedB.parsed)

  for (const d of comparison2.disagreements) {
    if (d.significance === 'critical' || d.significance === 'major') {
      const key = `${d.field}: A=${d.valueA} vs B=${d.valueB}`
      if (!disagreements.includes(key)) {
        disagreements.push(key)
      }
    }
  }

  if (comparison2.agreed || maxRounds < 3) {
    // Converged — merge and return
    const merged = mergeExtractions(revisedA.parsed, revisedB.parsed)
    const final: ExtractionWithMeta = {
      content: JSON.stringify(merged),
      parsed: merged,
      usage: {
        ...revisedA.usage,
        source: 'merged_ab',
        round: 2,
      },
    }
    return {
      final,
      roundCount: 2,
      rounds: results,
      disagreements,
      totalCost,
      totalTokens,
    }
  }

  // ── Round 3: Arbitration ───────────────────────────────────────────

  const arbUserPrompt = `ORIGINAL DOCUMENT:\n\n${originalDocumentText}\n\n${ROUND3_PROMPT_SUFFIX}\n\nROUND 1:\nA: ${JSON.stringify(extractorA.parsed, null, 2)}\nB: ${JSON.stringify(extractorB.parsed, null, 2)}\n\nROUND 2:\nA (revised): ${JSON.stringify(revisedA.parsed, null, 2)}\nB (revised): ${JSON.stringify(revisedB.parsed, null, 2)}\n\nCOMPARATOR NOTES:\n${comparison2.assessment}\n\nKEY DISAGREEMENTS:\n${comparison2.disagreements.map((d: any) => `- ${d.field}: ${d.valueA} vs ${d.valueB} (${d.significance})`).join('\n')}\n\nProduce the single best, complete extraction JSON.`

  const arbitratorResult = await callExtractor(client, ARBITRATOR_SYSTEM_PROMPT, arbUserPrompt, {
    ...debateConfig,
    source: 'arbitrator',
    round: 3,
  })

  results.push(arbitratorResult)
  totalCost += arbitratorResult.usage.cost
  totalTokens += arbitratorResult.usage.inputTokens + arbitratorResult.usage.outputTokens

  return {
    final: arbitratorResult,
    roundCount: 3,
    rounds: results,
    disagreements,
    totalCost,
    totalTokens,
  }
}

// ── Merge Helpers ─────────────────────────────────────────────────────────────

function mergeExtractions(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])

  for (const key of allKeys) {
    const va = a[key]
    const vb = b[key]

    if (va === undefined || va === null) {
      merged[key] = vb
    } else if (vb === undefined || vb === null) {
      merged[key] = va
    } else if (Array.isArray(va) && Array.isArray(vb)) {
      merged[key] = va.length >= vb.length ? va : vb
    } else {
      merged[key] = va
    }
  }
  return merged
}

export default { runDebatePipeline }
