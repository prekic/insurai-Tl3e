/**
 * Parallel dual extraction: DeepSeek + OpenAI simultaneously, then merge & reconcile.
 *
 * Strategy:
 * 1. Fire both providers in parallel (Promise.all)
 * 2. Union of coverages by canonical name — the one with a numeric limit wins
 * 3. Entity fields — prefer non-null from either; if both non-null & mismatched,
 *    ask the model to re-check the specific field
 * 4. Exclusions — union
 */

import type OpenAI from 'openai'
import { logger } from '../lib/logger.js'

const log = logger.child('ParallelExtraction')

// ── Types ─────────────────────────────────────────────────────────────────

export interface CoverageItem {
  name: string
  canonicalName?: string
  nameTr?: string
  normalizedName?: string
  limit: number | null
  currency?: string
  deductible?: number | null
  description?: string
  included?: boolean
  isOptional?: boolean
  status?: string
  conditions?: unknown[]
  parsedLimit?: {
    type: string
    amount: number
  }
  [key: string]: unknown
}

export interface ExtractionResult {
  policyNumber: string | null
  insurer: string | null
  insuredName: string | null
  startDate: string | null
  endDate: string | null
  premium: number | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: string | null
  vehiclePlate: string | null
  NCD: string | null
  policyType: string | null
  coverages: CoverageItem[]
  exclusions: { type: string; text: string }[]
  [key: string]: unknown
}

export interface ProviderResult {
  provider: 'deepseek' | 'openai' | 'gemini'
  success: boolean
  data: ExtractionResult | null  // Pre-stage2 data for re-reconciliation
  rawContent: string
  inputTokens: number
  outputTokens: number
}

export interface MergedResult {
  success: boolean
  data: ExtractionResult
  providers: ProviderResult[]
  mergeLog: string[]
  degradedReason?: string
  cost: number | null
  inputTokens: number
  outputTokens: number
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse a raw LLM JSON string into an ExtractionResult.
 */
function parseRawContent(content: string): ExtractionResult | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return parsed as unknown as ExtractionResult
  } catch {
    return null
  }
}

/**
 * Get coverage map keyed by canonicalName, falling back to name.
 */
function coverageMap(coverages: CoverageItem[]): Map<string, CoverageItem> {
  const map = new Map<string, CoverageItem>()
  for (const c of coverages) {
    const key = c.canonicalName || c.name || ''
    if (key) map.set(key, c)
  }
  return map
}

/**
 * Pick the better limit value: prefer a numeric value over null.
 */
function pickLimit(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a != null && typeof a === 'number' && !isNaN(a)) return a
  if (b != null && typeof b === 'number' && !isNaN(b)) return b
  return null
}

/**
 * Pick the better entity value: prefer non-null over null.
 */
function pickValue<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a != null && a !== '' && a !== 'null') return a as T
  if (b != null && b !== '' && b !== 'null') return b as T
  return null
}

// ── Merge logic ───────────────────────────────────────────────────────────

/**
 * Merge two extraction results using union strategy:
 * - Coverages: union by canonical name, prefer numeric limit
 * - Entity fields: fill nulls from the other
 * - Exclusions: union by text
 */
function mergeResults(
  a: ExtractionResult,
  b: ExtractionResult,
  mergeLog: string[]
): ExtractionResult {
  // ── Entity fields ──
  const entityFields = [
    'policyNumber', 'insurer', 'insuredName', 'startDate', 'endDate',
    'premium', 'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehiclePlate',
    'NCD', 'policyType',
  ] as const

  const merged: Record<string, unknown> = {}
  for (const field of entityFields) {
    const valA = (a as any)[field]
    const valB = (b as any)[field]
    const best = pickValue(valA, valB)

    if (valA != null && valB != null && String(valA) !== String(valB)) {
      // Both non-null but different — note the mismatch
      mergeLog.push(`Entity mismatch: ${field} = "${valA}" (${a.providerName || 'A'}) vs "${valB}" (${b.providerName || 'B'}) — using "${best}"`)
    }
    merged[field] = best
  }

  // ── Coverages ──
  const mapA = coverageMap(a.coverages || [])
  const mapB = coverageMap(b.coverages || [])

  const mergedCoverages: CoverageItem[] = []
  const seen = new Set<string>()

  // Process all keys from both maps
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])
  for (const key of allKeys) {
    if (seen.has(key)) continue
    seen.add(key)

    const covA = mapA.get(key)
    const covB = mapB.get(key)

    if (covA && covB) {
      // Both have it — merge
      const mergedCov: CoverageItem = { ...covA }
      mergedCov.limit = pickLimit(covA.limit, covB.limit)
      mergedCov.deductible = pickValue(covA.deductible, covB.deductible)
      mergedCov.currency = pickValue(covA.currency, covB.currency) || 'TRY'

      // Build parsedLimit if we have a numeric limit
      const numericLimit = mergedCov.limit
      if (numericLimit != null && typeof numericLimit === 'number' && !isNaN(numericLimit)) {
        mergedCov.parsedLimit = { type: 'numeric', amount: numericLimit }
      }

      mergedCoverages.push(mergedCov)

      if (String(covA.limit) !== String(covB.limit)) {
        mergeLog.push(`Coverage merge: ${key} = ${covA.limit} (A) vs ${covB.limit} (B) → using ${mergedCov.limit}`)
      }
    } else if (covA) {
      // Only in A
      mergedCoverages.push({ ...covA })
      mergeLog.push(`Coverage from A only: ${key} = ${covA.limit}`)
    } else if (covB) {
      // Only in B
      mergedCoverages.push({ ...covB })
      mergeLog.push(`Coverage from B only: ${key} = ${covB.limit}`)
    }
  }

  // ── Exclusions ──
  const exclMap = new Map<string, { type: string; text: string }>()
  const allExcls = [...(a.exclusions || []), ...(b.exclusions || [])]
  for (const ex of allExcls) {
    const key = ex.text || ex.type || ''
    if (key && !exclMap.has(key)) {
      exclMap.set(key, ex)
    }
  }

  merged['coverages'] = mergedCoverages
  merged['exclusions'] = Array.from(exclMap.values())

  return merged as unknown as ExtractionResult
}

// ── Reconciliation ────────────────────────────────────────────────────────

/**
 * For coverages where limits disagree by >20% (or one is null and the other
 * has a value), call a model to re-check that specific coverage from the
 * document. The goal is to resolve "who is right" without a full re-extraction.
 */
export async function reconcileDisputedCoverages(
  merged: ExtractionResult,
  documentText: string,
  providers: ProviderResult[],
  getDeepSeekClient: () => OpenAI | null,
  mergeLog: string[]
): Promise<ExtractionResult> {
  // Find coverages where limits differ >20% or one is null and other has value
  const disputed: Array<{ name: string; limitA: number | null; limitB: number | null }> = []

  const allCoverageNames = new Set<string>()
  for (const p of providers) {
    if (!p.data) continue
    for (const c of p.data.coverages) {
      allCoverageNames.add(c.canonicalName || c.name || '')
    }
  }

  for (const key of allCoverageNames) {
    if (!key) continue
    const covA = providers[0]?.data?.coverages?.find(
      (c) => (c.canonicalName || c.name) === key
    )
    const covB = providers[1]?.data?.coverages?.find(
      (c) => (c.canonicalName || c.name) === key
    )

    const limA = covA?.limit ?? null
    const limB = covB?.limit ?? null

    if (limA === null && limB === null) continue
    if (limA !== null && limB !== null) {
      if (limA === limB) continue
      const max = Math.max(limA, limB)
      const min = Math.min(limA, limB)
      // Only dispute if >20% difference
      if (min > 0 && (max - min) / min <= 0.2) continue
    }

    const name = covA?.name || covB?.name || key
    disputed.push({ name, limitA: limA, limitB: limB })
  }

  if (disputed.length === 0) {
    mergeLog.push('No disputed coverages found — merge complete.')
    return merged
  }

  mergeLog.push(`Disputed coverages (${disputed.length}): ${disputed.map(d => d.name).join(', ')}`)

  // For each dispute, try a targeted re-check query
  const resolved = { ...merged }
  const resolvedCoverages = [...(merged.coverages || [])]

  for (const d of disputed) {
    const ds = getDeepSeekClient()
    if (!ds) continue

    const verifyPrompt = `Document text:
${documentText.substring(0, 5000)}

From the document above, what is the EXACT limit/amount for the coverage "${d.name}"?
The first extraction says: ${d.limitA ?? 'not found'}
The second extraction says: ${d.limitB ?? 'not found'}

Respond with ONLY a JSON object:
{"limit": number_or_null, "currency": "TRY", "source_text": "the exact line(s) from the document showing this limit"}`

    try {
      const response = await ds.chat.completions.create({
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'user', content: verifyPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.1,
      }, { signal: AbortSignal.timeout(30_000) })

      const content = response.choices[0]?.message?.content
      if (!content) continue

      const verified = JSON.parse(content) as { limit?: number | null; source_text?: string }
      mergeLog.push(`Recheck ${d.name}: A=${d.limitA}, B=${d.limitB}, verified=${verified.limit} (source: ${(verified.source_text || '').substring(0, 60)})`)

      const verifiedLimit = verified.limit != null && !isNaN(Number(verified.limit))
        ? Number(verified.limit)
        : null

      // Update the coverage with the verified limit
      const idx = resolvedCoverages.findIndex(
        (c) => (c.canonicalName || c.name) === d.name
      )
      if (idx >= 0 && verifiedLimit != null) {
        resolvedCoverages[idx] = {
          ...resolvedCoverages[idx],
          limit: verifiedLimit,
          parsedLimit: { type: 'numeric', amount: verifiedLimit },
        }
      }
    } catch {
      // Silently skip — use the better of the two existing values
    }
  }

  return { ...resolved, coverages: resolvedCoverages }
}

// ── Main entry ────────────────────────────────────────────────────────────

export interface ParallelExtractionInput {
  documentText: string
  model?: string
  policyType?: string
}

/**
 * Run DeepSeek + OpenAI extractions in parallel, merge, and reconcile.
 */
export async function runParallelExtraction(
  input: ParallelExtractionInput,
  deps: {
    deepseekClient: OpenAI | null
    openaiClient: OpenAI | null
    systemPrompt: string
    maxTokens: number
    temperature: number
  }
): Promise<MergedResult> {
  const { documentText, model } = input
  const { deepseekClient, openaiClient, systemPrompt, maxTokens, temperature } = deps

  const mergeLog: string[] = []
  const startTime = Date.now()

  // Build the schema prompt
  const outputSchema = `
Output flat JSON ONLY — use EXACTLY this flat structure with values from document. NO nested objects.
{
  "policyNumber": "string or null",
  "insurer": "string or null",
  "insuredName": "string or null",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "premium": 0 as number or null,
  "vehicleMake": "string or null",
  "vehicleModel": "string or null",
  "vehicleYear": "string or null",
  "vehiclePlate": "string or null",
  "NCD": "number or null",
  "policyType": "string or null",
  "coverages": [
    { "name": "Teminat adı", "limit": sayi, "currency": "TRY" },
    { "name": "Teminat adı", "limit": sayi, "currency": "TRY" }
  ],
  "exclusions": [
    { "type": "exclusion or sublimit", "text": "açıklama" }
  ]
}
CRITICAL: Read ALL values from the document above. Do NOT use training defaults. Extract every coverage listed in the document. Add all coverages found.`

  const systemMsg = systemPrompt + '\n\nRespond with valid JSON only.\nNEVER use training data defaults. Every value comes from the document text in the user message.'
  const userMsg = documentText + outputSchema

  // ── Fire both providers in parallel ──
  const tasks: Promise<ProviderResult>[] = []

  // DeepSeek task
  if (deepseekClient) {
    tasks.push(
      (async (): Promise<ProviderResult> => {
        try {
          const response = await deepseekClient.chat.completions.create({
            model: model || 'deepseek-v4-pro',
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: userMsg },
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            temperature: temperature,
          }, { signal: AbortSignal.timeout(120_000) })

          const content = response.choices[0]?.message?.content || ''
          const parsed = parseRawContent(content)
          return {
            provider: 'deepseek',
            success: !!parsed,
            data: parsed,
            rawContent: content,
            inputTokens: response.usage?.prompt_tokens || 0,
            outputTokens: response.usage?.completion_tokens || 0,
          }
        } catch (err: any) {
          log.warn('Parallel DeepSeek extraction failed', { error: err.message })
          return {
            provider: 'deepseek',
            success: false,
            data: null,
            rawContent: '',
            inputTokens: 0,
            outputTokens: 0,
          }
        }
      })()
    )
  }

  // OpenAI task
  if (openaiClient) {
    tasks.push(
      (async (): Promise<ProviderResult> => {
        try {
          const response = await openaiClient.chat.completions.create({
            model: 'gpt-5.4',
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: userMsg },
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            temperature: temperature,
          }, { signal: AbortSignal.timeout(120_000) })

          const content = response.choices[0]?.message?.content || ''
          const parsed = parseRawContent(content)
          return {
            provider: 'openai',
            success: !!parsed,
            data: parsed,
            rawContent: content,
            inputTokens: response.usage?.prompt_tokens || 0,
            outputTokens: response.usage?.completion_tokens || 0,
          }
        } catch (err: any) {
          log.warn('Parallel OpenAI extraction failed', { error: err.message })
          return {
            provider: 'openai',
            success: false,
            data: null,
            rawContent: '',
            inputTokens: 0,
            outputTokens: 0,
          }
        }
      })()
    )
  }

  const results = await Promise.all(tasks)

  const dsResult = results.find((r) => r.provider === 'deepseek')
  const oaResult = results.find((r) => r.provider === 'openai')

  mergeLog.push(`DeepSeek: ${dsResult?.success ? 'OK' : 'FAILED'} (${dsResult?.data?.coverages?.length || 0} coverages)`)
  mergeLog.push(`OpenAI: ${oaResult?.success ? 'OK' : 'FAILED'} (${oaResult?.data?.coverages?.length || 0} coverages)`)

  // If only one succeeded, use it directly
  if (dsResult?.success && !oaResult?.success) {
    mergeLog.push('OpenAI failed — using DeepSeek result directly')
    return {
      success: true,
      data: dsResult.data!,
      providers: [dsResult],
      mergeLog,
      inputTokens: dsResult.inputTokens,
      outputTokens: dsResult.outputTokens,
      cost: null,
    }
  }

  if (oaResult?.success && !dsResult?.success) {
    mergeLog.push('DeepSeek failed — using OpenAI result directly')
    return {
      success: true,
      data: oaResult.data!,
      providers: [oaResult],
      mergeLog,
      inputTokens: oaResult.inputTokens,
      outputTokens: oaResult.outputTokens,
      cost: null,
    }
  }

  if (!dsResult?.success && !oaResult?.success) {
    mergeLog.push('Both providers failed')
    return {
      success: false,
      data: { policyNumber: null, insurer: null, insuredName: null, startDate: null, endDate: null, premium: null, vehicleMake: null, vehicleModel: null, vehicleYear: null, vehiclePlate: null, NCD: null, policyType: null, coverages: [], exclusions: [] },
      providers: results,
      mergeLog,
      inputTokens: 0,
      outputTokens: 0,
      cost: null,
    }
  }

  // Both succeeded — merge
  const dsData = dsResult!.data!
  const oaData = oaResult!.data!

  // Annotate for merge logging
  ;(dsData as any).providerName = 'DeepSeek'
  ;(oaData as any).providerName = 'OpenAI'

  const merged = mergeResults(dsData, oaData, mergeLog)

  mergeLog.push(`Merged: ${merged.coverages.length} coverages (DS:${dsData.coverages.length}, OA:${oaData.coverages.length})`)

  // Reconcile disputed coverages
  const reconciled = await reconcileDisputedCoverages(
    merged,
    documentText,
    [dsResult!, oaResult!],
    () => deepseekClient,
    mergeLog
  )

  const totalInputTokens = (dsResult?.inputTokens || 0) + (oaResult?.inputTokens || 0)
  const totalOutputTokens = (dsResult?.outputTokens || 0) + (oaResult?.outputTokens || 0)

  mergeLog.push(`Total tokens: ${totalInputTokens} in / ${totalOutputTokens} out`)
  mergeLog.push(`Duration: ${Date.now() - startTime}ms`)

  return {
    success: true,
    data: reconciled,
    providers: [dsResult!, oaResult!],
    mergeLog,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cost: null,
  }
}
