/**
 * Privacy Types
 * KVKK (Turkish) and GDPR compliant data protection types
 */

// =============================================================================
// Legal Bases for Processing
// =============================================================================

/**
 * Legal bases for processing personal data (GDPR Article 6, KVKK Article 5)
 */
export type LegalBasis =
  | 'consent'              // Explicit consent from data subject
  | 'contract'             // Necessary for contract performance
  | 'legal_obligation'     // Required by law
  | 'vital_interests'      // Protection of vital interests
  | 'public_task'          // Public interest or official authority
  | 'legitimate_interests' // Legitimate interests (with balancing test)

/**
 * Legal basis for special category data (GDPR Article 9, KVKK Article 6)
 */
export type SpecialCategoryBasis =
  | 'explicit_consent'
  | 'employment_law'
  | 'vital_interests'
  | 'public_health'
  | 'legal_claims'

// =============================================================================
// Data Categories
// =============================================================================

/**
 * Categories of personal data processed
 */
export type DataCategory =
  | 'identity'             // Name, ID numbers
  | 'contact'              // Email, phone, address
  | 'financial'            // Bank details, payment info
  | 'insurance'            // Policy details, claims
  | 'location'             // Addresses, GPS data
  | 'documents'            // Uploaded files
  | 'usage'                // App usage, preferences
  | 'technical'            // IP, device info, logs

/**
 * Data sensitivity levels
 */
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted'

/**
 * Personal data field metadata
 */
export interface PersonalDataField {
  fieldName: string
  category: DataCategory
  sensitivity: DataSensitivity
  legalBasis: LegalBasis
  retentionDays: number
  purpose: string
  purposeTr: string
}

// =============================================================================
// Consent Management
// =============================================================================

/**
 * Types of consent that can be collected
 */
export type ConsentType =
  | 'terms_of_service'           // ToS acceptance
  | 'privacy_policy'             // Privacy policy acknowledgment
  | 'data_processing'            // General data processing
  | 'marketing_email'            // Email marketing
  | 'marketing_sms'              // SMS marketing
  | 'analytics'                  // Usage analytics
  | 'ai_processing'              // AI/ML processing of documents
  | 'cross_border_transfer'      // Data transfer outside Turkey/EU
  | 'third_party_sharing'        // Sharing with partners
  | 'cookie_essential'           // Essential cookies
  | 'cookie_functional'          // Functional cookies
  | 'cookie_analytics'           // Analytics cookies
  | 'cookie_marketing'           // Marketing cookies

/**
 * Consent record
 */
export interface ConsentRecord {
  id: string
  userId: string
  type: ConsentType
  granted: boolean
  grantedAt: number
  revokedAt?: number
  version: string               // Version of the terms consented to
  ipHash?: string
  userAgent?: string
  source: 'web' | 'mobile' | 'api' | 'import'
  expiresAt?: number           // Some consents may expire
  metadata?: Record<string, unknown>
}

/**
 * Consent status for a user
 */
export interface UserConsentStatus {
  userId: string
  consents: Record<ConsentType, {
    granted: boolean
    grantedAt?: number
    version?: string
  }>
  lastUpdated: number
}

/**
 * Consent requirement definition
 */
export interface ConsentRequirement {
  type: ConsentType
  required: boolean            // Is this consent mandatory?
  category: DataCategory[]     // What data categories does this cover?
  purpose: string
  purposeTr: string
  legalBasis: LegalBasis
  version: string
  effectiveDate: string
}

// =============================================================================
// Data Subject Rights (GDPR Chapter 3, KVKK Article 11)
// =============================================================================

/**
 * Data subject right types
 */
export type DataSubjectRight =
  | 'access'                    // Right to access personal data
  | 'rectification'             // Right to correct inaccurate data
  | 'erasure'                   // Right to be forgotten
  | 'restriction'               // Right to restrict processing
  | 'portability'               // Right to data portability
  | 'objection'                 // Right to object to processing
  | 'withdraw_consent'          // Right to withdraw consent
  | 'complaint'                 // Right to lodge complaint with authority

/**
 * Data subject request
 */
export interface DataSubjectRequest {
  id: string
  userId: string
  email: string
  type: DataSubjectRight
  status: 'pending' | 'in_progress' | 'completed' | 'rejected'
  submittedAt: number
  acknowledgedAt?: number      // When we acknowledged receipt
  completedAt?: number
  deadline: number             // KVKK: 30 days, GDPR: 1 month
  reason?: string              // User's reason for request
  rejectionReason?: string     // Why request was rejected
  verificationMethod?: 'email' | 'id_verification' | 'in_person'
  verifiedAt?: number
  assignedTo?: string          // Staff member handling
  notes?: string
  attachments?: string[]       // Supporting documents
}

/**
 * Data subject request response
 */
export interface DataSubjectResponse {
  requestId: string
  type: DataSubjectRight
  status: 'completed' | 'rejected' | 'partial'
  responseDate: number
  data?: unknown               // For access/portability requests
  format?: 'json' | 'csv' | 'pdf'
  downloadUrl?: string
  expiresAt?: number           // Link expiration
  message?: string
  messageTr?: string
}

// =============================================================================
// Data Processing Records (GDPR Article 30)
// =============================================================================

/**
 * Record of processing activities
 */
export interface ProcessingActivity {
  id: string
  name: string
  nameTr: string
  description: string
  descriptionTr: string
  dataCategories: DataCategory[]
  dataSubjects: string[]       // Categories of people (users, employees, etc.)
  purposes: string[]
  legalBasis: LegalBasis
  recipients?: string[]        // Who data is shared with
  transfers?: {
    country: string
    safeguards: string         // SCCs, adequacy decision, etc.
  }[]
  retentionPeriod: string
  securityMeasures: string[]
  createdAt: number
  updatedAt: number
  responsiblePerson?: string
  dataProtectionOfficer?: string
}

// =============================================================================
// Privacy Impact Assessment (DPIA)
// =============================================================================

/**
 * Data Protection Impact Assessment
 */
export interface PrivacyImpactAssessment {
  id: string
  activityId: string           // Related processing activity
  assessedAt: number
  assessor: string

  // Necessity and proportionality
  necessity: {
    score: 1 | 2 | 3 | 4 | 5
    justification: string
  }

  // Risk assessment
  risks: {
    description: string
    likelihood: 'low' | 'medium' | 'high'
    impact: 'low' | 'medium' | 'high'
    mitigations: string[]
    residualRisk: 'low' | 'medium' | 'high'
  }[]

  // Overall assessment
  outcome: 'proceed' | 'mitigate' | 'consult_authority' | 'do_not_proceed'
  recommendations: string[]
  reviewDate: number
}

// =============================================================================
// Data Breach Management
// =============================================================================

/**
 * Data breach severity levels
 */
export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Data breach record
 */
export interface DataBreach {
  id: string
  discoveredAt: number
  occurredAt?: number
  reportedToAuthorityAt?: number
  reportedToSubjectsAt?: number

  // Description
  description: string
  dataCategories: DataCategory[]
  affectedRecords: number
  affectedSubjects: number

  // Assessment
  severity: BreachSeverity
  risks: string[]

  // Response
  containmentActions: string[]
  mitigationActions: string[]
  notificationRequired: boolean  // KVKK/GDPR: notify if high risk
  authorityReference?: string    // Reference from KVKK/supervisory authority

  // Status
  status: 'investigating' | 'contained' | 'resolved' | 'closed'
  resolvedAt?: number
  lessonsLearned?: string
}

// =============================================================================
// Retention and Deletion
// =============================================================================

/**
 * Data retention policy
 */
export interface RetentionPolicy {
  dataCategory: DataCategory
  retentionDays: number
  legalBasis: string
  deletionMethod: 'hard_delete' | 'anonymize' | 'archive'
  exceptions?: string[]
}

/**
 * Scheduled deletion record
 */
export interface ScheduledDeletion {
  id: string
  userId: string
  dataCategory: DataCategory
  reason: 'retention_expired' | 'user_request' | 'account_deleted'
  scheduledAt: number
  executeAt: number
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  completedAt?: number
  error?: string
}

// =============================================================================
// Compliance Configuration
// =============================================================================

/**
 * Privacy compliance configuration
 */
export interface PrivacyConfig {
  // Data controller info
  dataController: {
    name: string
    nameTr: string
    address: string
    email: string
    phone?: string
    kvkkRegistrationNumber?: string  // VERBIS registration
  }

  // Data Protection Officer (if required)
  dpo?: {
    name: string
    email: string
    phone?: string
  }

  // Regulatory settings
  applicableLaws: ('KVKK' | 'GDPR')[]
  supervisoryAuthority?: {
    name: string
    website: string
    complaintUrl: string
  }

  // Default retention periods
  defaultRetention: Record<DataCategory, number>

  // Request handling deadlines (in days)
  requestDeadlines: {
    acknowledgment: number    // When to acknowledge receipt
    completion: number        // When to complete request
  }

  // Breach notification deadlines (in hours)
  breachNotification: {
    authority: number         // Hours to notify authority (72 for GDPR)
    subjects: number          // Hours to notify affected individuals
  }
}

/**
 * Default privacy configuration for Turkish market
 */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  dataController: {
    name: 'InsurAI',
    nameTr: 'InsurAI',
    address: 'İstanbul, Türkiye',
    email: 'privacy@insurai.com',
  },
  applicableLaws: ['KVKK', 'GDPR'],
  supervisoryAuthority: {
    name: 'Kişisel Verileri Koruma Kurumu (KVKK)',
    website: 'https://www.kvkk.gov.tr',
    complaintUrl: 'https://www.kvkk.gov.tr/Icerik/5378/Sikayetler',
  },
  defaultRetention: {
    identity: 365 * 6,        // 6 years (commercial records)
    contact: 365 * 6,
    financial: 365 * 10,      // 10 years (tax requirements)
    insurance: 365 * 10,
    location: 365,            // 1 year
    documents: 365 * 6,
    usage: 365 * 2,           // 2 years
    technical: 90,            // 90 days
  },
  requestDeadlines: {
    acknowledgment: 3,        // 3 days
    completion: 30,           // 30 days (KVKK requirement)
  },
  breachNotification: {
    authority: 72,            // 72 hours
    subjects: 72,             // 72 hours if high risk
  },
}

// =============================================================================
// Personal Data Fields Mapping
// =============================================================================

/**
 * Mapping of application fields to personal data metadata
 */
export const PERSONAL_DATA_FIELDS: PersonalDataField[] = [
  // User identity
  {
    fieldName: 'email',
    category: 'contact',
    sensitivity: 'confidential',
    legalBasis: 'contract',
    retentionDays: 365 * 6,
    purpose: 'User authentication and communication',
    purposeTr: 'Kullanıcı doğrulama ve iletişim',
  },
  // Policy data
  {
    fieldName: 'insuredPerson',
    category: 'identity',
    sensitivity: 'confidential',
    legalBasis: 'contract',
    retentionDays: 365 * 10,
    purpose: 'Insurance policy management',
    purposeTr: 'Sigorta poliçesi yönetimi',
  },
  {
    fieldName: 'insuredAddress',
    category: 'location',
    sensitivity: 'confidential',
    legalBasis: 'contract',
    retentionDays: 365 * 10,
    purpose: 'Risk assessment and policy management',
    purposeTr: 'Risk değerlendirmesi ve poliçe yönetimi',
  },
  {
    fieldName: 'policyNumber',
    category: 'insurance',
    sensitivity: 'confidential',
    legalBasis: 'contract',
    retentionDays: 365 * 10,
    purpose: 'Policy identification and tracking',
    purposeTr: 'Poliçe tanımlama ve takibi',
  },
  // Document data
  {
    fieldName: 'documentUrl',
    category: 'documents',
    sensitivity: 'restricted',
    legalBasis: 'consent',
    retentionDays: 365 * 6,
    purpose: 'Document storage for policy analysis',
    purposeTr: 'Poliçe analizi için doküman saklama',
  },
  // Technical data
  {
    fieldName: 'ipHash',
    category: 'technical',
    sensitivity: 'internal',
    legalBasis: 'legitimate_interests',
    retentionDays: 90,
    purpose: 'Security and fraud prevention',
    purposeTr: 'Güvenlik ve dolandırıcılık önleme',
  },
  {
    fieldName: 'userAgent',
    category: 'technical',
    sensitivity: 'internal',
    legalBasis: 'legitimate_interests',
    retentionDays: 90,
    purpose: 'Technical support and compatibility',
    purposeTr: 'Teknik destek ve uyumluluk',
  },
]
