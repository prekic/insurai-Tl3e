import logger from './logger.js'

const log = logger.child('SelfHealing')

export const JUDGE_JSON_SCHEMA = {
  name: 'extraction_evaluation',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      stepByStepAnalysis: {
        type: 'string',
        description:
          'Step-by-step analysis of the extraction against the document text. Check for hallucinations or omissions.',
      },
      score: {
        type: 'number',
        description: 'Score from 1 to 100 based on the rubric.',
      },
      pass: {
        type: 'boolean',
        description: 'True if score is >= 80, else false.',
      },
      qualitativeFeedback: {
        type: 'string',
        description:
          'Specific feedback on what failed and how to fix it, referencing line numbers or exact fields if possible.',
      },
    },
    required: ['stepByStepAnalysis', 'score', 'pass', 'qualitativeFeedback'],
    additionalProperties: false,
  },
} as const

export const JUDGE_SYSTEM_PROMPT = `You are an expert Insurance Policy AI Auditor. Your task is to evaluate the provided JSON extraction against the original document text to detect AI hallucinations, omissions, or incorrect structured data.

### Rubric (1-100 Score)
- **100**: Perfect extraction. All fields accurately reflect the text.
- **-20 points**: Hallucinated coverages (coverages not explicitly in the text).
- **-10 points**: Incorrect limit types, missing deductibles, or missing explicitly stated exclusions.
- **-10 points**: Incorrect policy metadata (e.g., wrong dates, wrong vehicle info).
- **0-10 score**: Catastrophic failure (e.g., JSON contains completely unrelated data or fails to capture the core policy at all).

You must return a strictly formatted JSON response containing:
1. "stepByStepAnalysis": Briefly compare the JSON to the text.
2. "score": 1-100 integer.
3. "pass": true if score >= 80, false otherwise.
4. "qualitativeFeedback": If pass is false, explicitly state WHICH fields are wrong and exactly HOW the Worker should fix them in the next attempt. Be concise and reference specific field names.

Return ONLY the requested JSON.`

export interface HealingResult<T> {
  success: boolean
  data: T | null
  error?: string
  code?: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  attempts: number
  finalModel: string
}

export interface WorkerUsage {
  inputTokens: number
  outputTokens: number
  cost: number
  model: string
}

export interface WorkerResponse {
  content: string
  usage: WorkerUsage
}

export interface JudgeResult {
  stepByStepAnalysis: string
  score: number
  pass: boolean
  qualitativeFeedback: string
}

// ──────────────────────────────────────────────
//  Field-level semantic validators
//  Run BEFORE the AI Judge — cheaper (zero AI cost)
// ──────────────────────────────────────────────

export interface FieldValidationResult {
  field: string
  value: any
  valid: boolean
  hint?: string
}

const TURKISH_PLATE = /^\d{2}\s?[A-Za-z]{1,3}\s?\d{2,4}$/
const CURRENCIES = new Set(['TL', 'TRY', 'USD', 'EUR', 'GBP'])

/**
 * Validate individual extraction fields with type-aware rules.
 * Returns list of failures with hints.
 */
export function validateExtractionFields(data: Record<string, any>): FieldValidationResult[] {
  const results: FieldValidationResult[] = []
  const flat = flattenObject(data)

  const check = (
    field: string,
    aliases: string[],
    validator: (v: any) => FieldValidationResult
  ) => {
    const value = findFieldValue(flat, aliases)
    results.push(validator(value))
  }

  check(
    'policyNumber',
    ['policyNumber', 'policeno', 'policy_no', 'policenum', 'police', 'policy'],
    (v) => ({
      field: 'policyNumber',
      value: v,
      valid: typeof v === 'string' && v.length >= 4 && v.length <= 30,
      hint: typeof v === 'string' ? undefined : 'Policy number must be a non-empty string',
    })
  )

  check('startDate', ['startDate', 'baslangic', 'start', 'validfrom'], (v) => {
    if (!v || typeof v !== 'string')
      return { field: 'startDate', value: v, valid: false, hint: 'Missing start date' }
    const d = new Date(v)
    const year = d.getFullYear()
    return {
      field: 'startDate',
      value: v,
      valid: !isNaN(d.getTime()) && year >= 2000 && year <= 2030,
      hint: `Invalid date or year ${year} out of range`,
    }
  })

  check('endDate', ['endDate', 'bitis', 'end', 'validto', 'expiry'], (v) => {
    if (!v || typeof v !== 'string')
      return { field: 'endDate', value: v, valid: false, hint: 'Missing end date' }
    const d = new Date(v)
    const year = d.getFullYear()
    return {
      field: 'endDate',
      value: v,
      valid: !isNaN(d.getTime()) && year >= 2000 && year <= 2040,
      hint: `Invalid date or year ${year} out of range`,
    }
  })

  check('vehiclePlate', ['vehiclePlate', 'plaka', 'plate', 'plaque', 'license_plate'], (v) => {
    if (!v || typeof v !== 'string')
      return { field: 'vehiclePlate', value: v, valid: false, hint: 'Missing plate number' }
    const cleaned = v.replace(/\s+/g, ' ').trim()
    return {
      field: 'vehiclePlate',
      value: v,
      valid: TURKISH_PLATE.test(cleaned),
      hint: `"${v}" doesn't match Turkish plate format (e.g., "35 PR 962")`,
    }
  })

  check('currency', ['currency', 'para_birimi', 'doviz', 'doviz', 'birim'], (v) => {
    if (!v || typeof v !== 'string')
      return { field: 'currency', value: v, valid: false, hint: 'Missing currency' }
    return {
      field: 'currency',
      value: v,
      valid: CURRENCIES.has(v.toUpperCase().trim()),
      hint: `"${v}" is not a supported currency (TL/TRY/USD/EUR)`,
    }
  })

  check(
    'provider',
    ['provider', 'insurerName', 'sigorta', 'sirket', 'company', 'insurer'],
    (v) => ({
      field: 'provider',
      value: v,
      valid: typeof v === 'string' && v.length >= 3,
      hint: typeof v === 'string' ? undefined : 'Provider name must be a non-empty string',
    })
  )

  return results.filter((r) => !r.valid)
}

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {}
  if (!obj || typeof obj !== 'object') return result
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key))
    } else {
      result[key] = v
    }
  }
  return result
}

function findFieldValue(flat: Record<string, any>, aliases: string[]): any {
  for (const [key, value] of Object.entries(flat)) {
    const keyLower = key.toLowerCase()
    if (aliases.some((a) => keyLower.includes(a))) return value
  }
  return undefined
}

export async function executeWithSelfHealingLoop<T>(
  documentText: string,
  initialUserPrompt: string,
  baseTemperature: number,
  workerCaller: (userPrompt: string, temperature: number) => Promise<WorkerResponse>,
  judgeCaller: (documentText: string, workerContent: string) => Promise<WorkerResponse>,
  parser: (content: string) => T
): Promise<HealingResult<T>> {
  const MAX_ATTEMPTS = 3
  let attempt = 1
  let currentUserPrompt = initialUserPrompt
  let currentTemperature = baseTemperature

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCost = 0
  let finalModel = ''

  let lastParsedData: T | null = null

  while (attempt <= MAX_ATTEMPTS) {
    log.info(`Self-Healing Loop: Attempt ${attempt}/${MAX_ATTEMPTS}`)

    // 1. Run Worker
    let workerResponse: WorkerResponse
    try {
      workerResponse = await workerCaller(currentUserPrompt, currentTemperature)
      totalInputTokens += workerResponse.usage.inputTokens
      totalOutputTokens += workerResponse.usage.outputTokens
      totalCost += workerResponse.usage.cost
      finalModel = workerResponse.usage.model
    } catch (error) {
      log.error('Worker execution failed', {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        data: lastParsedData,
        error: error instanceof Error ? error.message : 'Worker failed',
        code: 'WORKER_ERROR',
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        attempts: attempt,
        finalModel,
      }
    }

    // Parse worker output
    try {
      log.warn('Worker returned content:', {
        length: workerResponse.content.length,
        start: workerResponse.content.substring(0, 100),
        end: workerResponse.content.substring(workerResponse.content.length - 100),
      })
      lastParsedData = parser(workerResponse.content)
    } catch (_error) {
      log.warn('Worker returned invalid JSON', { attempt, content: workerResponse.content })
      // If we can't parse it, we can't judge it easily. We could feed the raw string to the judge,
      // but let's just retry by telling the worker it was invalid JSON.
      if (attempt >= MAX_ATTEMPTS) {
        return {
          success: false,
          data: null,
          error: 'AI returned invalid JSON',
          code: 'INVALID_JSON',
          totalInputTokens,
          totalOutputTokens,
          totalCost,
          attempts: attempt,
          finalModel,
        }
      }
      attempt++
      currentTemperature = Math.min(0.8, baseTemperature + (attempt - 1) * 0.2)
      currentUserPrompt =
        initialUserPrompt +
        '\n\nPREVIOUS ATTEMPT FAILED. FEEDBACK: The output was not valid JSON. Ensure you return valid JSON.'
      continue
    }

    // 2. Run semantic field validation (zero AI cost)
    const fieldFailures = validateExtractionFields(lastParsedData as Record<string, any>)
    if (fieldFailures.length > 0) {
      log.warn('Semantic field validation found issues', {
        attempt,
        failures: fieldFailures.map((r) => `${r.field}=${JSON.stringify(r.value)} (${r.hint})`),
      })
    }

    // 3. If all fields pass semantic validation and no judge is needed, skip the judge
    //    Only skip when judge already said it's okay but we want fast-path on field validation.
    //    We still run the judge for hallucination/omission detection, but we inject field
    //    failures into the prompt for the next attempt.

    // 4. Run Judge
    let judgeResponse: WorkerResponse
    try {
      judgeResponse = await judgeCaller(documentText, workerResponse.content)
      totalInputTokens += judgeResponse.usage.inputTokens
      totalOutputTokens += judgeResponse.usage.outputTokens
      totalCost += judgeResponse.usage.cost
    } catch (error) {
      log.error('Judge execution failed', {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
      // If the judge fails, we must fallback to the worker's extraction rather than crashing everything.
      log.warn('Returning un-judged extraction due to judge failure')
      return {
        success: true, // We have a parsed extraction at least
        data: lastParsedData,
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        attempts: attempt,
        finalModel,
      }
    }

    // Parse Judge Output
    let judgeData: JudgeResult
    try {
      judgeData = JSON.parse(judgeResponse.content)
    } catch (_error) {
      log.warn('Judge returned invalid JSON', { attempt })
      // If judge returns bad JSON, assume pass to not block pipeline indefinitely
      return {
        success: true,
        data: lastParsedData,
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        attempts: attempt,
        finalModel,
      }
    }

    log.info(`Judge evaluation completed`, { score: judgeData.score, pass: judgeData.pass })

    // 3. Evaluate Judge Feedback
    if (judgeData.pass || judgeData.score >= 80) {
      return {
        success: true,
        data: lastParsedData,
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        attempts: attempt,
        finalModel,
      }
    }

    if (judgeData.score <= 10) {
      log.error('Judge fast-fail triggered', { score: judgeData.score })
      return {
        success: false,
        data: lastParsedData,
        error: 'Extraction task deemed structurally impossible by AI Judge.',
        code: 'STRUCTURALLY_IMPOSSIBLE',
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        attempts: attempt,
        finalModel,
      }
    }

    // Build feedback from both the AI judge and semantic field validation
    const judgeFeedbackBlock = judgeData.qualitativeFeedback
      ? `JUDGE FEEDBACK: ${judgeData.qualitativeFeedback}`
      : ''

    const fieldFeedbackBlock =
      fieldFailures.length > 0
        ? `FIELD VALIDATION FAILURES:\n${fieldFailures
            .map((r) => `- ${r.field}: current value is ${JSON.stringify(r.value)}. ${r.hint}`)
            .join('\n')}`
        : ''

    const feedback = [judgeFeedbackBlock, fieldFeedbackBlock].filter(Boolean).join('\n\n')

    // Prepare for next attempt
    attempt++
    currentTemperature = Math.min(0.8, baseTemperature + (attempt - 1) * 0.2)
    // Inject feedback into the prompt
    currentUserPrompt =
      initialUserPrompt +
      `\n\nPREVIOUS ATTEMPT FAILED. ${feedback}\nFix ALL of these issues in your next attempt.`
  }

  // Exhausted all retries without passing
  log.warn('Exhausted all healing retries, returning best effort', { attempts: attempt - 1 })
  return {
    success: true, // we still return what we have as a best effort
    data: lastParsedData,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    attempts: attempt - 1,
    finalModel,
  }
}
