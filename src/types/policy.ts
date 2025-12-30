export type PolicyType = 'kasko' | 'traffic' | 'home' | 'health' | 'life' | 'dask' | 'business'

export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'pending'

export interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  description?: string
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
}

export const POLICY_TYPES: Record<PolicyType, { label: string; labelTr: string; icon: string }> = {
  kasko: { label: 'Comprehensive Auto', labelTr: 'Kasko', icon: '🚗' },
  traffic: { label: 'Traffic Liability', labelTr: 'Trafik Sigortası', icon: '🚦' },
  home: { label: 'Home Insurance', labelTr: 'Konut Sigortası', icon: '🏠' },
  health: { label: 'Health Insurance', labelTr: 'Sağlık Sigortası', icon: '🏥' },
  life: { label: 'Life Insurance', labelTr: 'Hayat Sigortası', icon: '💗' },
  dask: { label: 'Earthquake Insurance', labelTr: 'DASK', icon: '🏗️' },
  business: { label: 'Business Insurance', labelTr: 'İşyeri Sigortası', icon: '🏢' },
}
