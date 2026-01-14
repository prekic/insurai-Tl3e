export type PolicyType = 'kasko' | 'traffic' | 'home' | 'health' | 'life' | 'dask' | 'business' | 'nakliyat'

export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'pending'

/** Coverage category for organization */
export type CoverageCategory = 'main' | 'liability' | 'personal_accident' | 'supplementary' | 'assistance' | 'legal' | 'other'

/** Coverage importance for visual display */
export type CoverageImportance = 'critical' | 'standard' | 'minor'

/** Vehicle information for kasko policies */
export interface VehicleInfo {
  plate?: string          // e.g., "34 RZ 9511"
  make?: string           // e.g., "Ford"
  model?: string          // e.g., "Transit Custom"
  year?: number           // e.g., 2023
  engineNo?: string       // Motor no
  chassisNo?: string      // Şasi no
  color?: string          // Renk
  usage?: string          // Kullanım şekli (Hususi/Ticari)
  vehicleClass?: string   // Araç sınıfı (Binek/Kamyonet/TIR)
  fuelType?: string       // Yakıt tipi (Benzin/Dizel/LPG/Elektrik)
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
  provider: string
  logo: string
  type: PolicyType
  typeTr: string
  coverage: number
  premium: number
  monthlyPremium: number
  deductible: number
  startDate: string
  expiryDate: string
  status: PolicyStatus
  uploadDate: string
  createdAt?: string // ISO timestamp for tracking when policy was added to system
  fileName: string
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
  specialConditions: string[]
  insuranceLine: string
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
