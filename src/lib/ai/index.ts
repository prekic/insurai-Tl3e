// AI extraction service for InsurAI
// Provides PDF parsing and OpenAI-powered policy extraction

export { isAIConfigured, AI_CONFIG } from './config'
export { extractTextFromPDF, isPDFFile, type PDFParseResult, type PDFParseError } from './pdf-parser'
export {
  type ExtractedPolicyData,
  type ExtractedCoverage,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
} from './extraction-schema'
export {
  extractPolicyFromDocument,
  type ExtractionResult,
  type ExtractionError,
  type ExtractionResponse,
} from './policy-extractor'
