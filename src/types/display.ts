// Display-safe types — no direct dependency on raw extraction types

// ============================================================================
// DISPLAY MODES
// ============================================================================

/**
 * Controls how much of the summary may be shown to the end user.
 * - full: all cards rendered normally
 * - restricted: only basics + warnings + missing; confident claims suppressed
 * - human_review_required: suppress all confident claims; show review banner
 */
export type DisplayMode = 'full' | 'restricted' | 'human_review_required'

// ============================================================================
// STATEMENT CLASSIFICATION
// ============================================================================

/**
 * Every rendered statement must carry exactly one of these classifications.
 * Components MUST NOT invent their own labels.
 */
export type StatementType =
  | 'confirmed_from_policy'
  | 'conditional_from_policy'
  | 'app_benchmark'
  | 'unclear_not_verified'

// ============================================================================
// SOURCE QUOTE REFERENCE
// ============================================================================

/**
 * Links a display card back to the original policy document text.
 * Used by the "View source quote" tooltip/modal.
 */
export interface SourceQuoteRef {
  quoteId: string
  /** Raw snippet from the policy document */
  snippet: string
  /** Normalized / translated snippet (if applicable) */
  snippetNormalized?: string
  page?: number
  section?: string
  /** Character offset range within the source document */
  offsetStart?: number
  offsetEnd?: number
  /** Confidence that this quote supports the claim */
  confidence: number
}

// ============================================================================
// SUPPRESSION RECORD
// ============================================================================

/**
 * Tracks every statement that the interpreter decided NOT to render.
 * Useful for audit, debugging, and human-review workflows.
 */
export interface SuppressionRecord {
  cardId: string
  originalText: string
  suppressionRule: string
  reason: string
  suppressedAt: string
}

// ============================================================================
// REVIEW TRIGGER
// ============================================================================

/**
 * Describes why the display mode was downgraded to restricted or human_review_required.
 */
export interface ReviewTrigger {
  triggerRule: string
  severity: 'warning' | 'critical'
  message: string
  field?: string
}

// ============================================================================
// DISPLAY CARDS
// ============================================================================

/**
 * Base interface for every renderable card/statement in the summary.
 * All card subtypes extend this.
 */
export interface DisplayCard {
  id: string
  title: string
  body: string
  statementType: StatementType
  displayEligibility: boolean
  suppressionReason?: string
  evidenceRefs: SourceQuoteRef[]
  benchmarkRefs?: string[]
  severity?: 'low' | 'medium' | 'high' | 'critical'
  priority: number
  sourceQuoteAvailable: boolean
}

// --- Card Subtypes ---

export interface PolicyBasicsCard extends DisplayCard {
  cardType: 'policy_basics'
  insurer: string
  policyholder?: string
  policyNumber?: string
  branch: string
  periodStart?: string
  periodEnd?: string
  amendmentStatus?: string
}

export interface ProtectionBasisCard extends DisplayCard {
  cardType: 'protection_basis'
  basisType:
    | 'market_value'
    | 'fixed_sum'
    | 'replacement_cost'
    | 'service_only'
    | 'liability_limit'
    | 'unknown'
  basisDetail: string
}

export interface CoverageCard extends DisplayCard {
  cardType: 'coverage'
  coverageName: string
  limit?: string
  deductibleStatement?: string
  conditionMarkers: string[]
}

export interface RestrictionCard extends DisplayCard {
  cardType: 'restriction'
  restrictionType: string
  appliesTo: string
}

export interface ClaimRiskCard extends DisplayCard {
  cardType: 'claim_risk'
  riskDescription: string
  likelihood: 'likely' | 'possible' | 'rare'
}

export interface MissingCard extends DisplayCard {
  cardType: 'missing'
  missingItem: string
  impact: string
}

export interface BenchmarkCard extends DisplayCard {
  cardType: 'benchmark'
  comparedField: string
  policyValue: string
  benchmarkValue: string
  difference: string
  provenanceSummary: string
}

// Union of all card types
export type AnyDisplayCard =
  | PolicyBasicsCard
  | ProtectionBasisCard
  | CoverageCard
  | RestrictionCard
  | ClaimRiskCard
  | MissingCard
  | BenchmarkCard

// ============================================================================
// TOP-LEVEL DISPLAY-SAFE SUMMARY
// ============================================================================

/**
 * The single contract object that all UI/report components MUST consume.
 * No component may read raw extraction, raw analysis, or raw benchmark data.
 */
export interface DisplaySafePolicySummary {
  summaryVersion: string
  generatedAt: string
  policyId: string
  branch: string
  displayMode: DisplayMode

  /** One-line safe top summary — pre-composed by the interpreter */
  topSummary: string

  /** Structured card groups */
  policyBasicsCard: PolicyBasicsCard
  protectionBasisCard?: ProtectionBasisCard
  keyCoverageCards: CoverageCard[]
  conditionalRestrictionCards: RestrictionCard[]
  claimReductionRiskCards: ClaimRiskCard[]
  missingOrUnclearCards: MissingCard[]
  benchmarkCards: BenchmarkCard[]

  /** Source quote map for "View source quote" actions */
  sourceQuoteMap: SourceQuoteRef[]

  /** All statements the interpreter chose to suppress */
  suppressedStatements: SuppressionRecord[]

  /** All triggers that caused display mode downgrade */
  reviewTriggers: ReviewTrigger[]

  /** Interpreter-level warnings for the consuming component */
  displayWarnings: string[]

  // =========================================================================
  // PILOT METADATA (optional — only present when pilot is active)
  // =========================================================================

  /** Whether this result comes from an active pilot flow */
  isPilotResult?: boolean

  /** Whether human review is required before trusting this result */
  requiresHumanReview?: boolean

  /** Current review status in the pilot workflow */
  pilotReviewStatus?:
    | 'pending_review'
    | 'review_in_progress'
    | 'accepted'
    | 'corrected_minor'
    | 'corrected_major'
    | 'rejected'

  /** Feature flag name controlling this pilot */
  pilotFlagName?: string

  /** Segment required for pilot access */
  pilotReviewerSegment?: string

  /** Draft/review warning banner text for the UI */
  pilotReviewBanner?: string

  /** Whether the result should be labeled as draft */
  isDraft?: boolean
}
