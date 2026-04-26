export type PolicyType =
  | 'kasko'
  | 'traffic'
  | 'home'
  | 'health'
  | 'life'
  | 'dask'
  | 'business'
  | 'nakliyat'

export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'pending' | 'draft'

/** Coverage category for organization */
export type CoverageCategory =
  | 'main'
  | 'liability'
  | 'personal_accident'
  | 'supplementary'
  | 'assistance'
  | 'legal'
  | 'other'

/** Coverage importance for visual display */
export type CoverageImportance = 'critical' | 'standard' | 'minor'

/** Vehicle information for kasko policies */
export interface VehicleInfo {
  plate?: string // e.g., "34 RZ 9511"
  make?: string // e.g., "Ford"
  model?: string // e.g., "Transit Custom"
  year?: number // e.g., 2023
  engineNo?: string // Motor no
  chassisNo?: string // Şasi no
  color?: string // Renk
  usage?: string // Kullanım şekli (Hususi/Ticari)
  vehicleClass?: string // Araç sınıfı (Binek/Kamyonet/TIR)
  fuelType?: string // Yakıt tipi (Benzin/Dizel/LPG/Elektrik)
}

/** Types of evidence sources in the document */
export type EvidenceType =
  | 'explicit_clause'
  | 'table_value'
  | 'endorsement'
  | 'implicit_context'
  | 'external_reference'

/** State of ambiguity for an extracted fact */
export type AmbiguityState = 'clear' | 'contradictory' | 'missing' | 'implied' | 'low_confidence'

/** Canonical Evidence representation for full traceability */
export interface Evidence {
  page?: number
  section?: string
  offsets?: {
    start: number
    end: number
  }
  rawSnippet: string
  normalizedSnippet?: string
  evidenceType: EvidenceType
  confidence: number
  ambiguityState: AmbiguityState
}

/** Wrapper for any extracted primitive to ensure traceability */
export interface Traceable<T> {
  value: T
  evidence?: Evidence
}

/** Mapping of extracted output field to character spans in canonical text */
export interface SpanMap {
  fieldPath: string
  start: number
  end: number
}

/** Types of relationships between clauses or coverage items */
export type RelationshipType =
  | 'coverage_inclusion'
  | 'conditional_restriction'
  | 'deductible_trigger'
  | 'sublimit'
  | 'carve_out'
  | 'endorsement_override'
  | 'service_benefit_linkage'

/** Edge in the clause relationship graph */
export interface ClauseRelationship {
  sourceId: string
  /** The target clause ID. Can be null if the relationship is ambiguous or unresolved. */
  targetId: string | null
  relationshipType: RelationshipType
  description?: string
  precedenceWeight?: number
  /** Indicates if this is an unresolved candidate relationship that needs human review */
  isCandidate?: boolean
}

/** Graph representing relationships and overrides between clauses */
export interface ClauseGraph {
  nodes: Record<string, unknown>
  edges: ClauseRelationship[]
}

export interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  description?: string
  /** True if coverage is unlimited (Sınırsız) */
  isUnlimited?: boolean
  /** True if limit is market value (Rayiç Değer) */
  isMarketValue?: boolean
  /** Coverage category for organization */
  category?: CoverageCategory
  /** Visual importance level */
  importance?: CoverageImportance
  /**
   * Evidence-pointer fields mirrored from ExtractedCoverage for audit and
   * grounding. The reviewer UI (PolicyCoverageSection) renders a "Page N",
   * "§ clause", and a verbatim quote block when any of these are present.
   * Populated by convertToAnalyzedPolicy() when the AI returns them.
   */
  /** Source page where this limit was found */
  page?: number | null
  /** Section heading / clause where this was extracted */
  clause?: string | null
  /** Verbatim text describing this limit */
  quote?: string | null
  /**
   * Optional per-scenario caps that narrow an otherwise-unlimited / broad
   * coverage. Canonical case: IMM Sınırsız capped at 2.500.000 TL at
   * airports / ports / fuel depots / refineries. The evaluator surfaces
   * these as a caveat badge on the relevant scenario card.
   */
  carveOuts?: string[] | null
}

/** Exclusion with severity information */
export interface Exclusion {
  text: string
  /** Severity level for visual display */
  severity: 'critical' | 'normal'
}

/**
 * Amendment/Zeyilname information for Turkish insurance policies
 * Real amendments have explicit markers in the document
 */
export interface AmendmentInfo {
  /** True if document explicitly contains Zeyilname/Amendment markers */
  isAmendment: boolean
  /** Amendment sequence number (e.g., "1/2024", "2/2024") */
  amendmentNumber: string | null
  /** Effective date of the amendment */
  amendmentDate: string | null
  /** Original policy number being amended */
  basePolicyNumber: string | null
  /** Reason for amendment (e.g., "Sigortalı Talebi", "Teminat Eklenmesi") */
  amendmentReason: string | null
  /** Premium change amount (positive = increase, negative = refund) */
  premiumDifference: number | null
}

export interface Policy {
  id: string
  policyNumber: string
  bagliPolNo?: string
  provider: string
  logo: string
  type: PolicyType
  typeTr: string
  coverage: number
  sigortaBedeli?: number
  premium: number
  /** Net premium before tax (Net Prim) */
  premiumNet?: number
  /** Tax amount, usually BSMV */
  premiumTax?: number
  monthlyPremium: number
  deductible: number
  startDate: string
  expiryDate: string
  status: PolicyStatus
  uploadDate: string
  createdAt?: string // ISO timestamp for tracking when policy was added to system
  fileName: string
  aiInsightsEn?: string[]
  documentType: string
  documentUrl?: string
  insuredPerson?: string
  location?: string
  beneficiary?: string
  policyTerm?: string
  paymentFrequency?: string
  agentName?: string
  coverages: Coverage[]
  exclusions: string[]
  exclusionsEn?: string[] | null
  specialConditions: string[]
  insuranceLine: string
  /** Discounts applied to the policy */
  discounts?: {
    ncdDiscount: number | null
    groupDiscount: number | null
    otherDiscountPct: number | null
    evidence: string | null
  } | null
  /** Entity Type */
  insuredEntityType?: 'individual' | 'corporate' | null
  /** Usage Type */
  vehicleUsage?: 'private' | 'commercial' | null
  /** Currency code for this policy (TRY, USD, EUR, GBP) - defaults to TRY */
  currency?: string
  /** Amendment information - populated if document has Zeyilname markers */
  amendmentInfo?: AmendmentInfo
  /** Hash of extracted text for detecting re-uploads of same document */
  documentHash?: string
  /** Vehicle information for kasko policies */
  vehicleInfo?: VehicleInfo
  /** Raw extracted text from the PDF document */
  extractedText?: string
  /** AI-processed text with OCR corrections and improved readability */
  processedText?: string
  /** Canonical, immutable text of the policy document for extraction */
  canonicalText?: string
  /** Mapping of JSON paths to character spans in canonicalText */
  spanMaps?: SpanMap[]
  /** Graph of relationships and precedence between clauses */
  clauseGraph?: ClauseGraph
  /** Versioned persistence fields mapped from Universal Schema */
  isUniversalSchema?: boolean
  validationErrors?: unknown
  validationWarnings?: unknown
  safetyScore?: number
  documentVersion?: number
  canonicalTextVersion?: number
  evidenceSpanVersion?: number
  clauseGraphVersion?: number
  extractionSchemaVersion?: string
}

/**
 * Represents a potential duplicate policy with similarity details
 */
export interface DuplicatePolicy {
  policy: Policy
  duplicateOf: Policy
  similarity: 'exact' | 'high' | 'medium'
  matchedFields: string[]
}

export interface AnalyzedPolicy extends Policy {
  aiConfidence: number
  aiInsights: string[]
  aiInsightsTr?: string[]
  marketComparison?: {
    averagePremium: number
    averageCoverage: number
    percentile: number
  }
  // ML-based risk assessment
  riskScore?: {
    overall: number
    level: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'
    topIssue: string | null
    confidence: number
  }
  // Risk mitigation actions
  riskActions?: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
  }>
  // Address for analysis
  insuredAddress?: string
  // Evidence for AI-extracted data
  evidenceData?: {
    insights: Record<string, string> // Map of insight text -> verbatim quote
    exclusions: Record<string, string> // Map of exclusion text -> verbatim quote
    // Map of original text -> translated verbatim quote
    quoteTranslations?: {
      insights: Record<string, string>
      exclusions: Record<string, string>
    }
  }
  // Comprehensive gap analysis
  gapAnalysis?: {
    overallScore: number // 0-100 (0 = no gaps, 100 = severe gaps)
    criticalCount: number
    highCount: number
    totalCount: number
    topIssue: string | null
    topIssueTr: string | null
    financialExposure: number
    remediationCost: number
  }
  // Gap action items
  gapActions?: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
    actionTr: string
    estimatedCost: number | null
  }>
  // Output from deterministic validator
  safetyFlags?: Array<{ level: 'Safe' | 'Warning' | 'Error'; message: string; field?: string }>
  safetyBlockReason?: string
  // Phase 4: Unified structured analysis containing scores, insights, benchmarks
  analysisBundle?: import('@/types/analysis').AnalysisBundle

  // ── Extraction completeness flags (reviewer safety) ──────────────────
  /** True when premium was not extracted from the document (value is 0 as placeholder) */
  premiumMissing?: boolean
  /** True when insured person was not extracted from the document */
  insuredMissing?: boolean
  /** True when deductible status could not be determined (value is 0 as placeholder) */
  deductibleUncertain?: boolean
  /** Reviewer-facing warnings about extraction quality (missing fields, contradictions) */
  extractionWarnings?: string[]
  /**
   * Scenario-based conditional deductibles detected in the policy text.
   * Separated from exclusions during extraction — rendered in their own section.
   */
  conditionalDeductibles?: string[]
  /** Highest percentage-based deductible extracted (e.g., 35 for "35% tenzili muafiyet"). */
  deductiblePercent?: number
  /** True when this policy is a draft (not yet approved by reviewer) */
  isDraft?: boolean
  /**
   * Premium discounts extracted from the policy (NCD, group/fleet, other).
   * Values are percent integers (e.g. 40 = 40%). evidence is a verbatim quote.
   */
  discounts?: {
    ncdDiscount: number | null
    groupDiscount: number | null
    otherDiscountPct: number | null
    evidence: string | null
  }
}

export const POLICY_TYPES: Record<PolicyType, { label: string; labelTr: string; icon: string }> = {
  kasko: { label: 'Comprehensive Auto', labelTr: 'Kasko', icon: '🚗' },
  traffic: { label: 'Traffic Liability', labelTr: 'Trafik Sigortası', icon: '🚦' },
  home: { label: 'Home Insurance', labelTr: 'Konut Sigortası', icon: '🏠' },
  health: { label: 'Health Insurance', labelTr: 'Sağlık Sigortası', icon: '🏥' },
  life: { label: 'Life Insurance', labelTr: 'Hayat Sigortası', icon: '💗' },
  dask: { label: 'Earthquake Insurance', labelTr: 'DASK', icon: '🏗️' },
  business: { label: 'Business Insurance', labelTr: 'İşyeri Sigortası', icon: '🏢' },
  nakliyat: { label: 'Transportation Insurance', labelTr: 'Nakliyat Sigortası', icon: '🚛' },
}
