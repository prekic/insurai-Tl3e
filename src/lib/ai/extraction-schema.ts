import type { PolicyType } from '@/types/policy'

/**
 * Schema for AI-extracted policy data
 * This defines the structure that GPT-4 should return
 */
export interface ExtractedPolicyData {
  // Basic policy information
  policyNumber: string | null
  provider: string | null
  /** Insurer/Sigorta Sirketi Unvani (e.g. "ANADOLU ANONIM TURK SIGORTA SIRKETI") */
  insurer?: string | null
  policyType: PolicyType | null

  // Bundle detection — true when policy is a multi-product "Birleşik" / "Combined"
  // policy. Populated by the live AI prompt; consumed by PolicyOverviewCard to
  // render a Bundle badge + product list.
  isBundle?: boolean | null
  bundleProducts?: string[] | null

  /**
   * Sprint 3 PR-S3.2 — when the policy text indicates a renewal/transfer
   * from a different insurer (Turkish "yenilenmiştir" / "geçiş" / "devir",
   * English "renewed from" / "carry-over"), the previous insurer's name
   * (e.g. "Sompo Japan", "Aksigorta"). Drives the "preserved from <X>"
   * suffix on the NCD discount label and feeds generateInsurerTransferInsight().
   */
  previousInsurer?: string | null

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
  /** Net premium before tax (Net Prim) */
  premiumNet?: number | null
  /** Tax amount, usually BSMV (Banka ve Sigorta Muameleleri Vergisi) */
  premiumTax?: number | null

  // Entity Details
  insuredEntityType?: 'individual' | 'corporate' | null
  vehicleUsage?: 'private' | 'commercial' | null
  bağlıPolNo?: string | null

  // Coverage information
  sigortaBedeli?: number | null
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

  // Premium discounts (NCD / group / other) — Bug #9 (Apr 2026)
  // Set to null if no discount rows appear on the policy. Individual fields
  // are percent integers (e.g., 40 means 40%). `evidence` is a verbatim quote.
  discounts?: {
    ncdDiscount: number | null
    groupDiscount: number | null
    otherDiscountPct: number | null
    evidence: string | null
  } | null

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

  // Vehicle Details
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  vehiclePlate: string | null
  vin: string | null

  // Identity Details
  tcKimlik: string | null
  vkn: string | null

  // Fallback snake_case and localized keys the AI might return despite instructions
  policy_type?: string | null
  policy_number?: string | null
  start_date?: string | null
  end_date?: string | null
  insured_address?: string | null
  insured_name?: string | null
  insuredPerson?: string | null
  policyholder?: string | null
  sigortalı?: string | null
  sigortali?: string | null

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
  /** True if DAHİL (included), false if HARİÇ (excluded). Defaults to true if ambiguous. */
  included?: boolean
  /** Type of limit applied */
  limitType?: 'per_event' | 'aggregate' | 'combined' | null
  /** Source page where this limit was found */
  page?: number | null
  /** Section heading / clause where this was extracted */
  clause?: string | null
  /** Verbatim text describing this limit for audit/grounding */
  quote?: string | null
  /**
   * Optional carve-outs / specific-scenario exceptions that narrow this coverage.
   * Canonical case: `Artan Mali Sorumluluk Sınırsız` capped at 2.500.000 TL per
   * event at airports / ports / fuel depots / refineries. Populate from the
   * `...Klozu` / exception language in the policy text. Empty or undefined
   * means no carve-outs apply.
   */
  carveOuts?: string[] | null
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
   - ALL extracted text fields, property names, and coverage descriptions MUST remain in Turkish UNLESS explicitly asked for an English translation (e.g. in exclusionsEn or textEn). Do NOT use literal english placeholders or labels.

6b. **Entity and Vehicle Specifics** (CRITICAL):
   - 'tcKimlik' / 'vkn': TCKN (11 digits, usually starts with non-zero) means 'individual' (gerçek kişi). VKN (10 digits) means 'corporate' (tüzel kişi). Extract exactly.
   - 'insuredEntityType': If TCKN is present, use 'individual'. If VKN is present, use 'corporate'. If absent, use null.
   - 'vehicleUsage': Extract "KULLANIM TARZI". "Hususi" means 'private'. "Ticari", "Kamyonet", "Minibüs", "Kamyon" or others usually mean 'commercial'.
   - 'vehicleMake': Extract ONLY the vehicle brand/Make (e.g. VOLKSWAGEN). DO NOT include the model here.
   - 'vehicleModel': Extract the specific model and trim (e.g. TIGUAN 1.4 TSI ACT BMT 150 DSG HIGHLINE). Extract separately from Make.
   - 'vehicleYear': Extract the model year as a number (e.g. 2016).
   - 'discounts': Specifically check for Hasarsızlık İndirimi (NCD/No Claim Discount), group/profession discounts (meslek, grup), and cash discounts (peşin). Include the exact 'rate' (e.g. "%30") if found.

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

   **CRITICAL - Hidden Sub-Limits Behind "Unlimited" / "Included" Labels**:
   Turkish policies frequently use "Sınırsız" (Unlimited) or "Dahil" (Included) at the top level
   but bury actual caps in klozlar later in the document. You MUST:
   - Scan ALL kloz sections after the coverage summary table
   - Look for trigger terms like "olay başına azami", "yıllık azami", "toplam ... TL", "ile sınırlıdır",
     "sınırlanmıştır", "sub-limit", "per-event limit", "annual aggregate"
   - If a kloz references a named coverage and imposes a cap, add a 'carveOuts' entry to
     the coverage object
   - Example: Artan Mali Sorumluluk Sınırsız → has 2.500.000 TL per-event sub-limit
     for airports, harbors, fuel stations, refineries, etc.
   - Example: Hatalı Akaryakıt "Dahil" → actual per-event cap of 50.000 TL

   **CRITICAL - Payment Plan / monthly_premium Anti-Hallucination**:
   - "ÖDEME PLANI" section tells you the REAL payment structure
   - If you see a single payment (Peşin / Peşinat / Tek Çekim): DO NOT create a monthly_premium
   - Only create monthly_premium if the ODEME PLANI explicitly lists monthly taksit amounts
   - Never divide total premium by 12 to fabricate a monthly value
   - Populate paymentFrequency accurately: 'annual' for single payment, the actual frequency for installments

   **Coverage Categories**:
   - main: Primary coverage (vehicle value, property value, main insured amount)
   - liability: Mali Sorumluluk, third-party liability coverages
   - supplementary: Ek Teminatlar, additional protections (Cam, Hırsızlık, etc.)
   - assistance: Asistans, İkame Araç, roadside assistance
   - legal: Hukuki Koruma, legal protection
   - other: Everything else

   **CRITICAL - Coverage Deduplication**:
   Some coverages appear under slightly different names (e.g. "Personal Belongings" vs
   "Personal Effects in Vehicle"). If two coverage entries have the same limit and reference
   the same clause, merge them into one entry. Duplicates confuse users.

   **CRITICAL - Bundle Product Grouping**:
   For "Birleşik" (Combined) policies, the coverages table contains items from multiple
   insurance products (Kasko, Koltuk Ferdi Kaza, Artan Mali Sorumluluk, Hukuksal Koruma).
   When you encounter a Birlesik Kasko policy, set 'isBundle: true' and populate
   'bundleProducts' with the four product names. This allows the UI to group coverages
   by product for clarity.

   **Coverage Categories**:
   - main: Primary coverage (vehicle value, property value, main insured amount)
   - liability: Mali Sorumluluk, third-party liability coverages
   - supplementary: Ek Teminatlar, additional protections (Cam, Hırsızlık, etc.)
   - assistance: Asistans, İkame Araç, roadside assistance
   - legal: Hukuki Koruma, legal protection
   - other: Everything else

   **CRITICAL - Coverage Inclusion Status (DAHİL/HARİÇ)**:
   - Turkish policies often have a DAHİL (included) / HARİÇ (excluded) column in the teminat table
   - For EACH coverage: set included=true if DAHİL, included=false if HARİÇ
   - Include BOTH DAHİL and HARİÇ coverages in the coverages array — HARİÇ coverages are valuable for gap analysis
   - If no explicit DAHİL/HARİÇ column exists, set included=true for all coverages

   **CRITICAL - Commercial Vehicle Exclusions**:
   - Turkish kasko policies differentiate alcohol thresholds by vehicle type:
     - Hususi (private): 0.50 promil
     - Ticari (commercial): 0.00 promil (ANY detectable alcohol voids coverage, no causation required)
   - If you find an alcohol exclusion clause referencing "ticari" or "hususi", extract it as an exclusion with the specific promil threshold and vehicle type.

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

9. **CRITICAL - Evidence Extraction & Insights**:
   You MUST extract verbatim quotes from the document to support your insights and exclusions.
   - For every insight and exclusion generated, extract the exact original text from the document.
   - DO NOT paraphrase the quote. Copy it exactly as it appears in the text.
   - Populate the 'evidence.insights' and 'evidence.exclusions' arrays. Ensure the 'text' perfectly matches the generated insight or exclusion string, and the 'quote' is the verbatim evidence.

   **Specifically Flag These as Insights**:
   - **Parts Clause (Yedek Parça)**: If the policy dictates the use of non-OEM/equivalent parts ("eşdeğer", "yan sanayi", "çıkma", "logolu olmayan"), flag this as a risk insight! For example: "Eşdeğer/yan sanayi orijinal olmayan parça kullanımı şartı vardır."

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
    - Non-contracted service: "Anlaşmalı olmayan servislerde %15 tenzili muafiyet" OR "Repair at your choice of shop with 35% deductible". If the policy allows repair anywhere but applies a deductible/penalty OR restricts parts to 'eşdeğer/yan sanayi', THIS MUST BE EXTRACTED HERE AS A DEDUCTIBLE. Do NOT interpret it as fully covered at user choice.
    - Repair-conditional: "Onarım muafiyeti %5"
    - Partial-loss deductible: "Kısmi hasarlarda %2 muafiyet"
    - Total-loss deductible: "Pert halinde %10 tenzil"
    - Depreciation (Eskime Payı): If the policy caps depreciation (e.g., "Eskime payı azami %50 ile sınırlıdır" or "eskime payı uygulanır"), extract it explicitly here as a conditional deductible.
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

12. **Premium Discounts (NCD / Group / Other)**:
    Turkish policies typically show discount rows near the premium breakdown. Extract them into the 'discounts' object.
    - 'ncdDiscount': No-Claim Discount (Hasarsızlık İndirimi) — percent integer (e.g. 40 for 40%)
    - 'groupDiscount': Fleet/Group discount (Grup İndirimi / Filo İndirimi) — percent integer
    - 'otherDiscountPct': Any other named discount (Özel İndirim, Kampanya) — percent integer
    - 'evidence': Verbatim quote of the discount line as it appears. Do NOT paraphrase.
    Set the whole 'discounts' object to null ONLY if no discount rows appear on the policy.
    Use null for individual fields when that specific discount is absent.

13. **Vehicle Depreciation Clauses (Eskime Payı / Kıymet Artışı)**:
    Turkish kasko policies on older vehicles (model year >10yr) often apply
    age-based depreciation caps (e.g. "50% kıymet artışı" or "yaş endeksli eskime").
    Capture these as entries in 'conditionalDeductibles' with trigger describing
    the age condition (e.g. "vehicle age >10yr depreciation cap 50%").

14. **Replacement Parts Clauses (Eşdeğer / Çıkma Parça)**:
    If the policy restricts repair parts to 'eşdeğer' (equivalent/aftermarket) or
    'çıkma parça' (salvage), surface this as a special condition string verbatim so
    downstream logic can risk-flag older commercial vehicles.

15. **CRITICAL - Retrieval Grounding & Anti-Leakage (SEPARATION OF CONCERNS)**:
    - You must implement a strictly enforced separation between marketing brochure content (e.g. "Broşür", "Bilgilendirme Formu", "Özet", promotional text) and operative policy terms ("Poliçe", "Teminat Tablosu").
    - ONLY extract coverages and limits from the official policy terms and coverage tables. IGNORE marketing promises that are not bound in the official table.
    - If you are extracting a coverage, YOU MUST INCLUDE the 'page', 'clause', and verbatim 'quote' of the tabular row or clause where the limit is stated to ground the finding. Do NOT rely on ungrounded assumption.
    - NEVER combine per-event (olay başı) and annual aggregate (yıllık) limits. If the policy states "Per event: 40,000, annual aggregate: 80,000", capture the per-event limit in 'limit' and set 'limitType' to 'per_event', or describe both clearly. Never put the aggregate limit where the per-event limit is expected.
    - NEVER conflate separate coverages. (e.g., 'Anadolu Hizmet' and 'Kilit Mekanizmasının Değiştirilmesi' are separate coverages; do not combine their limits into one). Treat them as distinct items in the 'coverages' array.
    - 'Make' vs 'Model': Be hyper-vigilant! Tabular structures can confuse simpler tools. Under "Markasi" (Make) you might see "VOLKSWAGEN". Do not extract "Motor" or tabular header noise as the Make. Extract the actual car brand. Under "Tipi" (Model) you might see the specific trim. Extract them accurately separated.

Be thorough but accurate. It's better to return null than to guess incorrectly.`
