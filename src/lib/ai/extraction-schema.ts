import type { PolicyType } from '@/types/policy'

/**
 * Schema for AI-extracted policy data
 * This defines the structure that GPT-4 should return
 */
export interface ExtractedPolicyData {
  // Basic policy information
  policyNumber: string | null
  provider: string | null
  policyType: PolicyType | null

  // Policyholder information
  insuredName: string | null
  insuredAddress: string | null

  // Dates
  startDate: string | null // ISO date string
  endDate: string | null // ISO date string

  // Financial details
  premium: number | null
  currency: string | null
  paymentFrequency: 'annual' | 'semi-annual' | 'quarterly' | 'monthly' | null

  // Coverage information
  coverages: ExtractedCoverage[]

  // Special conditions and exclusions
  specialConditions: string[]
  exclusions: string[]
  exclusionsEn?: string[] | null

  // Structured conditional deductibles (NEW)
  // Turkish KASKO policies routinely apply percentage-based or scenario-triggered
  // deductibles (muafiyet / tenzili muafiyet). This optional field surfaces them
  // directly from the LLM with verbatim evidence. When present, it takes precedence
  // over post-hoc classification via classifyExclusions() in policy-extractor.ts.
  conditionalDeductibles?: Array<{
    trigger: string // e.g., "driver under 26", "license < 3 years", "non-contracted service"
    rate: string // e.g., "%35", "20%", "5000 TL"
    evidence: string // verbatim quote from policy text
  }> | null

  // Amendment/Zeyilname detection (NEW)
  // Turkish insurance amendments have specific markers that distinguish them from original policies
  amendmentInfo: {
    isAmendment: boolean // true if document contains "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", or similar markers
    amendmentNumber: string | null // e.g., "1/2024", "2/2024" - extracted from "NO: N/YYYY" or "Değişiklik No: N"
    amendmentDate: string | null // Effective date of amendment (Geçerlilik Tarihi) in YYYY-MM-DD
    basePolicyNumber: string | null // Original policy number this amends (Ana Poliçe No)
    amendmentReason: string | null // e.g., "Sigortalı Talebi", "Prim Farkı", "Teminat Eklenmesi"
    premiumDifference: number | null // Premium change amount (can be negative for refunds)
  }

  // Evidence for AI-extracted insights and exclusions
  evidence?: {
    insights: Array<{ text: string; textEn: string; quote: string }>
    exclusions: Array<{ text: string; textEn: string; quote: string }>
  }

  // Graph of relationships between coverages/clauses
  clauseGraph?: {
    edges: Array<{
      sourceId: string
      targetId: string | null
      relationshipType:
        | 'coverage_inclusion'
        | 'conditional_restriction'
        | 'deductible_trigger'
        | 'sublimit'
        | 'carve_out'
        | 'endorsement_override'
        | 'service_benefit_linkage'
      description?: string | null
      isCandidate: boolean
    }>
  }

  // Confidence scores for each field
  confidence: {
    overall: number
    policyNumber: number
    provider: number
    dates: number
    premium: number
    coverages: number
  }

  // Proxy metadata (set by provider, consumed by policy-extractor for logging)
  _proxyMeta?: {
    requestId?: string
    route?: string
    provider?: string
    fallback?: boolean
    fallbackReason?: string
    fallbackChain?: Array<{
      provider: string
      success: boolean
      duration_ms?: number
      error?: string
      error_code?: string
    }>
    /** Server-side phase timing breakdown (ms) */
    serverPhaseTiming?: Record<string, number>
    /** Total server-side elapsed time (ms) */
    serverElapsedMs?: number
  }
}

export interface ExtractedCoverage {
  name: string
  /** Turkish name for the coverage (AI-provided or mapped at extraction time) */
  nameTr?: string | null
  limit: number | null
  deductible: number | null
  description?: string | null
  /** True if coverage shows "Sınırsız" (unlimited) */
  isUnlimited?: boolean
  /** True if limit is "Rayiç Değer" (market value) */
  isMarketValue?: boolean
  /** Coverage category: main, liability, supplementary, assistance, legal, other */
  category?: 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'
}

// Re-export the canonical schema from the shared single source of truth.
// This preserves all existing imports from '@/lib/ai/extraction-schema'.
export { EXTRACTION_JSON_SCHEMA } from '../../../shared/extraction-schema'

/**
 * System prompt for policy extraction
 * Optimized for Turkish insurance documents
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance document analyst specializing in Turkish insurance policies.

Your task is to extract structured information from insurance policy documents.

## Guidelines:

1. **Language**: Documents may be in Turkish or English. Common Turkish terms:
   - Poliçe = Policy
   - Sigortalı = Insured
   - Sigorta Ettiren = Policyholder
   - Prim = Premium
   - Teminat = Coverage
   - Muafiyet = Deductible
   - Başlangıç Tarihi = Start Date
   - Bitiş Tarihi = End Date

2. **Policy Types**:
   - kasko = Comprehensive auto insurance
   - traffic = Mandatory traffic/liability insurance
   - home = Home/property insurance (Konut)
   - health = Health insurance (Sağlık)
   - life = Life insurance (Hayat)
   - dask = Earthquake insurance (mandatory)
   - business = Commercial/business insurance
   - nakliyat = Transportation/Cargo insurance (Nakliyat/Emtia)

3. **Date Format**: Always convert dates to YYYY-MM-DD format

4. **Currency Detection** (CRITICAL):
   - Look carefully at the currency symbols and text near monetary values
   - Most Turkish policies use TRY (Turkish Lira):
     - Indicators: ₺, TL, TRY, "Türk Lirası", "-TL", "TL."
   - Common foreign currencies in Turkish policies:
     - USD: $, USD, "Amerikan Doları", "ABD Doları", "Dolar"
     - EUR: €, EUR, "Euro", "Avro"
     - GBP: £, GBP, "Sterlin", "İngiliz Sterlini"
   - Other worldwide currencies (use 3-letter ISO code):
     - JPY/CNY: ¥, Yen, Yuan, Renminbi
     - CHF: CHF, "İsviçre Frangı", Swiss Franc
     - AED: د.إ, AED, Dirham
     - SAR: ﷼, SAR, Riyal
     - INR: ₹, INR, Rupee
     - AUD: A$, AUD, Australian Dollar
     - CAD: C$, CAD, Canadian Dollar
     - SEK/NOK/DKK: kr, Krone/Krona
     - PLN: zł, PLN, Zloty
     - RUB: ₽, RUB, Ruble
     - KRW: ₩, KRW, Won
     - BRL: R$, BRL, Real
     - MXN: MX$, MXN, Peso
     - ZAR: R, ZAR, Rand
     - SGD: S$, SGD, Singapore Dollar
     - HKD: HK$, HKD, Hong Kong Dollar
   - Check the currency near:
     - Premium amount (Prim)
     - Coverage limits (Teminat Limiti)
     - Sum insured (Sigorta Bedeli)
   - If mixed currencies: use the currency of the main coverage/premium
   - If no currency indicator is found, YOU MUST RETURN null. DO NOT guess or default to TRY.
   - ALWAYS return the 3-letter ISO currency code (e.g., TRY, USD, EUR) if found.

5. **Confidence Scores**: Rate your confidence (0-1) based on:
   - Clarity of the source text
   - Whether the information was explicitly stated vs inferred
   - Consistency of information across the document

6. **Missing Information & Anti-Hallucination** (CRITICAL):
   - ONLY extract values explicitly stated in the document.
   - DO NOT hallucinate, guess, or assume values.
   - If a field (e.g. deductible, premium, limits, dates) is not explicitly found, you MUST return null.
   - It is far better to return null than to extract an incorrect value.

7. **Coverages**: List all coverage items found, including:
   - Main coverage (Ana Teminat)
   - Additional coverages (Ek Teminatlar)
   - Optional protections

   **Coverage Names (name + nameTr)**:
   - name: Always provide the English coverage name (e.g., "Collision", "Theft", "Fire")
   - nameTr: For Turkish policies, provide the original Turkish name from the document (e.g., "Çarpma/Çarpışma", "Hırsızlık", "Yangın"). For non-Turkish policies, set to null.
   - Common Turkish coverage names: Çarpma/Çarpışma (Collision), Hırsızlık (Theft), Yangın (Fire), Doğal Afetler (Natural Disasters), Cam Kırılması (Glass), Ferdi Kaza (Personal Accident), Yol Yardım (Roadside Assistance), İkame Araç (Replacement Vehicle), Mali Sorumluluk (Liability), Manevi Tazminat (Moral Damages)

   **CRITICAL - Special Coverage Values**:
   - "Sınırsız" (Unlimited): Set isUnlimited=true and limit=null
   - "Rayiç Değer" (Market Value): Set isMarketValue=true and limit=null. This is the vehicle's current market value for kasko policies.
   - For kasko policies: The main coverage is usually "Rayiç Değer" for the vehicle itself

   **Coverage Categories**:
   - main: Primary coverage (vehicle value, property value, main insured amount)
   - liability: Mali Sorumluluk, third-party liability coverages
   - supplementary: Ek Teminatlar, additional protections (Cam, Hırsızlık, etc.)
   - assistance: Asistans, İkame Araç, roadside assistance
   - legal: Hukuki Koruma, legal protection
   - other: Everything else

8. **CRITICAL - Amendment/Zeyilname Detection**:
   IMPORTANT: Determine if this document is an ORIGINAL POLICY or an AMENDMENT (Zeyilname).

   An AMENDMENT (Zeyilname) document will have ONE OR MORE of these markers:
   - Header containing: "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", "ENDORSEMENT", "POLİÇE TADİLATI"
   - Amendment number: "NO: N/YYYY", "Değişiklik No: N", "Zeyilname No: N"
   - Reference text: "Ana Poliçe No:", "Esas Poliçe:", "Base Policy:"
   - Change reason: "Değişiklik Nedeni:", "Reason for Amendment:"
   - Premium difference: "Prim Farkı:", "Premium Adjustment:"

   For amendmentInfo:
   - isAmendment: Set to TRUE only if you find explicit amendment markers above
   - isAmendment: Set to FALSE for original policy documents (most documents)
   - amendmentNumber: Extract from "NO: 1/2024" or "Değişiklik No: 1" format
   - amendmentDate: The effective date of the amendment (Geçerlilik Tarihi)
   - basePolicyNumber: The original policy being amended (may be same as policyNumber)
   - amendmentReason: e.g., "Sigortalı Talebi", "Teminat Eklenmesi", "Prim Düzeltmesi"
   - premiumDifference: Amount added/subtracted from premium (can be negative)

   If NO amendment markers are found, set isAmendment to false and all other amendmentInfo fields to null.

9. **CRITICAL - Evidence Extraction**:
   You MUST extract verbatim quotes from the document to support your insights and exclusions.
   - For every insight and exclusion generated, extract the exact original text from the document.
   - DO NOT paraphrase the quote. Copy it exactly as it appears in the text.
   - Populate the 'evidence.insights' and 'evidence.exclusions' arrays. Ensure the 'text' perfectly matches the generated insight or exclusion string, and the 'quote' is the verbatim evidence.

10. **CRITICAL - Clause Graph & Relationships**:
    You MUST identify relationships and overrides between different clauses or coverages.
    - Create a 'clauseGraph.edges' array connecting related items.
    - 'sourceId': The name of the primary coverage/clause.
    - 'targetId': What it affects (can be null if ambiguous).
    - 'relationshipType': Must be one of coverage_inclusion, conditional_restriction, deductible_trigger, sublimit, carve_out, endorsement_override, service_benefit_linkage.
    - 'isCandidate': Set to true ONLY if you are unsure of the relationship or if it is ambiguous.

11. **CRITICAL - Structured Conditional Deductibles**:
    Turkish KASKO policies routinely apply scenario-triggered or percentage-based deductibles beyond the simple flat 'deductible' on individual coverages. You MUST enumerate every one of them in the dedicated 'conditionalDeductibles' array — NOT in 'exclusions'.

    **What counts as a conditional deductible (goes in conditionalDeductibles):**
    - Age-based: "Sürücü yaşı 25'ten küçük ise %20 tenzili muafiyet uygulanır"
    - License-tenure-based: "Ehliyetin 3 yıldan az olması durumunda %30 muafiyet"
    - Non-contracted service: "Anlaşmalı olmayan servislerde %15 tenzili muafiyet"
    - Repair-conditional: "Onarım muafiyeti %5"
    - Partial-loss deductible: "Kısmi hasarlarda %2 muafiyet"
    - Total-loss deductible: "Pert halinde %10 tenzil"
    - Any "tenzili muafiyet" or "muafiyet" with an explicit trigger condition

    **What does NOT go in conditionalDeductibles (use 'exclusions' instead):**
    - "Savaş hali hariçtir" — non-coverage exclusion, goes in exclusions
    - "Deprem teminat dışıdır" — non-coverage exclusion (if truly excluded, not just deductible-adjusted)
    - Any clause that removes coverage entirely rather than applying a deductible

    **Format requirements for each entry:**
    - 'trigger': A short natural-language description of the condition (e.g., "driver under 26", "license tenure < 3 years", "non-contracted service")
    - 'rate': The deductible as written in the source (e.g., "%35", "20%", "5000 TL")
    - 'evidence': A verbatim direct quote from the policy text. DO NOT paraphrase. Copy exactly.

    If NO conditional deductibles are present, return an empty array or null. Do NOT fabricate.

Be thorough but accurate. It's better to return null than to guess incorrectly.`
