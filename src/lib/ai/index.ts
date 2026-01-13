// AI extraction service for InsurAI
// Provides PDF parsing, multi-model AI extraction, OCR, and policy comparison

// Configuration
export {
  isAIConfigured,
  isProviderConfigured,
  isOCRConfigured,
  getConfiguredProviders,
  AI_CONFIG,
  type AIProvider,
} from './config'

// PDF parsing (with lazy loading and retry logic)
export { extractTextFromPDF, extractTextFromPDFWithRetry, isPDFFile, preloadPdfJs, type PDFParseResult, type PDFParseError } from './pdf-parser'

// Extraction schema
export {
  type ExtractedPolicyData,
  type ExtractedCoverage,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
} from './extraction-schema'

// Main extraction
export {
  extractPolicyFromDocument,
  type ExtractionResult,
  type ExtractionError,
  type ExtractionResponse,
  type ExtractionOptions,
} from './policy-extractor'

// Multi-provider extraction
export { extractWithOpenAI } from './providers/openai'
export { extractWithClaude } from './providers/claude'
export { extractWithConsensus, type ConsensusResult, type ProviderResult } from './providers/consensus'

// OCR for scanned documents
export {
  performOCR,
  performMultiPageOCR,
  isLikelyScannedPDF,
  type OCRResult,
  type OCRError,
} from './ocr'

// Policy comparison
export {
  comparePolicies,
  generateComparisonReport,
  type PolicyComparisonResult,
  type ComparisonSummary,
  type ComparisonDifference,
} from './comparison'

// Response caching
export {
  aiCache,
  hashContent,
  hashFile,
  generateCacheKey,
  type CacheConfig,
  type CacheStats,
  type CacheType,
} from './cache'

// Cost tracking
export {
  costTracker,
  trackAIUsage,
  getUsageStats,
  getBudgetStatus,
  checkBudgetLimit,
  getCostByModel,
  setMonthlyBudget,
  initializeCostTracking,
  formatCost,
  formatTokens,
  calculateCost,
  estimateTokens,
  MODEL_PRICING,
  type UsageRecord,
  type UsageStats,
  type CostBudget,
} from './cost-tracking'
