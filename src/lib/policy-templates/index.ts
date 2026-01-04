/**
 * Policy Template Library
 * Best practices and knowledge base for insurance policies
 */

// Templates
export {
  HOME_TEMPLATES,
  KASKO_TEMPLATES,
  BUSINESS_TEMPLATES,
  HEALTH_TEMPLATES,
  ALL_TEMPLATES,
  getTemplatesByType,
  getTemplateById,
  getTemplatesByTier,
  getAllTemplates,
} from './templates'

// Knowledge Base
export {
  INSURANCE_TERMS,
  FAQ_ENTRIES,
  REGULATORY_REQUIREMENTS,
  MARKET_INSIGHTS,
  GLOBAL_BEST_PRACTICES,
  searchTerms,
  getTerm,
  searchFaqs,
  getFaqsByCategory,
  getRegulationsForPolicy,
  getRecentInsights,
  getActionableInsights,
} from './knowledge-base'

// Recommendations
export {
  findMatchingTemplates,
  analyzeTemplateGap,
  findBestTemplateForPolicy,
  searchTemplates,
  compareTemplates,
  getUpgradeRecommendation,
} from './recommendations'
