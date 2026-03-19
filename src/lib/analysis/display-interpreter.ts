import type { AnalysisBundle } from '@/types/analysis'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import type { ValidationResult } from '@/lib/ai/validator'
import type {
  DisplaySafePolicySummary,
  DisplayMode,
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

function dedup<T extends { title: string }>(cards: T[]): T[] {
  const seen = new Set<string>()
  return cards.filter((c) => {
    if (seen.has(c.title)) return false
    seen.add(c.title)
    return true
  })
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
  'tam koruma',
  'mükemmel',
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
    [/\bunlimited\b/gi, 'Generally unlimited, subject to sublimits and specific carve-outs'],
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
    [/\bexcellent\b/gi, ''],
    [/\badvantage\b/gi, ''],
    [/\bmuafiyetsiz\b/gi, 'Muafiyet durumu senaryoya bağlıdır'],
    [
      /sınırsız cam onarımı[^.]*hasarsızlığı etkilemiyor/gi,
      'Cam teminatı özel şartlara bağlı olabilir — insan incelemesiyle doğrulanmalı',
    ],
    // Issue 2: Neutralize promotional KASKO insight phrasing
    // Order matters: catch the FULL promotional sentence first, then shorter fallbacks
    [
      /mükemmel\s+kapsamlı\s+kasko\s+teminatı[^.]*rayiç\s+değer[^.]*(?:sınırsız|tam\s+koruma)[^.]*/gi,
      'Teminat yapısı rayiç değer esasını işaret ediyor, ancak özel şartlar doğrulanmalı',
    ],
    [
      /mükemmel\s+kapsamlı\s+kasko\s+teminatı[^.]*rayiç\s+değer\s+üzerinden\s+tam\s+koruma/gi,
      'Ana teminat rayiç değer esasına dayanıyor; özel şartların ayrıca kontrolü gerekli',
    ],
    [
      /teminat\s+yapısı[^.]*rayiç\s+değer[^.]*sınırsız[^.]*/gi,
      'Teminat yapısı rayiç değer esasını işaret ediyor, ancak özel şartlar doğrulanmalı',
    ],
    [
      /mükemmel[^.]*teminat[ıi]/gi,
      'Teminat yapısı tespit edildi; özel şartların ayrıca kontrolü gerekli',
    ],
    [/\btam koruma\b/gi, 'Koruma kapsamı koşullara bağlıdır'],
    // Issue 3: Fix broken Turkish "kadenizi" in glass-related insights
    [
      /cam\s+değişimi[^.]*hasarsızlık\s+kade[a-zğüşöçı]*\s+etkile[a-zğüşöçı]*/gi,
      'Cam değişimi ve hasarsızlık indirimi ilişkisi özel şartlarla doğrulanmalı',
    ],
    [/değerli\s+bir\s+avantaj/gi, 'detay için özel şartlara bakılmalı'],
    // Issue 5: Catch long awkward glass-repair insight before generic "sınırsız" replacement
    // "sınırsız cam onarımı imkanı ile değişim yerine onarım yapıldığında araç değeri korunur"
    // The optional prefix handles: bare "cam onarımı...", "sınırsız cam onarımı...",
    // or post-cascade "Özel şartlara bağlı olabilir cam onarımı..."
    [
      /(?:sınırsız\s+|özel şartlara bağlı olabilir\s+)?cam\s+onar[ıi]m[ıi]\s+imkan[ıi]\s+ile[^.]*ara[çc]\s+de[ğg]eri\s+korunur/gi,
      'Cam hasarında onarım önceliği özel şartlara bağlı olabilir',
    ],
    [/\bsınırsız\b/gi, 'Özel şartlara bağlı olabilir'],
    [/\btamamen kapsar\b/gi, 'Poliçe kapsamı koşullara bağlıdır'],
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
      'Policy includes items marked as unlimited, but sublimits and scenario-specific carve-outs may apply. Review specific coverage items for details.'
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
      // Use safe wording — consistent with unlimited reconciliation
      limitStr = 'Generally unlimited, subject to sublimits and specific carve-outs'
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
  const branch = data.policyType || 'unknown'

  // Build from special conditions (skip normalizer-injected tags)
  if (data.specialConditions) {
    for (const condition of data.specialConditions.slice(0, 10)) {
      if (condition.startsWith('[')) continue // skip structured tags from normalizer
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

  // Build from clause graph with branch-specific edge interpretation
  if (data.clauseGraph?.edges) {
    const restrictions = data.clauseGraph.edges.filter(
      (e) => e.relationshipType === 'conditional_restriction' || e.relationshipType === 'carve_out'
    )
    for (const edge of restrictions.slice(0, 8)) {
      const branchTitle = interpretEdgeTitle(branch, edge)
      const branchBody = edge.description || interpretEdgeBody(edge)

      cards.push({
        id: nextId('rest'),
        cardType: 'restriction',
        title: branchTitle,
        body: applySafeWording(branchBody),
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

// Branch-specific clause-graph edge title interpretation
function interpretEdgeTitle(
  branch: string,
  edge: { relationshipType: string; sourceId: string; targetId: string | null }
): string {
  if (edge.relationshipType === 'carve_out') return 'Carve-Out Exception'

  // Branch-specific dependency labeling
  const src = (edge.sourceId || '').toLowerCase()
  const tgt = (edge.targetId || '').toLowerCase()

  switch (branch) {
    case 'home':
      if (src.includes('average') || tgt.includes('average')) return 'Underinsurance Dependency'
      if (src.includes('alarm') || tgt.includes('alarm')) return 'Alarm System Obligation'
      if (src.includes('vacan') || tgt.includes('vacan')) return 'Vacancy Restriction'
      return 'Home Coverage Condition'
    case 'health':
      if (src.includes('network') || tgt.includes('network')) return 'Network Access Dependency'
      if (src.includes('wait') || tgt.includes('wait')) return 'Waiting Period Dependency'
      if (src.includes('preauth') || tgt.includes('preauth')) return 'Pre-Authorization Dependency'
      return 'Health Coverage Condition'
    case 'business':
      if (
        src.includes('bi') ||
        tgt.includes('bi') ||
        src.includes('interrupt') ||
        tgt.includes('interrupt')
      )
        return 'BI Coverage Dependency'
      if (src.includes('warranty') || tgt.includes('warranty'))
        return 'Warranty Obligation Dependency'
      return 'Business Coverage Condition'
    case 'nakliyat':
      if (src.includes('icc') || tgt.includes('icc')) return 'ICC Clause Dependency'
      if (
        src.includes('route') ||
        tgt.includes('route') ||
        src.includes('packag') ||
        tgt.includes('packag')
      )
        return 'Transit Condition Dependency'
      if (
        src.includes('w2w') ||
        tgt.includes('w2w') ||
        src.includes('warehouse') ||
        tgt.includes('warehouse')
      )
        return 'W2W Scope Dependency'
      return 'Cargo Coverage Condition'
    case 'life':
      if (src.includes('rider') || tgt.includes('rider')) return 'Rider Dependency Chain'
      if (
        src.includes('benefic') ||
        tgt.includes('benefic') ||
        src.includes('lehdar') ||
        tgt.includes('lehdar')
      )
        return 'Beneficiary Linkage'
      return 'Life Coverage Condition'
    case 'traffic':
      if (
        src.includes('territory') ||
        tgt.includes('territory') ||
        src.includes('zone') ||
        tgt.includes('zone')
      )
        return 'Territorial Restriction'
      if (
        src.includes('use') ||
        tgt.includes('use') ||
        src.includes('vehicle') ||
        tgt.includes('vehicle')
      )
        return 'Vehicle Use Restriction'
      return 'Traffic Liability Condition'
    case 'dask':
      if (
        src.includes('scope') ||
        tgt.includes('scope') ||
        src.includes('earthquake') ||
        tgt.includes('earthquake')
      )
        return 'Compulsory Scope Boundary'
      return 'DASK Coverage Condition'
    default:
      return edge.relationshipType === 'carve_out' ? 'Carve-Out' : 'Conditional Restriction'
  }
}

// Branch-specific clause-graph edge body fallback
function interpretEdgeBody(edge: {
  relationshipType: string
  sourceId: string
  targetId: string | null
}): string {
  const rel = edge.relationshipType === 'carve_out' ? 'exception' : 'dependency'
  return `A ${rel} exists between ${edge.sourceId || 'coverage A'} and ${edge.targetId || 'coverage B'}. See policy wording for details.`
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

  // Sanitize: scrub prohibited phrases from card body text (defense in depth)
  for (const card of cards) {
    for (const phrase of PROHIBITED_PHRASES) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      card.body = card.body.replace(regex, '[limit-status-unclear]')
      card.impact = card.impact.replace(regex, '[limit-status-unclear]')
    }
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
// BRANCH-SPECIFIC CARD BUILDERS
// ============================================================================

type BranchCards = {
  coverageCards: CoverageCard[]
  restrictionCards: RestrictionCard[]
  riskCards: ClaimRiskCard[]
  missingCards: MissingCard[]
}

function buildBranchSpecificCards(
  data: ExtractedPolicyData,
  analysis: AnalysisBundle,
  validation: ValidationResult,
  suppressedStatements: SuppressionRecord[]
): BranchCards | null {
  const branch = data.policyType
  switch (branch) {
    case 'traffic':
      return buildTrafficCards(data, analysis, validation, suppressedStatements)
    case 'home':
      return buildHomeCards(data, analysis, validation, suppressedStatements)
    case 'health':
      return buildHealthCards(data, analysis, validation, suppressedStatements)
    case 'life':
      return buildLifeCards(data, analysis, validation, suppressedStatements)
    case 'dask':
      return buildDaskCards(data, analysis, validation, suppressedStatements)
    case 'business':
      return buildBusinessCards(data, analysis, validation, suppressedStatements)
    case 'nakliyat':
      return buildNakliyatCards(data, analysis, validation, suppressedStatements)
    default:
      return null // generic fallback for kasko and unknown
  }
}

// ---- helpers ----

function covCard(
  title: string,
  body: string,
  st: StatementType,
  limit?: string,
  deductible?: string,
  markers: string[] = [],
  priority = 10
): CoverageCard {
  return {
    id: nextId('cov'),
    cardType: 'coverage',
    title,
    body: applySafeWording(body),
    statementType: st,
    displayEligibility: true,
    evidenceRefs: [],
    priority,
    sourceQuoteAvailable: false,
    coverageName: title,
    limit,
    deductibleStatement: deductible,
    conditionMarkers: markers,
  }
}

function restCard(
  title: string,
  body: string,
  type: string,
  applies: string,
  priority = 30
): RestrictionCard {
  return {
    id: nextId('rest'),
    cardType: 'restriction',
    title,
    body: applySafeWording(body),
    statementType: 'conditional_from_policy',
    displayEligibility: true,
    evidenceRefs: [],
    priority,
    sourceQuoteAvailable: false,
    restrictionType: type,
    appliesTo: applies,
  }
}

function riskCard(
  title: string,
  body: string,
  sev: 'low' | 'medium' | 'high',
  priority = 40
): ClaimRiskCard {
  return {
    id: nextId('risk'),
    cardType: 'claim_risk',
    title,
    body: applySafeWording(body),
    statementType: 'conditional_from_policy',
    displayEligibility: true,
    evidenceRefs: [],
    severity: sev,
    priority,
    sourceQuoteAvailable: false,
    riskDescription: title,
    likelihood: sev === 'high' ? 'likely' : 'possible',
  }
}

function missCard(
  title: string,
  body: string,
  item: string,
  impact: string,
  priority = 50
): MissingCard {
  return {
    id: nextId('miss'),
    cardType: 'missing',
    title,
    body,
    statementType: 'unclear_not_verified',
    displayEligibility: true,
    evidenceRefs: [],
    priority,
    sourceQuoteAvailable: false,
    missingItem: item,
    impact,
  }
}

function limStr(c: { limit?: number | null; isUnlimited?: boolean }): string | undefined {
  if (c.isUnlimited) return 'Generally unlimited, subject to sublimits and specific carve-outs'
  if (c.limit) return `${c.limit.toLocaleString('tr-TR')} TRY`
  return undefined
}

function dedStr(c: { deductible?: number | null }): string | undefined {
  if (c.deductible && c.deductible > 0)
    return `Deductible of ${c.deductible.toLocaleString('tr-TR')} TRY applies.`
  return undefined
}

function condMatch(conditions: string[], ...keywords: string[]): boolean {
  return conditions.some((c) => keywords.some((k) => c.toLowerCase().includes(k)))
}

function condFind(conditions: string[], ...keywords: string[]): string | undefined {
  return conditions.find((c) => keywords.some((k) => c.toLowerCase().includes(k)))
}

// ==== TRAFFIC ====
function buildTrafficCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // Group: statutory liability coverages
  const liabCovs = coverages.filter(
    (c) =>
      c.category === 'liability' ||
      c.name?.toLowerCase().includes('bodily') ||
      c.name?.toLowerCase().includes('property') ||
      c.name?.toLowerCase().includes('death') ||
      c.nameTr?.toLowerCase().includes('bedeni') ||
      c.nameTr?.toLowerCase().includes('maddi')
  )
  const otherCovs = coverages.filter((c) => !liabCovs.includes(c))

  const hasEnhanced = liabCovs.some((c) => c.limit !== null && c.limit! > 1_200_000)

  for (const c of liabCovs) {
    const isAboveMin = c.limit !== null && c.limit! > 1_200_000
    coverageCards.push(
      covCard(
        c.name || 'Liability Coverage',
        `${c.name || 'Liability'} — ${isAboveMin ? 'Enhanced (above statutory minimum)' : 'At or near statutory minimum'}`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c),
        isAboveMin ? ['enhanced_liability'] : ['statutory_minimum']
      )
    )
  }
  for (const c of otherCovs) {
    coverageCards.push(
      covCard(
        c.name || 'Additional Coverage',
        `${c.name}`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c)
      )
    )
  }

  // Restrictions: vehicle/use/territory
  if (condMatch(conditions, 'ticari', 'commercial')) {
    restrictionCards.push(
      restCard(
        'Vehicle Use Restriction',
        condFind(conditions, 'ticari', 'commercial') || 'Vehicle use restrictions apply.',
        'vehicle_use',
        'all_coverages'
      )
    )
  }
  if (condMatch(conditions, 'bölge', 'territory', 'coğrafi')) {
    restrictionCards.push(
      restCard(
        'Territory Restriction',
        condFind(conditions, 'bölge', 'territory', 'coğrafi') || 'Geographical restrictions apply.',
        'territory',
        'all_coverages'
      )
    )
  }

  // Risk: statutory-only exposure
  if (!hasEnhanced) {
    riskCards.push(
      riskCard(
        'Statutory-Only Liability Exposure',
        'All liability limits are at or near the SEDDK statutory minimum. In a serious accident, the statutory floor may not cover actual damages. The policy does not provide enhanced protection above the legal minimum.',
        'high'
      )
    )
  }

  // Missing: enhanced coverage status
  if (!hasEnhanced && liabCovs.length > 0) {
    missingCards.push(
      missCard(
        'No Enhanced Liability Confirmed',
        'The app could not confirm any liability coverage above the statutory minimum. If the policy intended enhanced limits, this could not be verified from the document.',
        'enhanced_liability',
        'Liability exposure may be higher than expected at claim time.'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== HOME ====
function buildHomeCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // Group: building / contents / valuables / liability / supplementary
  const building = coverages.filter(
    (c) => c.name?.toLowerCase().includes('building') || c.nameTr?.toLowerCase().includes('bina')
  )
  const contents = coverages.filter(
    (c) => c.name?.toLowerCase().includes('content') || c.nameTr?.toLowerCase().includes('eşya')
  )
  const valuables = coverages.filter(
    (c) => c.name?.toLowerCase().includes('valuable') || c.nameTr?.toLowerCase().includes('kıymet')
  )
  const liability = coverages.filter(
    (c) =>
      c.category === 'liability' ||
      c.name?.toLowerCase().includes('liability') ||
      c.nameTr?.toLowerCase().includes('sorumluluk')
  )
  const supplementary = coverages.filter(
    (c) =>
      !building.includes(c) &&
      !contents.includes(c) &&
      !valuables.includes(c) &&
      !liability.includes(c)
  )

  const addGroup = (items: typeof coverages, groupLabel: string) => {
    for (const c of items) {
      coverageCards.push(
        covCard(
          `${groupLabel}: ${c.name || 'Coverage'}`,
          `${c.name || groupLabel} coverage`,
          'confirmed_from_policy',
          limStr(c),
          dedStr(c),
          [groupLabel.toLowerCase().replace(/\s/g, '_')]
        )
      )
    }
  }
  addGroup(building, 'Building')
  addGroup(contents, 'Contents')
  addGroup(valuables, 'Valuables')
  addGroup(liability, 'Liability')
  addGroup(supplementary, 'Supplementary')

  // Restrictions: alarm, vacancy, occupancy, construction
  if (condMatch(conditions, 'alarm'))
    restrictionCards.push(
      restCard(
        'Alarm Condition',
        condFind(conditions, 'alarm') || 'Alarm system must be active.',
        'alarm_condition',
        'property'
      )
    )
  if (condMatch(conditions, 'boş', 'vacancy', 'vacant'))
    restrictionCards.push(
      restCard(
        'Vacancy Condition',
        condFind(conditions, 'boş', 'vacancy', 'vacant') ||
          'Property may not be left vacant beyond the specified period.',
        'vacancy_condition',
        'property'
      )
    )
  if (condMatch(conditions, 'underinsurance', 'average', 'alt sigorta')) {
    restrictionCards.push(
      restCard(
        'Underinsurance / Average Clause',
        condFind(conditions, 'underinsurance', 'average', 'alt sigorta') ||
          'Average clause applies — proportional reduction if under-declared.',
        'average_clause',
        'all_coverages'
      )
    )
    riskCards.push(
      riskCard(
        'Payout Reduction: Average Clause',
        'If the declared value is below the actual replacement value, the payout may be proportionally reduced under the average clause.',
        'high'
      )
    )
  }

  // Missing
  if (building.length === 0 && contents.length === 0) {
    missingCards.push(
      missCard(
        'Building/Contents Separation Not Confirmed',
        'The app could not separate building and contents coverage. This makes it unclear which items are covered under which limit.',
        'building_contents_separation',
        'Claim settlement may be ambiguous.'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== HEALTH ====
function buildHealthCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // Group: inpatient / outpatient / maternity / dental / vision / mental health
  const groups: [string, string[]][] = [
    ['Inpatient', ['inpatient', 'yatarak']],
    ['Outpatient', ['outpatient', 'ayakta']],
    ['Maternity', ['maternity', 'doğum', 'hamilelik']],
    ['Dental', ['dental', 'diş']],
    ['Vision', ['vision', 'göz', 'optik']],
    ['Mental Health', ['mental', 'psikoloji']],
  ]

  const classified = new Set<number>()
  for (const [label, kws] of groups) {
    const matched = coverages.filter((c, idx) => {
      if (classified.has(idx)) return false
      return kws.some(
        (k) => c.name?.toLowerCase().includes(k) || c.nameTr?.toLowerCase().includes(k)
      )
    })
    for (const c of matched) {
      classified.add(coverages.indexOf(c))
      coverageCards.push(
        covCard(
          `${label}: ${c.name || 'Coverage'}`,
          `${c.name || label} — health coverage`,
          'confirmed_from_policy',
          limStr(c),
          dedStr(c),
          [label.toLowerCase().replace(/\s/g, '_')]
        )
      )
    }
  }
  // Remaining
  coverages.forEach((c, idx) => {
    if (!classified.has(idx)) {
      coverageCards.push(
        covCard(
          c.name || 'Health Coverage',
          `${c.name}`,
          'confirmed_from_policy',
          limStr(c),
          dedStr(c)
        )
      )
    }
  })

  // Restrictions: network, waiting, copay, preauth
  if (condMatch(conditions, 'network', 'anlaşmalı', 'ağ')) {
    restrictionCards.push(
      restCard(
        'Network Dependency',
        condFind(conditions, 'network', 'anlaşmalı', 'ağ') ||
          'Treatment must be within the provider network.',
        'network_dependency',
        'all_coverages'
      )
    )
    riskCards.push(
      riskCard(
        'Out-of-Network Risk',
        'Treatment outside the provider network may not be covered or may have reduced reimbursement.',
        'medium'
      )
    )
  } else {
    missingCards.push(
      missCard(
        'Network Information Not Confirmed',
        'The app could not determine whether this policy requires treatment within a specific provider network.',
        'network_info',
        'Out-of-network treatment reimbursement may be uncertain.'
      )
    )
  }

  if (condMatch(conditions, 'waiting', 'bekleme')) {
    restrictionCards.push(
      restCard(
        'Waiting Period',
        condFind(conditions, 'waiting', 'bekleme') ||
          'Waiting periods apply before coverage begins for certain treatments.',
        'waiting_period',
        'selected_coverages'
      )
    )
  } else {
    missingCards.push(
      missCard(
        'Waiting Periods Not Confirmed',
        'The app could not determine specific waiting periods for this policy.',
        'waiting_periods',
        'Claims made too early may be denied.'
      )
    )
  }

  if (condMatch(conditions, 'copay', 'co-pay', 'katılım', 'pay')) {
    restrictionCards.push(
      restCard(
        'Cost-Sharing / Copay',
        condFind(conditions, 'copay', 'co-pay', 'katılım') ||
          'Patient cost-sharing (copay) applies.',
        'copay',
        'claims'
      )
    )
    riskCards.push(
      riskCard(
        'Copay Payout Reduction',
        'A percentage of each claim is borne by the policyholder as copay/cost-sharing.',
        'medium'
      )
    )
  }

  if (condMatch(conditions, 'pre-authorization', 'preauth', 'ön onay')) {
    restrictionCards.push(
      restCard(
        'Pre-Authorization Required',
        condFind(conditions, 'pre-authorization', 'preauth', 'ön onay') ||
          'Some treatments require pre-authorization before proceeding.',
        'pre_authorization',
        'hospitalization'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== LIFE ====
function buildLifeCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // Group: death benefit / riders / exclusion-related
  const deathBenefit = coverages.filter(
    (c) =>
      c.name?.toLowerCase().includes('death') ||
      c.nameTr?.toLowerCase().includes('vefat') ||
      c.name?.toLowerCase().includes('sum assured') ||
      c.nameTr?.toLowerCase().includes('teminat bedeli')
  )
  const riders = coverages.filter(
    (c) =>
      !deathBenefit.includes(c) &&
      (c.name?.toLowerCase().includes('rider') || c.category === 'supplementary')
  )
  const other = coverages.filter((c) => !deathBenefit.includes(c) && !riders.includes(c))

  for (const c of deathBenefit) {
    coverageCards.push(
      covCard(
        'Death Benefit: ' + (c.name || 'Main'),
        `${c.name || 'Death benefit'} — the primary sum payable`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c),
        ['death_benefit']
      )
    )
  }
  for (const c of riders) {
    coverageCards.push(
      covCard(
        'Rider: ' + (c.name || 'Supplementary'),
        `${c.name || 'Rider'} — additional coverage attached to the main policy`,
        'conditional_from_policy',
        limStr(c),
        dedStr(c),
        ['rider']
      )
    )
  }
  for (const c of other) {
    coverageCards.push(
      covCard(c.name || 'Life Coverage', `${c.name}`, 'confirmed_from_policy', limStr(c), dedStr(c))
    )
  }

  // Restrictions: beneficiary, contestability, suicide clause
  const hasBeneficiary = condMatch(conditions, 'beneficiary', 'lehdar')
  if (hasBeneficiary) {
    restrictionCards.push(
      restCard(
        'Beneficiary Designation',
        condFind(conditions, 'beneficiary', 'lehdar') || 'Beneficiary is designated in the policy.',
        'beneficiary',
        'death_benefit'
      )
    )
  } else {
    missingCards.push(
      missCard(
        'Beneficiary Not Confirmed',
        'The app could not confirm the beneficiary designation from the policy document. This is critical for claim settlement.',
        'beneficiary',
        'Claim payment may be delayed or disputed without clear beneficiary designation.'
      )
    )
    riskCards.push(
      riskCard(
        'Beneficiary Uncertainty',
        'Beneficiary designation could not be confirmed from the policy document. This may delay or complicate claim settlement.',
        'high'
      )
    )
  }

  if (condMatch(conditions, 'contestability', 'itiraz')) {
    restrictionCards.push(
      restCard(
        'Contestability Period',
        condFind(conditions, 'contestability', 'itiraz') ||
          'Insurer may contest the policy within the contestability period.',
        'contestability',
        'all_coverages'
      )
    )
  }
  if (condMatch(conditions, 'suicide', 'intihar')) {
    restrictionCards.push(
      restCard(
        'Suicide Clause',
        condFind(conditions, 'suicide', 'intihar') ||
          'Death by suicide may be excluded within a specified initial period.',
        'suicide_clause',
        'death_benefit'
      )
    )
  }

  // Risk: rider conditionality
  if (riders.length > 0) {
    riskCards.push(
      riskCard(
        'Rider Conditionality',
        `${riders.length} rider(s) are attached. Rider coverage may have separate conditions, waiting periods, or exclusions distinct from the main policy.`,
        'medium'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== DASK ====
function buildDaskCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // All DASK coverages are earthquake scope; group clearly
  for (const c of coverages) {
    const isEq =
      c.name?.toLowerCase().includes('earthquake') || c.nameTr?.toLowerCase().includes('deprem')
    coverageCards.push(
      covCard(
        (isEq ? 'EQ Scope: ' : 'DASK: ') + (c.name || 'Coverage'),
        `${c.name || 'Coverage'} — compulsory earthquake insurance`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c),
        isEq ? ['earthquake_scope'] : ['dask_supplementary']
      )
    )
  }

  // Restrictions: building class, area, zone
  if (condMatch(conditions, 'yapı tarzı', 'building class', 'sınıf', 'betonarme')) {
    restrictionCards.push(
      restCard(
        'Building Classification',
        condFind(conditions, 'yapı tarzı', 'building class', 'sınıf', 'betonarme') ||
          'Building class determines the coverage cap.',
        'building_class',
        'all_coverages'
      )
    )
  }
  if (condMatch(conditions, 'alan', 'brüt', 'area', 'm²')) {
    restrictionCards.push(
      restCard(
        'Building Area',
        condFind(conditions, 'alan', 'brüt', 'area', 'm²') ||
          'Coverage is based on gross building area.',
        'building_area',
        'all_coverages'
      )
    )
  }

  // Risk: DASK covers earthquake only
  riskCards.push(
    riskCard(
      'Earthquake-Only Scope',
      'DASK is compulsory earthquake insurance only. It does NOT cover fire (unless caused by earthquake), theft, flooding, or any other property peril. A separate homeowner policy is required for broader property protection.',
      'high'
    )
  )

  // Risk: statutory cap
  const maxLimit = Math.max(...coverages.map((c) => c.limit || 0))
  if (maxLimit > 0 && maxLimit < 1_000_000) {
    riskCards.push(
      riskCard(
        'Low Statutory Cap',
        `Maximum DASK coverage is ${maxLimit.toLocaleString('tr-TR')} TRY. If the building repair cost exceeds this cap, the excess is not covered by DASK.`,
        'medium'
      )
    )
  }

  // Missing: building class
  if (!condMatch(conditions, 'yapı tarzı', 'building class', 'sınıf', 'betonarme')) {
    missingCards.push(
      missCard(
        'Building Class Not Confirmed',
        'The building construction class (e.g., reinforced concrete, masonry) could not be confirmed. This affects the coverage cap.',
        'building_class',
        'Coverage cap may be incorrect for the actual building type.'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== BUSINESS ====
function buildBusinessCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // Group: property / stock / machinery / BI / liability / specialty
  const classify = (c: (typeof coverages)[0]): string => {
    const n = (c.name || '').toLowerCase()
    const nTr = (c.nameTr || '').toLowerCase()
    if (
      n.includes('building') ||
      n.includes('fire') ||
      nTr.includes('bina') ||
      nTr.includes('yangın')
    )
      return 'Property'
    if (
      n.includes('stock') ||
      n.includes('inventor') ||
      nTr.includes('emtia') ||
      nTr.includes('stok')
    )
      return 'Stock/Inventory'
    if (
      n.includes('machin') ||
      n.includes('equipment') ||
      nTr.includes('makine') ||
      nTr.includes('teçhizat') ||
      nTr.includes('cihaz')
    )
      return 'Machinery/Equipment'
    if (n.includes('business interruption') || n.includes('iş durması') || nTr.includes('iş dur'))
      return 'Business Interruption'
    if (c.category === 'liability' || n.includes('liability') || nTr.includes('sorumluluk'))
      return 'Liability'
    return 'Other'
  }

  for (const c of coverages) {
    const group = classify(c)
    coverageCards.push(
      covCard(
        `${group}: ${c.name || 'Coverage'}`,
        `${c.name || group}`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c),
        [group.toLowerCase().replace(/[\s/]/g, '_')]
      )
    )
  }

  // Restrictions: alarm/sprinkler/guard, average clause, BI period
  if (condMatch(conditions, 'alarm'))
    restrictionCards.push(
      restCard(
        'Alarm Warranty',
        condFind(conditions, 'alarm') || 'Alarm system must be active and maintained.',
        'alarm_warranty',
        'all_coverages'
      )
    )
  if (condMatch(conditions, 'sprinkler'))
    restrictionCards.push(
      restCard(
        'Sprinkler Warranty',
        condFind(conditions, 'sprinkler') || 'Sprinkler system must be operational.',
        'sprinkler_warranty',
        'all_coverages'
      )
    )
  if (condMatch(conditions, 'guard', 'güvenlik', 'security'))
    restrictionCards.push(
      restCard(
        'Security Warranty',
        condFind(conditions, 'guard', 'güvenlik', 'security') ||
          'Security measures must be maintained.',
        'security_warranty',
        'all_coverages'
      )
    )
  if (condMatch(conditions, 'average', 'first loss', 'alt sigorta')) {
    restrictionCards.push(
      restCard(
        'Average / First Loss Clause',
        condFind(conditions, 'average', 'first loss', 'alt sigorta') ||
          'Proportional reduction if declared value is below actual value.',
        'average_clause',
        'property_stock'
      )
    )
    riskCards.push(
      riskCard(
        'Payout Reduction: Average Clause',
        'If property or stock is undervalued in the policy declaration, the payout will be proportionally reduced.',
        'high'
      )
    )
  }

  // BI period/waiting
  const hasBICov = coverages.some(
    (c) =>
      (c.name || '').toLowerCase().includes('business interruption') ||
      (c.nameTr || '').toLowerCase().includes('iş dur')
  )
  if (hasBICov) {
    if (condMatch(conditions, 'indemnity period', 'BI period')) {
      restrictionCards.push(
        restCard(
          'BI Indemnity Period',
          condFind(conditions, 'indemnity period', 'BI period') ||
            'Business interruption coverage has a defined indemnity period.',
          'bi_period',
          'business_interruption'
        )
      )
    } else {
      missingCards.push(
        missCard(
          'BI Indemnity Period Not Confirmed',
          'Business interruption coverage exists but the indemnity period was not confirmed from the document.',
          'bi_indemnity_period',
          'BI claim duration limits are unknown.'
        )
      )
    }
    if (condMatch(conditions, 'waiting period', 'bi waiting')) {
      restrictionCards.push(
        restCard(
          'BI Waiting Period',
          condFind(conditions, 'waiting period', 'bi waiting') ||
            'A waiting period applies before BI coverage begins.',
          'bi_waiting',
          'business_interruption'
        )
      )
      riskCards.push(
        riskCard(
          'BI Waiting Period Exposure',
          'Business interruption claims are only payable after a waiting period. Revenue loss during the waiting period is not covered.',
          'medium'
        )
      )
    }
  }

  // Warranty breach risk
  const warrantyConds = conditions.filter(
    (c) =>
      c.toLowerCase().includes('warranty') ||
      c.toLowerCase().includes('must') ||
      c.toLowerCase().includes('zorunlu')
  )
  if (warrantyConds.length > 2) {
    riskCards.push(
      riskCard(
        'Multiple Warranty Conditions',
        `This policy has ${warrantyConds.length} warranty/obligation conditions. Breach of any warranty may void coverage entirely.`,
        'high'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== NAKLIYAT ====
function buildNakliyatCards(
  data: ExtractedPolicyData,
  _analysis: AnalysisBundle,
  _validation: ValidationResult,
  _sup: SuppressionRecord[]
): BranchCards {
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []
  const coverageCards: CoverageCard[] = []
  const restrictionCards: RestrictionCard[] = []
  const riskCards: ClaimRiskCard[] = []
  const missingCards: MissingCard[] = []

  // ICC classification
  const iccA = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('icc (a)') ||
      c.name?.toLowerCase().includes('all risk') ||
      c.description?.toLowerCase().includes('(a)')
  )
  const iccC = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('icc (c)') ||
      c.description?.toLowerCase().includes('(c)') ||
      c.name?.toLowerCase().includes('minimum')
  )
  const iccB = coverages.some(
    (c) => c.name?.toLowerCase().includes('icc (b)') || c.description?.toLowerCase().includes('(b)')
  )

  for (const c of coverages) {
    let iccLabel = ''
    if (
      c.name?.toLowerCase().includes('icc') ||
      c.description?.toLowerCase().includes('icc') ||
      c.description?.toLowerCase().includes('institute cargo')
    ) {
      if (c.name?.toLowerCase().includes('(a)') || c.description?.toLowerCase().includes('(a)'))
        iccLabel = ' [All Risks]'
      else if (
        c.name?.toLowerCase().includes('(c)') ||
        c.description?.toLowerCase().includes('(c)')
      )
        iccLabel = ' [Named Perils Only]'
      else if (
        c.name?.toLowerCase().includes('(b)') ||
        c.description?.toLowerCase().includes('(b)')
      )
        iccLabel = ' [Extended Named Perils]'
    }

    coverageCards.push(
      covCard(
        `Cargo: ${c.name || 'Coverage'}${iccLabel}`,
        `${c.name || 'Cargo'}${iccLabel ? ' — ' + iccLabel.slice(2, -1) : ''}`,
        'confirmed_from_policy',
        limStr(c),
        dedStr(c),
        iccLabel ? ['icc_classified'] : []
      )
    )
  }

  // Restrictions: W2W, packaging, route, storage
  const hasW2W = condMatch(conditions, 'warehouse-to-warehouse', 'depodan depoya', 'w2w')
  if (hasW2W) {
    const w2wExcluded = condMatch(conditions, 'hariç', 'excluded', 'transit only')
    if (w2wExcluded) {
      restrictionCards.push(
        restCard(
          'W2W Excluded — Transit Only',
          condFind(conditions, 'hariç', 'excluded', 'transit only') ||
            'Warehouse-to-warehouse is excluded. Coverage applies during transit only.',
          'w2w_excluded',
          'cargo'
        )
      )
      riskCards.push(
        riskCard(
          'No W2W Coverage',
          'Goods are NOT covered during loading/unloading or storage at origin/destination. Only transit is covered.',
          'high'
        )
      )
    } else {
      restrictionCards.push(
        restCard(
          'Warehouse-to-Warehouse Coverage',
          condFind(conditions, 'warehouse-to-warehouse', 'depodan depoya', 'w2w') ||
            'Coverage applies from origin warehouse to destination warehouse.',
          'w2w_included',
          'cargo'
        )
      )
    }
  } else {
    missingCards.push(
      missCard(
        'W2W Scope Not Confirmed',
        'The app could not determine whether warehouse-to-warehouse coverage applies. If goods are unprotected during loading/storage, this is a gap.',
        'w2w_scope',
        'Goods may be unprotected during loading/unloading.'
      )
    )
  }

  if (condMatch(conditions, 'packaging', 'packing', 'ambalaj')) {
    restrictionCards.push(
      restCard(
        'Packaging Requirement',
        condFind(conditions, 'packaging', 'packing', 'ambalaj') ||
          'Adequate packaging is required for coverage to apply.',
        'packaging',
        'cargo'
      )
    )
  } else {
    missingCards.push(
      missCard(
        'Packaging Requirement Not Confirmed',
        'No packaging requirement was found. Inadequate packaging may void coverage.',
        'packaging_requirement',
        'Claims may be denied for packaging deficiency.'
      )
    )
  }

  if (condMatch(conditions, 'route', 'güzergah', 'voyage')) {
    restrictionCards.push(
      restCard(
        'Route/Voyage',
        condFind(conditions, 'route', 'güzergah', 'voyage') || 'Coverage is route-specific.',
        'route',
        'cargo'
      )
    )
  }
  if (condMatch(conditions, 'storage', 'depo', 'bekleme')) {
    restrictionCards.push(
      restCard(
        'Intermediate Storage',
        condFind(conditions, 'storage', 'depo', 'bekleme') ||
          'Storage limits apply at intermediate points.',
        'storage',
        'cargo'
      )
    )
  }

  // ICC risk
  if (iccC && !iccA) {
    riskCards.push(
      riskCard(
        'Narrow ICC (C) Coverage',
        'This policy uses ICC (C) — the narrowest cargo clause. Only named perils are covered. Many common risks (theft, washing overboard, rough handling) are excluded.',
        'high'
      )
    )
  } else if (iccB && !iccA) {
    riskCards.push(
      riskCard(
        'Extended but Limited ICC (B) Coverage',
        'This policy uses ICC (B) — extended named perils. Some risks like theft and rough handling may still not be covered.',
        'medium'
      )
    )
  }

  // Missing: ICC not identified
  if (!iccA && !iccB && !iccC) {
    missingCards.push(
      missCard(
        'ICC Basis Not Confirmed',
        'The app could not determine the Institute Cargo Clause basis (A/B/C). This is critical for understanding which perils are covered.',
        'icc_basis',
        'Coverage scope cannot be accurately assessed without ICC classification.'
      )
    )
  }

  return { coverageCards, restrictionCards, riskCards, missingCards }
}

// ==== BRANCH TOP SUMMARY ====

function buildBranchTopSummary(
  data: ExtractedPolicyData,
  mode: DisplayMode,
  coverageCards: CoverageCard[],
  missingCards: MissingCard[],
  riskCards: ClaimRiskCard[]
): string {
  if (mode === 'human_review_required') {
    return 'This analysis requires human review. Some information could not be safely interpreted.'
  }
  if (mode === 'restricted') {
    return 'Some details of this policy could not be confidently interpreted. Review the source document for full details.'
  }

  const branch = data.policyType || 'unknown'
  const covCount = coverageCards.length
  const missCount = missingCards.length
  const highRisks = riskCards.filter((r) => r.severity === 'high').length

  const branchLabels: Record<string, string> = {
    traffic: 'Traffic (Trafik) liability',
    home: 'Home (Konut)',
    health: 'Health (Sağlık)',
    life: 'Life (Hayat)',
    dask: 'DASK (Compulsory Earthquake)',
    business: 'Business (İşyeri)',
    nakliyat: 'Cargo/Marine (Nakliyat)',
    kasko: 'Motor (Kasko)',
  }
  const label = branchLabels[branch] || branch.charAt(0).toUpperCase() + branch.slice(1)

  let summary = `${label} policy with ${covCount} coverage item(s) identified.`

  if (highRisks > 0) {
    summary += ` ${highRisks} high-severity risk(s) require attention.`
  }
  if (missCount > 0) {
    summary += ` ${missCount} item(s) could not be confirmed — review recommended.`
  }

  // Branch-specific top-summary appends
  if (branch === 'traffic') {
    const hasEnhanced = coverageCards.some((c) => c.conditionMarkers.includes('enhanced_liability'))
    if (!hasEnhanced) summary += ' All liability limits are at or near the statutory minimum.'
  }
  if (branch === 'dask')
    summary +=
      ' DASK covers earthquake damage only — a separate homeowner policy is needed for broader protection.'
  if (branch === 'health') {
    if (missingCards.some((m) => m.missingItem === 'network_info'))
      summary += ' Network status could not be confirmed.'
  }
  if (branch === 'nakliyat') {
    const iccMissing = missingCards.some((m) => m.missingItem === 'icc_basis')
    if (iccMissing) summary += ' ICC clause basis could not be confirmed.'
  }

  return summary
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

  // 3. Build cards — try branch-specific first, fall back to generic
  const policyBasicsCard = buildPolicyBasicsCard(data)
  const protectionBasisCard = buildProtectionBasisCard(data, sourceQuoteMap)
  const benchmarkCards = buildBenchmarkCards(analysis, suppressedStatements)

  const branchCards = buildBranchSpecificCards(data, analysis, validation, suppressedStatements)

  let keyCoverageCards: CoverageCard[]
  let conditionalRestrictionCards: RestrictionCard[]
  let claimReductionRiskCards: ClaimRiskCard[]
  let missingOrUnclearCards: MissingCard[]

  if (branchCards) {
    // Branch-specific cards available — use them, merging with generic missing/risk
    keyCoverageCards = branchCards.coverageCards
    conditionalRestrictionCards = [...branchCards.restrictionCards, ...buildRestrictionCards(data)]
    claimReductionRiskCards = [...branchCards.riskCards, ...buildClaimRiskCards(data, analysis)]
    missingOrUnclearCards = [...branchCards.missingCards, ...buildMissingCards(data, validation)]
    // Deduplicate by title
    conditionalRestrictionCards = dedup(conditionalRestrictionCards)
    claimReductionRiskCards = dedup(claimReductionRiskCards)
    missingOrUnclearCards = dedup(missingOrUnclearCards)
  } else {
    // Generic fallback (kasko, unknown)
    keyCoverageCards = buildCoverageCards(data, suppressedStatements)
    conditionalRestrictionCards = buildRestrictionCards(data)
    claimReductionRiskCards = buildClaimRiskCards(data, analysis)
    missingOrUnclearCards = buildMissingCards(data, validation)
  }

  // 4. Build top summary
  const topSummary = branchCards
    ? buildBranchTopSummary(
        data,
        mode,
        keyCoverageCards,
        missingOrUnclearCards,
        claimReductionRiskCards
      )
    : buildTopSummary(data, mode, keyCoverageCards, missingOrUnclearCards)

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
