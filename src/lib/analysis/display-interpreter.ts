import type { AnalysisBundle } from '@/types/analysis'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import type { ValidationResult } from '@/lib/ai/validator'
import type {
  DisplaySafePolicySummary,
  PolicyBasicsCard,
  ProtectionBasisCard,
  CoverageCard,
  RestrictionCard,
  ClaimRiskCard,
  MissingCard,
  BenchmarkCard,
  SourceQuoteRef,
  SuppressionRecord,
  StatementType,
} from '@/types/display'
import { evaluateDisplayMode } from './review-thresholds'

const DISPLAY_MODEL_VERSION = '1.0.0'

let cardCounter = 0
function nextId(prefix: string): string {
  cardCounter++
  return `${prefix}-${cardCounter}`
}

// ============================================================================
// WORKSTREAM C: WORDING GOVERNANCE — PROHIBITED PHRASES
// ============================================================================

const PROHIBITED_PHRASES = [
  'no deductible',
  'unlimited',
  'fully covered',
  'tam kapsamlı',
  'guaranteed',
  'full protection',
  'total coverage',
  "your vehicle's full value will be paid",
  'aracınızın tam değeri ödenir',
  'free towing',
  'fully compliant',
  'muafiyetsiz',
  'tamamen kapsar',
  'sınırsız',
]

/**
 * Checks text against the prohibited phrase list.
 * Returns the matched phrase if blocked, or null if safe.
 */
export function checkProhibitedPhrase(text: string): string | null {
  const lower = text.toLowerCase()
  for (const phrase of PROHIBITED_PHRASES) {
    if (lower.includes(phrase)) {
      return phrase
    }
  }
  return null
}

/**
 * Applies safe wording to text, replacing prohibited phrases with governed alternatives.
 */
export function applySafeWording(text: string): string {
  let safe = text
  const replacements: [RegExp, string][] = [
    [/\bno deductible\b/gi, 'Deductible treatment depends on the specific scenario'],
    [/\bunlimited\b/gi, 'Coverage is generally available, but may be narrowed in some cases'],
    [/\bfully covered\b/gi, 'Policy wording indicates coverage, subject to conditions'],
    [/\btam kapsamlı\b/gi, 'Poliçe kapsamı koşullara bağlıdır'],
    [/\bguaranteed\b/gi, 'Policy wording indicates this protection, subject to conditions'],
    [/\bfull protection\b/gi, 'Protection is generally available, subject to policy conditions'],
    [
      /\btotal coverage\b/gi,
      'A single total coverage amount may not be meaningful for this policy',
    ],
    [
      /\bfree towing\b/gi,
      'Towing service availability depends on policy conditions and provider network',
    ],
    [/\bfully compliant\b/gi, 'Compliance status based on available policy data'],
    [/\bmuafiyetsiz\b/gi, 'Muafiyet durumu senaryoya bağlıdır'],
  ]

  for (const [pattern, replacement] of replacements) {
    safe = safe.replace(pattern, replacement)
  }
  return safe
}

// ============================================================================
// WORKSTREAM F: SOURCE QUOTE MAPPING
// ============================================================================

function buildSourceQuotes(data: ExtractedPolicyData): SourceQuoteRef[] {
  const quotes: SourceQuoteRef[] = []

  // Map from evidence.insights quotes
  if (data.evidence?.insights) {
    for (const ins of data.evidence.insights) {
      if (ins.quote) {
        quotes.push({
          quoteId: nextId('sq'),
          snippet: ins.quote,
          snippetNormalized: ins.textEn,
          confidence: 0.8,
        })
      }
    }
  }

  // Map from evidence.exclusions quotes
  if (data.evidence?.exclusions) {
    for (const exc of data.evidence.exclusions) {
      if (exc.quote) {
        quotes.push({
          quoteId: nextId('sq'),
          snippet: exc.quote,
          snippetNormalized: exc.textEn,
          confidence: 0.8,
        })
      }
    }
  }

  return quotes
}

// ============================================================================
// WORKSTREAM D: CARD BUILDERS
// ============================================================================

function buildPolicyBasicsCard(data: ExtractedPolicyData): PolicyBasicsCard {
  return {
    id: nextId('basics'),
    cardType: 'policy_basics',
    title: 'Policy Basics',
    body: `${data.provider || 'Unknown Insurer'} — ${data.policyType || 'Unknown'} policy`,
    statementType: 'confirmed_from_policy',
    displayEligibility: true,
    evidenceRefs: [],
    priority: 1,
    sourceQuoteAvailable: false,
    insurer: data.provider || 'Unknown',
    policyholder: data.insuredName || undefined,
    policyNumber: data.policyNumber || undefined,
    branch: data.policyType || 'unknown',
    periodStart: data.startDate || undefined,
    periodEnd: data.endDate || undefined,
    amendmentStatus: data.amendmentInfo?.isAmendment
      ? `Amendment #${data.amendmentInfo.amendmentNumber || '?'}`
      : undefined,
  }
}

function buildProtectionBasisCard(
  data: ExtractedPolicyData,
  sourceQuotes: SourceQuoteRef[]
): ProtectionBasisCard | undefined {
  if (!data.coverages || data.coverages.length === 0) return undefined

  const hasMarketValue = data.coverages.some((c) => c.isMarketValue)
  const hasUnlimited = data.coverages.some((c) => c.isUnlimited)

  let basisType: ProtectionBasisCard['basisType'] = 'unknown'
  let basisDetail = 'The app could not verify the protection basis for this policy.'

  if (hasMarketValue) {
    basisType = 'market_value'
    basisDetail =
      'Protection is based on market value (Rayiç Değer) at the time of claim, as stated in the policy wording.'
  } else if (hasUnlimited) {
    basisType = 'liability_limit'
    basisDetail =
      'Coverage is generally available, but may be narrowed in some cases. Exact limits depend on the specific coverage item and conditions.'
  }

  const quoteRef = sourceQuotes.length > 0 ? [sourceQuotes[0]] : []

  return {
    id: nextId('basis'),
    cardType: 'protection_basis',
    title: 'Main Protection Basis',
    body: basisDetail,
    statementType:
      hasMarketValue || hasUnlimited ? 'confirmed_from_policy' : 'unclear_not_verified',
    displayEligibility: true,
    evidenceRefs: quoteRef,
    priority: 2,
    sourceQuoteAvailable: quoteRef.length > 0,
    basisType,
    basisDetail,
  }
}

function buildCoverageCards(
  data: ExtractedPolicyData,
  suppressedStatements: SuppressionRecord[]
): CoverageCard[] {
  if (!data.coverages) return []
  const cards: CoverageCard[] = []

  for (const cov of data.coverages) {
    const conditionMarkers: string[] = []

    // Deductible wording governance
    let deductibleStatement: string | undefined
    if (cov.deductible !== null && cov.deductible !== undefined && cov.deductible > 0) {
      deductibleStatement = `Deductible of ${cov.deductible} applies.`
      conditionMarkers.push('has_deductible')
    } else if (cov.deductible === 0) {
      // NEVER say "no deductible" — use conditional wording
      deductibleStatement =
        'No specific deductible was identified for this coverage, but general conditions may apply.'
      conditionMarkers.push('deductible_conditional')
    }

    // Limit wording
    let limitStr: string | undefined
    if (cov.isUnlimited) {
      // NEVER say "unlimited" — use safe wording
      limitStr = 'Coverage is generally available, but may be narrowed in some cases.'
      conditionMarkers.push('limit_conditional')
    } else if (cov.limit) {
      limitStr = `${cov.limit.toLocaleString('tr-TR')} TRY`
    }

    // Build body with safe wording
    let body = `${cov.name || 'Coverage'}`
    if (limitStr) body += ` — Limit: ${limitStr}`
    if (deductibleStatement) body += ` — ${deductibleStatement}`

    // Check for prohibited phrases in the body
    const prohibited = checkProhibitedPhrase(body)
    if (prohibited) {
      body = applySafeWording(body)
      suppressedStatements.push({
        cardId: nextId('sup'),
        originalText: `Coverage card contained prohibited phrase: "${prohibited}"`,
        suppressionRule: 'PROHIBITED_PHRASE_REPLACEMENT',
        reason: `Replaced prohibited phrase "${prohibited}" with safe wording`,
        suppressedAt: new Date().toISOString(),
      })
    }

    const statementType: StatementType =
      conditionMarkers.length > 0 ? 'conditional_from_policy' : 'confirmed_from_policy'

    cards.push({
      id: nextId('cov'),
      cardType: 'coverage',
      title: cov.name || 'Coverage',
      body,
      statementType,
      displayEligibility: true,
      evidenceRefs: [],
      priority: 10 + cards.length,
      sourceQuoteAvailable: false,
      coverageName: cov.name || 'Unknown',
      limit: limitStr,
      deductibleStatement,
      conditionMarkers,
    })
  }

  return cards
}

function buildRestrictionCards(data: ExtractedPolicyData): RestrictionCard[] {
  const cards: RestrictionCard[] = []

  // Build from special conditions
  if (data.specialConditions) {
    for (const condition of data.specialConditions.slice(0, 10)) {
      const safeBody = applySafeWording(condition)
      cards.push({
        id: nextId('rest'),
        cardType: 'restriction',
        title: 'Special Condition',
        body: safeBody,
        statementType: 'conditional_from_policy',
        displayEligibility: true,
        evidenceRefs: [],
        priority: 30 + cards.length,
        sourceQuoteAvailable: false,
        restrictionType: 'special_condition',
        appliesTo: 'general',
      })
    }
  }

  // Build from clause graph conditional restrictions
  if (data.clauseGraph?.edges) {
    const restrictions = data.clauseGraph.edges.filter(
      (e) => e.relationshipType === 'conditional_restriction' || e.relationshipType === 'carve_out'
    )
    for (const edge of restrictions.slice(0, 5)) {
      cards.push({
        id: nextId('rest'),
        cardType: 'restriction',
        title: edge.relationshipType === 'carve_out' ? 'Carve-Out' : 'Conditional Restriction',
        body:
          edge.description || 'A conditional restriction applies. See policy wording for details.',
        statementType: 'conditional_from_policy',
        displayEligibility: true,
        evidenceRefs: [],
        priority: 30 + cards.length,
        sourceQuoteAvailable: false,
        restrictionType: edge.relationshipType,
        appliesTo: edge.sourceId,
      })
    }
  }

  return cards
}

function buildClaimRiskCards(data: ExtractedPolicyData, analysis: AnalysisBundle): ClaimRiskCard[] {
  const cards: ClaimRiskCard[] = []

  // Risk from deductibles
  const deductibles = data.coverages?.filter((c) => c.deductible !== null && c.deductible > 0) || []
  if (deductibles.length > 0) {
    cards.push({
      id: nextId('risk'),
      cardType: 'claim_risk',
      title: 'Deductible Reduction Risk',
      body: `${deductibles.length} coverage(s) have specific deductibles that will reduce the payout amount.`,
      statementType: 'confirmed_from_policy',
      displayEligibility: true,
      evidenceRefs: [],
      severity: 'medium',
      priority: 40,
      sourceQuoteAvailable: false,
      riskDescription: 'Deductibles present that reduce payout',
      likelihood: 'likely',
    })
  }

  // Risk from high exclusion count
  const exclusionCount = data.exclusions?.length || 0
  if (exclusionCount > 5) {
    cards.push({
      id: nextId('risk'),
      cardType: 'claim_risk',
      title: 'High Exclusion Count',
      body: `This policy has ${exclusionCount} exclusions. Some claims may be denied based on exclusion clauses.`,
      statementType: 'confirmed_from_policy',
      displayEligibility: true,
      evidenceRefs: [],
      severity: exclusionCount > 10 ? 'high' : 'medium',
      priority: 41,
      sourceQuoteAvailable: false,
      riskDescription: 'High number of exclusions',
      likelihood: 'possible',
    })
  }

  // Risk from consumer safety score
  const safetyScore = analysis.scoreBundle.scores.consumerSafetyScore
  if (safetyScore && safetyScore.scoreValue < 50) {
    cards.push({
      id: nextId('risk'),
      cardType: 'claim_risk',
      title: 'Consumer Safety Concern',
      body: 'This policy has factors that may affect consumer outcomes at claim time. Review conditions carefully.',
      statementType: 'conditional_from_policy',
      displayEligibility: true,
      evidenceRefs: [],
      severity: 'high',
      priority: 42,
      sourceQuoteAvailable: false,
      riskDescription: 'Low consumer safety assessment',
      likelihood: 'possible',
    })
  }

  return cards.slice(0, 5) // Top 5 risks
}

function buildMissingCards(data: ExtractedPolicyData, validation: ValidationResult): MissingCard[] {
  const cards: MissingCard[] = []

  if (!data.policyNumber) {
    cards.push({
      id: nextId('miss'),
      cardType: 'missing',
      title: 'Missing Policy Number',
      body: 'Policy number could not be extracted from the document.',
      statementType: 'unclear_not_verified',
      displayEligibility: true,
      evidenceRefs: [],
      priority: 50,
      sourceQuoteAvailable: false,
      missingItem: 'policyNumber',
      impact: 'Policy identification may be unreliable.',
    })
  }

  if (!data.currency) {
    cards.push({
      id: nextId('miss'),
      cardType: 'missing',
      title: 'Missing Currency',
      body: 'Currency for premium and coverage amounts was not explicitly stated in the document.',
      statementType: 'unclear_not_verified',
      displayEligibility: true,
      evidenceRefs: [],
      priority: 51,
      sourceQuoteAvailable: false,
      missingItem: 'currency',
      impact: 'Financial amounts may be misinterpreted.',
    })
  }

  // Missing from validation warnings
  const warnings = validation.flags.filter((f) => f.level === 'Warning')
  for (const w of warnings.slice(0, 5)) {
    cards.push({
      id: nextId('miss'),
      cardType: 'missing',
      title: 'Unresolved Ambiguity',
      body: w.message,
      statementType: 'unclear_not_verified',
      displayEligibility: true,
      evidenceRefs: [],
      priority: 52 + cards.length,
      sourceQuoteAvailable: false,
      missingItem: w.field || 'unknown',
      impact: 'This ambiguity may affect the accuracy of the analysis.',
    })
  }

  return cards
}

function buildBenchmarkCards(
  analysis: AnalysisBundle,
  suppressedStatements: SuppressionRecord[]
): BenchmarkCard[] {
  const cards: BenchmarkCard[] = []

  for (const comp of analysis.benchmarkBundle.comparisons) {
    if (!comp.displayEligibility) {
      suppressedStatements.push({
        cardId: nextId('sup'),
        originalText: `Benchmark comparison for ${comp.comparedField}`,
        suppressionRule: 'BENCHMARK_DISPLAY_INELIGIBLE',
        reason: comp.reasonIfSuppressed || 'Display eligibility check failed',
        suppressedAt: new Date().toISOString(),
      })
      continue
    }

    const ref = analysis.benchmarkBundle.references[comp.benchmarkId]
    const provenanceSummary = ref
      ? `Source: ${ref.provenance.sourceName} ${ref.provenance.sourceVersion}, ${ref.provenance.geography}, ${ref.provenance.effectiveDateRange.start}${ref.provenance.effectiveDateRange.end ? ' to ' + ref.provenance.effectiveDateRange.end : ''}`
      : 'Provenance unavailable'

    cards.push({
      id: nextId('bench'),
      cardType: 'benchmark',
      title: `Market Comparison: ${comp.comparedField}`,
      body: 'This is a market comparison, not a contractual policy term. It is provided by the application for informational purposes.',
      statementType: 'app_benchmark',
      displayEligibility: true,
      evidenceRefs: [],
      benchmarkRefs: [comp.benchmarkId],
      priority: 60 + cards.length,
      sourceQuoteAvailable: false,
      comparedField: comp.comparedField,
      policyValue: String(comp.policyValue),
      benchmarkValue: String(comp.benchmarkValue),
      difference: String(comp.difference),
      provenanceSummary,
    })
  }

  return cards
}

// ============================================================================
// MAIN INTERPRETER
// ============================================================================

/**
 * The core display interpreter.
 * Converts raw extraction + analysis data into a DisplaySafePolicySummary.
 *
 * ALL consumer-facing UI and report components MUST consume this output.
 * No component may read raw extraction, raw analysis, or raw benchmark data.
 *
 * This function is deterministic and rules-driven (no LLM generation).
 */
export function generateDisplaySafeSummary(
  data: ExtractedPolicyData,
  validation: ValidationResult,
  analysis: AnalysisBundle
): DisplaySafePolicySummary {
  // Reset card counter for each generation
  cardCounter = 0

  const generatedAt = new Date().toISOString()
  const suppressedStatements: SuppressionRecord[] = []

  // 1. Evaluate display mode (Workstream E)
  const { mode, triggers } = evaluateDisplayMode(data, validation, analysis)

  // 2. Build source quote map (Workstream F)
  const sourceQuoteMap = buildSourceQuotes(data)

  // 3. Build cards (Workstream D)
  const policyBasicsCard = buildPolicyBasicsCard(data)
  const protectionBasisCard = buildProtectionBasisCard(data, sourceQuoteMap)
  const keyCoverageCards = buildCoverageCards(data, suppressedStatements)
  const conditionalRestrictionCards = buildRestrictionCards(data)
  const claimReductionRiskCards = buildClaimRiskCards(data, analysis)
  const missingOrUnclearCards = buildMissingCards(data, validation)
  const benchmarkCards = buildBenchmarkCards(analysis, suppressedStatements)

  // 4. Build top summary
  const topSummary = buildTopSummary(data, mode, keyCoverageCards, missingOrUnclearCards)

  // 5. Build display warnings
  const displayWarnings: string[] = []
  if (mode === 'restricted') {
    displayWarnings.push(
      'Some summary claims have been restricted due to low extraction confidence. Review the source document for full details.'
    )
  }
  if (mode === 'human_review_required') {
    displayWarnings.push(
      'This analysis requires human review before being shared. Critical extraction issues were detected.'
    )
  }

  // 6. In restricted/human_review modes, suppress confident claims
  if (mode === 'human_review_required') {
    for (const card of keyCoverageCards) {
      if (card.statementType === 'confirmed_from_policy') {
        card.displayEligibility = false
        card.suppressionReason = 'Suppressed in human_review_required mode'
        suppressedStatements.push({
          cardId: card.id,
          originalText: card.body,
          suppressionRule: 'HUMAN_REVIEW_SUPPRESSION',
          reason: 'Confident claims suppressed pending human review.',
          suppressedAt: generatedAt,
        })
      }
    }
  }

  return {
    summaryVersion: DISPLAY_MODEL_VERSION,
    generatedAt,
    policyId: analysis.policyId,
    branch: data.policyType || 'unknown',
    displayMode: mode,
    topSummary,
    policyBasicsCard,
    protectionBasisCard,
    keyCoverageCards,
    conditionalRestrictionCards,
    claimReductionRiskCards,
    missingOrUnclearCards,
    benchmarkCards,
    sourceQuoteMap,
    suppressedStatements,
    reviewTriggers: triggers,
    displayWarnings,
  }
}

function buildTopSummary(
  data: ExtractedPolicyData,
  mode: DisplayMode,
  coverageCards: CoverageCard[],
  missingCards: MissingCard[]
): string {
  if (mode === 'human_review_required') {
    return 'This analysis requires human review. Some information could not be safely interpreted.'
  }

  if (mode === 'restricted') {
    return 'Some details of this policy could not be confidently interpreted. Review the source document for full details.'
  }

  const covCount = coverageCards.length
  const missCount = missingCards.length
  const branch = data.policyType || 'unknown'

  if (missCount > 3) {
    return `${branch.charAt(0).toUpperCase() + branch.slice(1)} policy with ${covCount} coverage(s) identified. ${missCount} items could not be confirmed — review recommended.`
  }

  return `${branch.charAt(0).toUpperCase() + branch.slice(1)} policy with ${covCount} coverage(s) identified.`
}
