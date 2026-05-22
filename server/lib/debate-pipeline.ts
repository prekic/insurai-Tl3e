/**
 * Multi-LLM Debate Pipeline
 *
 * Runs up to 3 rounds of cross-validation between two extractors,
 * using a comparator to detect disagreements and optional arbitration.
 *
 * Architecture:
 *   Round 1: Two independent extractors (same prompt, separate calls, different variants)
 *   Round 2: Both see each other's output + extractions, cross-review and revise
 *   Round 3: Arbitrator LLM reviews all 4 outputs + original doc text, produces final
 *
 * Early-exit: if comparator says "agreed" at any round, skip remaining rounds.
 *
 * Key difference from original: extractors are NOT tied to a single OpenAI client.
 * Instead, `extractor` is a callable that runs the full fallback chain
 * (Anthropic→OpenAI→DeepSeek), ensuring debate works even when individual
 * providers are unavailable.
 */

import OpenAI from 'openai'

export interface ExtractionWithMeta {
  content: string
  parsed: Record<string, unknown>
  usage: {
    inputTokens: number
    outputTokens: number
    cost: number
    model: string
    source: string // 'extractor_a' | 'extractor_b' | 'arbitrator' | 'comparator'
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

/**
 * An extractor function that takes a system prompt + user prompt + round info
 * and returns extraction meta. The caller (extraction.ts) provides this with
 * the full fallback chain (Anthropic→OpenAI→DeepSeek) so the debate pipeline
 * doesn't need to know about individual providers.
 */
export type ExtractorFn = (
  systemMsg: string,
  userMsg: string,
  variant: 'standard' | 'slightly_different'
) => Promise<ExtractionWithMeta>

export type ComparatorFn = (
  a: Record<string, unknown>,
  b: Record<string, unknown>
) => Promise<{
  agreed: boolean
  assessment: string
  disagreements: Array<{ field: string; valueA: string; valueB: string; significance: string }>
  requiresRound2: boolean
}>

// ─── Prompts ──────────────────────────────────────────────────────────────────

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
  "agreed": boolean,
  "assessment": string,
  "disagreements": [{ "field": "field.path", "valueA": "...", "valueB": "...", "significance": "critical" | "major" | "minor" }],
  "requiresRound2": boolean
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

// ─── Default Comparator (OpenAI) ──────────────────────────────────────────────

export function createOpenAIComparator(client: OpenAI, model = 'deepseek-v4-pro'): ComparatorFn {
  return async (a, b) => {
    const response = await client.chat.completions.create(
      {
        model,
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
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run the multi-LLM debate pipeline.
 *
 * @param extractorA - Function that runs an extraction with fallback chain (variant A)
 * @param extractorB - Function that runs an extraction with fallback chain (variant B)
 * @param comparator - Function that compares two extraction results
 * @param arbitratorExtractor - Function for Round 3 arbitration (uses fallback chain)
 * @param systemPrompt - The base system prompt
 * @param userPrompt - The base user prompt
 * @param originalDocumentText - Raw document text for arbitrator
 * @param maxRounds - 1-3 (default 3)
 */
export async function runDebatePipeline(
  extractorA: ExtractorFn,
  extractorB: ExtractorFn,
  comparator: ComparatorFn,
  arbitratorExtractor: ExtractorFn,
  systemPrompt: string,
  userPrompt: string,
  originalDocumentText: string,
  maxRounds = 3
): Promise<DebateResult> {
  const results: ExtractionWithMeta[] = []
  const disagreements: string[] = []
  let totalCost = 0
  let totalTokens = 0

  // ── Round 1: Two independent extractions in parallel ────────────────
  // Extractor A uses "standard" variant, Extractor B uses "slightly_different"
  // to ensure divergence even when both go through the same provider chain.
  const [extractorAres, extractorBres] = await Promise.all([
    extractorA(systemPrompt, userPrompt, 'standard'),
    extractorB(systemPrompt, userPrompt, 'slightly_different'),
  ])

  results.push(extractorAres, extractorBres)
  totalCost += (extractorAres.usage.cost || 0) + (extractorBres.usage.cost || 0)
  totalTokens += extractorAres.usage.inputTokens + extractorAres.usage.outputTokens
  totalTokens += extractorBres.usage.inputTokens + extractorBres.usage.outputTokens

  // ── Compare Round 1 ─────────────────────────────────────────────────

  const comparison1 = await comparator(extractorAres.parsed, extractorBres.parsed)

  if (comparison1.agreed || maxRounds === 1) {
    // Prefer A's result when agreed (or no more rounds)
    const best = extractorAres.usage.source === 'extractor_a' ? extractorAres : extractorBres
    return {
      final: best,
      roundCount: 1,
      rounds: results,
      disagreements: [],
      totalCost,
      totalTokens,
    }
  }

  for (const d of comparison1.disagreements) {
    if (d.significance === 'critical' || d.significance === 'major') {
      disagreements.push(`${d.field}: A=${d.valueA} vs B=${d.valueB}`)
    }
  }

  if (maxRounds < 2) {
    return {
      final: extractorAres,
      roundCount: 1,
      rounds: results,
      disagreements,
      totalCost,
      totalTokens,
    }
  }

  // ── Round 2: Cross-review ──────────────────────────────────────────

  const round2userA =
    userPrompt + ROUND2_PROMPT_SUFFIX + JSON.stringify(extractorBres.parsed, null, 2)
  const round2userB =
    userPrompt + ROUND2_PROMPT_SUFFIX + JSON.stringify(extractorAres.parsed, null, 2)

  const [revisedA, revisedB] = await Promise.all([
    extractorA(systemPrompt, round2userA, 'standard'),
    extractorB(systemPrompt, round2userB, 'slightly_different'),
  ])

  results.push(revisedA, revisedB)
  totalCost += (revisedA.usage.cost || 0) + (revisedB.usage.cost || 0)
  totalTokens += revisedA.usage.inputTokens + revisedA.usage.outputTokens
  totalTokens += revisedB.usage.inputTokens + revisedB.usage.outputTokens

  // ── Compare Round 2 ────────────────────────────────────────────────

  const comparison2 = await comparator(revisedA.parsed, revisedB.parsed)

  for (const d of comparison2.disagreements) {
    if (d.significance === 'critical' || d.significance === 'major') {
      const key = `${d.field}: A=${d.valueA} vs B=${d.valueB}`
      if (!disagreements.includes(key)) {
        disagreements.push(key)
      }
    }
  }

  if (comparison2.agreed || maxRounds < 3) {
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

  const arbUserPrompt = `ORIGINAL DOCUMENT:\n\n${originalDocumentText}\n\n${ROUND3_PROMPT_SUFFIX}\n\nROUND 1:\nA: ${JSON.stringify(extractorAres.parsed, null, 2)}\nB: ${JSON.stringify(extractorBres.parsed, null, 2)}\n\nROUND 2:\nA (revised): ${JSON.stringify(revisedA.parsed, null, 2)}\nB (revised): ${JSON.stringify(revisedB.parsed, null, 2)}\n\nCOMPARATOR NOTES:\n${comparison2.assessment}\n\nKEY DISAGREEMENTS:\n${comparison2.disagreements.map((d) => `- ${d.field}: ${d.valueA} vs ${d.valueB} (${d.significance})`).join('\n')}\n\nProduce the single best, complete extraction JSON.`

  const arbitratorResult = await arbitratorExtractor(
    ARBITRATOR_SYSTEM_PROMPT,
    arbUserPrompt,
    'standard'
  )

  results.push(arbitratorResult)
  totalCost += arbitratorResult.usage.cost || 0
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

// ── Merge Helper ──────────────────────────────────────────────────────────────

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
