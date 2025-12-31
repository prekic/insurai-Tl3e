/**
 * Privacy Module
 * KVKK (Turkish) and GDPR compliant data protection utilities
 */

// Types
export type {
  LegalBasis,
  SpecialCategoryBasis,
  DataCategory,
  DataSensitivity,
  PersonalDataField,
  ConsentType,
  ConsentRecord,
  UserConsentStatus,
  ConsentRequirement,
  DataSubjectRight,
  DataSubjectRequest,
  DataSubjectResponse,
  ProcessingActivity,
  PrivacyImpactAssessment,
  BreachSeverity,
  DataBreach,
  RetentionPolicy,
  ScheduledDeletion,
  PrivacyConfig,
} from '@/types/privacy'

export {
  DEFAULT_PRIVACY_CONFIG,
  PERSONAL_DATA_FIELDS,
} from '@/types/privacy'

// Consent Management
export {
  consentManager,
  CONSENT_REQUIREMENTS,
  initializeConsentManager,
  recordConsent,
  hasConsent,
  checkRequiredConsents,
  getUserConsentStatus,
  getConsentRequirement,
  getAllConsentRequirements,
} from './consent-manager'

// Data Subject Rights
export {
  dataSubjectRightsManager,
  requestDataAccess,
  requestDataPortability,
  requestDataDeletion,
  processDataSubjectRequest,
  getUserDataRequests,
  exportUserData,
  deleteAllUserData,
} from './data-subject-rights'
