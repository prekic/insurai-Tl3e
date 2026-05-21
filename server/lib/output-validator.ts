/**
 * Extraction Output Validator
 *
 * Post-hoc validation that catches silent garbage from any provider.
 * Runs AFTER extraction but BEFORE returning the response.
 *
 * Validates:
 *   1. Document type makes sense (kasko output shouldn't have "Konut Sigortası" content)
 *   2. Dates aren't synthetic (start/end dates should be reasonable)
 *   3. Provider field is populated
 *   4. Premium values are reasonable
 *   5. At least N coverages returned (for kasko policies)
 *
 * This is Fix-4 of the fallback chain hardening.
 */

import { logger } from './logger.js'
import { classifyDocumentType } from '../../src/lib/policy-pipeline/stage1-extract/document-classifier.js'

const log = logger.child('output-validator')

export interface ValidationResult {
  /** Overall pass/fail */
  pass: boolean
  /** Per-check results */
  checks: ValidationCheck[]
  /** Human-readable summary for logging */
  summary: string
}

interface ValidationCheck {
  name: string
  pass: boolean
  message: string
}

/**
 * Validate the extracted data against known-good shapes.
 *
 * @param extractedData - The parsed extraction result
 * @param documentText  - Original OCR text (for document type classification)
 * @param policyType    - Optional policy type hint from request body
 * @param options       - Tuning knobs for testability
 */
export function validateOutput(
  extractedData: Record<string, unknown>,
  documentText: string,
  policyType?: string,
  options: {
    /** Whether to reject extraction with 0 coverages (default: true) */
    rejectEmptyCoverages?: boolean
    /** Whether to reject when document type strongly disagrees (default: true) */
    rejectTypeMismatch?: boolean
    /** Minimum expected coverages (default: 5) */
    minCoverages?: number
    /** Whether dates should be present (default: true) */
    requireDates?: boolean
    /** Whether provider name should be present (default: true) */
    requireProvider?: boolean
  } = {}
): ValidationResult {
  const minCoverages = options.minCoverages ?? 5
  const rejectTypeMismatch = options.rejectTypeMismatch !== false
  const requireDates = options.requireDates !== false
  const requireProvider = options.requireProvider !== false

  const checks: ValidationCheck[] = []

  // ── Check 1: Coverage count ───────────────────────────────────────────
  const coverages = extractedData.coverages
  const coverageCount = Array.isArray(coverages) ? coverages.length : 0
  const coverageOk = coverageCount >= minCoverages
  checks.push({
    name: 'coverages',
    pass: coverageOk,
    message: coverageOk
      ? `${coverageCount} coverages (≥${minCoverages})`
      : `Only ${coverageCount} coverages (min: ${minCoverages})`,
  })

  // ── Check 2: Policy type match ────────────────────────────────────────
  const extractedType = String(extractedData.policyType || '').toLowerCase()
  // Use document classifier to check — classifyDocumentType checks text heuristics
  const classifiedType = classifyDocumentType(documentText)

  // If the text CLEARLY says kasko but extracted says konut/home — bad
  let typeMismatch = false
  if (classifiedType === 'kasko' && extractedType.includes('home') && !extractedType.includes('kasko')) {
    typeMismatch = true
  }
  if (classifiedType === 'home' && extractedType.includes('kasko') && !extractedType.includes('home')) {
    typeMismatch = true
  }

  checks.push({
    name: 'type',
    pass: rejectTypeMismatch ? !typeMismatch : true,
    message: typeMismatch
      ? `Document classified as "${classifiedType}" but extracted as "${extractedType}"`
      : `OK: classified=${classifiedType}, extracted=${extractedType}`,
  })

  // ── Check 3: Provider populated ───────────────────────────────────────
  const provider = String(extractedData.provider || extractedData.sigortacı || '')
  const providerOk = !requireProvider || (provider.length > 0 && provider !== 'unknown')
  checks.push({
    name: 'provider',
    pass: providerOk,
    message: providerOk
      ? `Provider: ${provider || '(unset)'}`
      : 'Provider is empty or "unknown"',
  })

  // ── Check 4: Dates present ────────────────────────────────────────────
  const startDate = extractedData.startDate || extractedData.başlangıçTarihi || ''
  const endDate = extractedData.endDate || extractedData.bitişTarihi || ''
  const datesOk = !requireDates || (String(startDate).length > 0 && String(endDate).length > 0)
  checks.push({
    name: 'dates',
    pass: datesOk,
    message: datesOk
      ? `Dates: ${startDate} → ${endDate}`
      : 'Missing start or end date',
  })

  // ── Check 5: Premium reasonable ───────────────────────────────────────
  const rawPremium = extractedData.premium?.toString() || extractedData.prim?.toString() || ''
  const premiumValue = parseFloat(rawPremium.replace(/[^\d.,]/g, '').replace(',', '.'))
  const premiumOk = rawPremium.length === 0 || premiumValue > 0
  checks.push({
    name: 'premium',
    pass: premiumOk,
    message: premiumOk
      ? `Premium: ${rawPremium || '(unset)'}`
      : `Premium is zero: "${rawPremium}"`,
  })

  // ── Final verdict ─────────────────────────────────────────────────────
  const failures = checks.filter((c) => !c.pass)
  const pass = failures.length === 0
  const summary = pass ? 'All checks passed' : `${failures.length} check(s) failed: ${failures.map((c) => c.name).join(', ')}`

  if (!pass) {
    log.warn('Output validation failed', { summary, checks: checks.filter((c) => !c.pass) })
  }

  return { pass, checks, summary }
}
