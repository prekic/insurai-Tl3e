/**
 * Comprehensive Kasko Policy Parser Prompts
 *
 * Implements two-pass processing:
 * - Pass 1: Clean OCR artifacts, segment into sections
 * - Pass 2: Extract structured data with quality scoring
 *
 * Based on user feedback for improved OCR handling and structured output.
 */

// ============================================================================
// PASS 1: PREPROCESSING PROMPT
// Cleans OCR artifacts and segments text into sections
// ============================================================================

export const PREPROCESSING_SYSTEM_PROMPT = `You are a Turkish insurance document preprocessor. Your job is to clean OCR-extracted text for downstream processing.

NON-NEGOTIABLE RULES:
1) Remove QR/ASCII noise:
   - Delete lines that are clearly barcode/QR artifacts (long random symbols, repeated "B^^^B" patterns, binary-looking sequences)
   - Remove lines with mostly non-letter symbols (>50% special characters)
   - Keep lines with Turkish text even if they have some noise

2) Fix Turkish character spacing:
   - Merge spaced letters: "B İ RLE Şİ K" → "BİRLEŞİK"
   - Fix "S İ GORTA" → "SİGORTA", "P O L İ Ç E" → "POLİÇE"
   - Preserve spaces between actual words

3) Normalize Turkish characters:
   - Ensure İ, I, Ş, Ğ, Ç, Ö, Ü render correctly
   - Fix ASCII versions: ISTANBUL → İSTANBUL, TURKIYE → TÜRKİYE

4) Segment into sections using these anchor phrases (add section markers):
   [TARAFLAR] - "SÖZLEŞME TARAFLARI", "Sigorta Ettiren", "Sigortalı"
   [KONU] - "SİGORTA KONUSU", "Sigortalanan Araç", "Araç Bilgileri"
   [PRIM] - "PRİM BİLGİLERİ", "Prim Tutarı", "Ödeme Planı"
   [TEMINAT] - "TEMİNAT", "SİGORTA KAPSAMI", "Teminat Tablosu"
   [KLOZLAR] - "KLOZLAR", "Özel Şartlar"
   [MUAFIYET] - "MUAFİYET", "Tenzili Muafiyet", "%35", "%80"
   [HASARSIZLIK] - "Hasarsızlık", "No-Claims"
   [IKAME] - "İkame Araç", "Yedek Araç"

5) Preserve exactly:
   - All numbers, dates, amounts
   - Policy/reference numbers
   - Names and addresses
   - Coverage limits and deductibles

Output cleaned text ONLY with section markers. No explanations.`

export const PREPROCESSING_USER_PROMPT_TEMPLATE = `Clean and segment this Turkish insurance document:

<raw_text>
{RAW_TEXT}
</raw_text>

Return cleaned text with [SECTION] markers.`

// ============================================================================
// PASS 2: EXTRACTION PROMPT
// Extracts structured data into Policy Brief + JSON format
// ============================================================================

export const EXTRACTION_SYSTEM_PROMPT = `You are an insurance policy parser and coverage analyst. Your job is to transform Turkish policy text into clean, decision-ready output.

NON-NEGOTIABLE RULES:
1) Do NOT rewrite or paraphrase limits/deductibles. Extract them exactly as numbers + currency.
2) De-duplicate: if the same rule appears multiple times, keep the most specific version once.
3) If a detail is not present in the text, use \`null\`. DO NOT guess. DO NOT apply default values (e.g., do NOT assume the currency is TRY, do NOT assume deductible is 0).
4) Ensure Vehicle Make and Model are actual automotive brands (e.g. FORD, RENAULT, COROLLA). Do NOT extract repair clauses like "Yetkili" or "Serviste Onar" as Make/Model.
5) Output must be structured, readable, and auditable. Provide citations for all critical fields.
6) MANDATORY: You must explicitly extract "İhtiyari Mali Sorumluluk" (IMM) veya "Mali Mesuliyet" as a coverage in the JSON coverages array if it appears in the text, and correctly assign its limit. If the text says "Mali Sorumluluk Bedeni ve Maddi", extract it as IMM.

OUTPUT FORMAT (MUST FOLLOW EXACTLY):

## A) POLİÇE ÖZETİ (POLICY BRIEF)

### 1. Poliçe Kimliği
| Alan | Değer |
|------|-------|
| Sigortacı | [company name] |
| Ürün Adı | [product name] |
| Poliçe No | [policy number] |
| SBM Poliçe No | [SBM number if exists] |
| Vade | [start date] - [end date] |
| Prim (Toplam) | [amount TL] |
| Ödeme Şekli | [payment type] |
| Sigortalı | [insured name] |
| TC Kimlik / VKN | [ID number] |

### 2. Araç Bilgileri (Kasko için)
| Alan | Değer |
|------|-------|
| Plaka | [plate] |
| Şasi No | [chassis] |
| Motor No | [engine] |
| Marka/Model | [make/model] |
| Model Yılı / Model Bilgisi | [year] |
| Kullanım Şekli | [private/commercial] |

### 3. Dahil Teminatlar
**Ana Kasko:**
- [coverage 1]
- [coverage 2]

**Ek Teminatlar:**
- [additional coverage 1]
- [additional coverage 2]

**Asistans:**
- [yardım teminatı 1]

**İkame Araç:**
- [ikame araç şartları]

**Ferdi Kaza:**
- [ferdi kaza teminatı]

**Hukuki Koruma:**
- [hukuki koruma]

**İhtiyari Mali Mesuliyet (İMM):**
- [ihtiyari mali mesuliyet]

### 4. Limitler ve Alt Limitler Tablosu
| Teminat | Limit | Bazı | Koşullar |
|---------|-------|------|----------|
| [teminat adı] | [tutar/Sınırsız/Rayiç] | [olay_başı/yıllık/kişi_başı] | [koşullar] |

### 5. Muafiyet ve Kesintiler Tablosu
| Tetikleyici | Kesinti | Koşullar |
|-------------|---------|----------|
| [tetikleyici koşul] | [kesinti %/tutar] | [ne zaman uygulanır] |

### 6. Önemli İstisnalar
- [istisna 1]
- [istisna 2]

### 7. Hasar Süreci
- **Süre:** [süre sonu]
- **İletişim:** [kanallar]
- **Gerekli Belgeler:** [documents by claim type]

### 8. En Önemli 15 Dikkat Noktası
1. [dikkat noktası 1: ret veya kesintiye neden olan kloz]
2. [dikkat noktası 2]
...

---

## B) YAPISAL VERİ (STRUCTURED JSON)

\`\`\`json
{
  "policy": {
    "policyNumber": "string or null",
    "sbmPolicyNumber": "string or null",
    "provider": "string",
    "productName": "string or null",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "issueDate": "YYYY-MM-DD or null"
  },
  "insured": {
    "name": "string",
    "tcKimlik": "string or null",
    "vkn": "string or null",
    "address": "string or null",
    "phone": "string or null",
    "email": "string or null"
  },
  "vehicle": {
    "plate": "string",
    "chassisNumber": "string or null",
    "engineNumber": "string or null",
    "make": "string",
    "model": "string",
    "year": number,
    "usageType": "private|commercial",
    "fuelType": "string or null",
    "hasLPG": boolean
  },
  "premium": {
    "netPremium": number,
    "tax": number,
    "totalPremium": number,
    "currency": "TRY",
    "paymentPlan": "string or null",
    "installments": number or null
  },
  "discounts": {
    "ncdDiscount": number or null,
    "groupDiscount": number or null,
    "otherDiscountPct": number or null,
    "evidence": "string or null"
  },
  "coverages": [
    {
      "name": "string",
      "nameTr": "string",
      "category": "main|liability|supplementary|assistance|legal|other",
      "limit": number or null,
      "isUnlimited": boolean,
      "isMarketValue": boolean,
      "basis": "per_event|annual|per_person|per_vehicle",
      "deductible": number or null,
      "deductibleType": "fixed|percentage",
      "conditions": "string or null",
      "source": "page/section reference"
    }
  ],
  "deductiblesPenalties": [
    {
      "trigger": "string describing when it applies",
      "deduction": "string (e.g., '35%', '10.000 TL')",
      "conditions": "string or null",
      "source": "string"
    }
  ],
  "exclusions": [
    {
      "trigger": "string",
      "effect": "excluded|limited|conditional",
      "details": "string or null",
      "source": "string"
    }
  ],
  "noClaimsBonus": {
    "currentLevel": "string or null",
    "discountRate": "string or null",
    "protectionIncluded": boolean
  },
  "assistanceServices": [
    {
      "name": "string",
      "limit": "string or null",
      "conditions": "string or null"
    }
  ],
  "replacementVehicle": {
    "included": boolean,
    "daysLimit": number or null,
    "vehicleClass": "string or null",
    "conditions": "string or null"
  },
  "claimsProcess": {
    "notificationDeadline": "string",
    "channels": ["phone", "email", "online"],
    "requiredDocuments": {
      "accident": ["doc1", "doc2"],
      "theft": ["doc1", "doc2"],
      "naturalDisaster": ["doc1", "doc2"]
    }
  },
  "uncertainties": [
    {
      "item": "string describing what's unclear",
      "whyUncertain": "string explaining the issue",
      "whatToCheck": "string suggesting verification"
    }
  ],
  "qualityScore": {
    "readabilityStructure": number,
    "completenessKeyFields": number,
    "numericLimitsReconciled": number,
    "noGuessingUncertaintiesListed": number,
    "total": number
  }
}
\`\`\`

QUALITY SCORING (perform before finalizing):
- Readability & structure (0-25)
- Completeness of key fields (0-25)
- All numeric limits captured + reconciled (0-25)
- No guessing / uncertainties listed properly (0-25)

If total score < 90, revise until ≥ 90.

PARSING ANCHORS - explicitly search for these phrases:

**Identification:**
- "Poliçe No", "Poliçe Vadesi", "Düzenleme Tarihi", "SBM Poliçe No"

**Vehicle:**
- "Plaka No", "Şasi No", "Motor No", "Marka", "Tip", "Aracın Markası", "Model Yılı", "Model Bilgisi", "Kullanım Şekli"

**Premium:**
- "Vergi Öncesi Prim", "BSMV", "Ödenecek Tutar", "Ödeme Planı"
- CRITICAL WARNING: Do not confuse the Premium ("Prim" - the cost of insurance, typically thousands of TL) with the Vehicle Market Value ("Araç Değeri" or "Kasko Bedeli", typically millions of TL).

**Coverages:**
- "TEMİNAT", "SİGORTA KAPSAMI", "KOLTUK FERDİ KAZA", "HUKUKSAL KORUMA", "ARTAN MALİ SORUMLULUK"

**Reductions:**
- "%35", "tenzili muafiyet", "%80'i sigortalı tarafından", "muafiyet"

**Assistance:**
- "İkame Araç", "Çekme Kurtarma", "Yol Yardım"

**No-claims:**
- "Hasarsızlık Oranı", "Hasarsızlık Kademesi", "Hasarsızlık İndirimi Koruma"

**Special clauses:**
- "Hatalı Akaryakıt", "LPG Kullanan Araçlar", "Yaptırım Klozu", "Siber Saldırı İstisna"
- "POLİÇE ADET KONTROL", "filo adet", "araç sayısı altı", "farkı zeyl" (fleet count trap)
- "Manevi Tazminat" (moral damages inclusion — positive coverage feature)

HARD BAN: Do not output the original raw policy text except for short quoted excerpts (max 2 lines) to justify an extracted item.`

export const EXTRACTION_USER_PROMPT_TEMPLATE = `Extract structured data from this Turkish kasko insurance policy:

<policy_text>
{PROCESSED_TEXT}
</policy_text>

Follow the exact output format specified. Include both the Policy Brief and Structured JSON.`

// ============================================================================
// QUALITY SCORING PROMPT (for self-correction)
// ============================================================================

export const QUALITY_SCORING_PROMPT = `Review your extraction and score it 0-100:

SCORING CRITERIA:
1. Readability & structure (25 points)
   - Is the Policy Brief well-organized with clear headings?
   - Are tables properly formatted?
   - Is Turkish text clean and readable?

2. Completeness of key fields (25 points)
   - Policy number, dates, premium captured?
   - Vehicle plate, chassis, make/model captured?
   - Insured name and contact captured?

3. All numeric limits captured + reconciled (25 points)
   - Are ALL coverage limits in BOTH the limits table AND the JSON coverages array?
   - Do the numbers match exactly?
   - Are deductibles and percentages extracted?

4. No guessing / uncertainties listed properly (25 points)
   - Is "BELİRTİLMEMİŞ" used for missing info instead of guessing?
   - Are referenced documents/attachments listed in uncertainties?
   - Are ambiguous clauses flagged?

Current Score: [calculate]
Issues Found: [list issues]
Corrections Made: [if score < 90, list corrections]

If score < 90, revise the output until score ≥ 90.`

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface PolicyBriefSection {
  policyIdentity: {
    provider: string | null
    productName: string | null
    policyNumber: string | null
    sbmPolicyNumber: string | null
    startDate: string | null
    endDate: string | null
    totalPremium: number | null
    paymentType: string | null
    insuredName: string | null
    insuredId: string | null
  }
  vehicle: {
    plate: string | null
    chassis: string | null
    engine: string | null
    makeModel: string | null
    year: number | null
    usageType: string | null
  }
  coveragesIncluded: {
    mainKasko: string[]
    additionalCoverages: string[]
    assistance: string[]
    replacementVehicle: string[]
    personalAccident: string[]
    legalProtection: string[]
    voluntaryLiability: string[]
  }
  limitsTable: Array<{
    coverage: string
    limit: string
    basis: string
    conditions: string
  }>
  deductiblesTable: Array<{
    trigger: string
    deduction: string
    conditions: string
  }>
  keyExclusions: string[]
  claimsProcess: {
    deadline: string
    channels: string
    requiredDocuments: string
  }
  watchOuts: string[]
}

export interface StructuredPolicyData {
  policy: {
    policyNumber: string | null
    sbmPolicyNumber: string | null
    provider: string
    productName: string | null
    startDate: string
    endDate: string
    issueDate: string | null
  }
  insured: {
    name: string
    tcKimlik: string | null
    vkn: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  vehicle: {
    plate: string
    chassisNumber: string | null
    engineNumber: string | null
    make: string
    model: string
    year: number
    usageType: 'private' | 'commercial'
    fuelType: string | null
    hasLPG: boolean
  }
  premium: {
    netPremium: number
    tax: number
    totalPremium: number
    currency: string
    paymentPlan: string | null
    installments: number | null
  }
  /**
   * Premium discounts (NCD / group / other). Optional — set the whole
   * object to null (or omit) if no discount rows appear on the policy.
   * Percent integers (e.g. 40 = 40%). Mirrors `ExtractedPolicyData.discounts`
   * so both extraction paths surface the same field on `AnalyzedPolicy`.
   */
  discounts?: {
    ncdDiscount: number | null
    groupDiscount: number | null
    otherDiscountPct: number | null
    evidence: string | null
  } | null
  coverages: Array<{
    name: string
    nameTr: string
    category: 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'
    limit: number | null
    isUnlimited: boolean
    isMarketValue: boolean
    basis: 'per_event' | 'annual' | 'per_person' | 'per_vehicle'
    deductible: number | null
    deductibleType: 'fixed' | 'percentage'
    conditions: string | null
    source: string
    /** True if DAHİL (included), false if HARİÇ (excluded). Defaults to true. */
    included?: boolean
  }>
  deductiblesPenalties: Array<{
    trigger: string
    deduction: string
    conditions: string | null
    source: string
  }>
  exclusions: Array<{
    trigger: string
    effect: 'excluded' | 'limited' | 'conditional'
    details: string | null
    source: string
  }>
  noClaimsBonus: {
    currentLevel: string | null
    discountRate: string | null
    protectionIncluded: boolean
  }
  assistanceServices: Array<{
    name: string
    limit: string | null
    conditions: string | null
  }>
  replacementVehicle: {
    included: boolean
    daysLimit: number | null
    vehicleClass: string | null
    conditions: string | null
  }
  claimsProcess: {
    notificationDeadline: string
    channels: string[]
    requiredDocuments: Record<string, string[]>
  }
  uncertainties: Array<{
    item: string
    whyUncertain: string
    whatToCheck: string
  }>
  qualityScore: {
    readabilityStructure: number
    completenessKeyFields: number
    numericLimitsReconciled: number
    noGuessingUncertaintiesListed: number
    total: number
  }
}

// ============================================================================
// TURKISH SECTION ANCHORS
// ============================================================================

export const TURKISH_SECTION_ANCHORS = {
  TARAFLAR: ['SÖZLEŞME TARAFLARI', 'Sigorta Ettiren', 'Sigortalı', 'SİGORTACI', 'ACENTESİ'],
  KONU: ['SİGORTA KONUSU', 'Sigortalanan Araç', 'Araç Bilgileri', 'ARAÇ', 'Plaka'],
  PRIM: ['PRİM BİLGİLERİ', 'Prim Tutarı', 'Ödeme Planı', 'BSMV', 'Ödenecek Tutar', 'NET PRİM'],
  TEMINAT: ['TEMİNAT', 'SİGORTA KAPSAMI', 'Teminat Tablosu', 'KASKO TEMİNATLARI', 'EK TEMİNATLAR'],
  KLOZLAR: ['KLOZLAR', 'Özel Şartlar', 'KLOZ', 'Ek Klozlar'],
  MUAFIYET: ['MUAFİYET', 'Tenzili Muafiyet', 'TENZİLİ MUAFİYET', 'Sigortalı Payı', '%35', '%80'],
  HASARSIZLIK: [
    'Hasarsızlık',
    'HASARSIZLIK',
    'No-Claims',
    'Hasarsızlık İndirimi',
    'Hasarsızlık Kademesi',
  ],
  IKAME: ['İkame Araç', 'İKAME ARAÇ', 'Yedek Araç', 'Kiralık Araç'],
  ASISTANS: ['Asistans', 'ASİSTANS', 'Yol Yardım', 'Çekme Kurtarma'],
  FERDI_KAZA: ['Ferdi Kaza', 'FERDİ KAZA', 'Koltuk Ferdi Kaza', 'Sürücü Ferdi Kaza'],
  HUKUKI: ['Hukuki Koruma', 'HUKUKİ KORUMA', 'Hukuksal Koruma'],
  MALI_SORUMLULUK: ['Artan Mali Sorumluluk', 'İMM', 'İhtiyari Mali', 'Mali Mesuliyet'],
  ISTISNALAR: ['İSTİSNALAR', 'Kapsam Dışı', 'Sigorta Dışı', 'Teminat Dışı'],
  HASAR: ['HASAR', 'Hasar Bildirimi', 'Hasar Anında', 'Hasar Prosedürü'],
}

// ============================================================================
// COMMON DEDUCTION TRIGGERS (Turkish)
// ============================================================================

export const COMMON_DEDUCTION_TRIGGERS = [
  // Glass deductions
  { pattern: /cam.*%?\d+/i, type: 'glass' },
  { pattern: /camlar.*muafiyet/i, type: 'glass' },

  // Age/license deductions
  { pattern: /%35.*ehliy?et/i, type: 'license_age' },
  { pattern: /ehliy?et.*%35/i, type: 'license_age' },
  { pattern: /26 yaş/i, type: 'driver_age' },
  { pattern: /2 yıl.*ehliy?et/i, type: 'license_duration' },

  // Vehicle value deductions
  { pattern: /%80.*sigortalı/i, type: 'insured_share' },
  { pattern: /sigortalı.*%80/i, type: 'insured_share' },

  // Theft deductions
  { pattern: /hırsızlık.*%/i, type: 'theft' },
  { pattern: /çalınma.*muafiyet/i, type: 'theft' },

  // LPG deductions
  { pattern: /LPG.*muafiyet/i, type: 'lpg' },
  { pattern: /LPG.*tenzil/i, type: 'lpg' },

  // Wrong fuel
  { pattern: /hatalı akaryakıt/i, type: 'wrong_fuel' },
  { pattern: /yanlış yakıt/i, type: 'wrong_fuel' },
]

// ============================================================================
// OUTPUT PARSING HELPERS
// ============================================================================

/**
 * Parse the structured JSON from AI response
 */
export function parseStructuredOutput(response: string): StructuredPolicyData | null {
  try {
    // If it's already a valid JSON string (no markdown wraps), parse it directly
    const trimmed = response.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed)
      } catch (_e) {
        // Fallback to regex if simple parse fails
      }
    }

    // Find JSON block in response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (!jsonMatch) {
      // Try to find raw JSON object by looking for the outermost braces
      const firstBrace = response.indexOf('{')
      const lastBrace = response.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null

      const potentialJson = response.substring(firstBrace, lastBrace + 1)
      return JSON.parse(potentialJson)
    }
    return JSON.parse(jsonMatch[1])
  } catch {
    return null
  }
}

/**
 * Extract quality score from response
 */
export function extractQualityScore(response: string): number {
  try {
    const data = parseStructuredOutput(response)
    if (data?.qualityScore?.total) {
      return data.qualityScore.total
    }
    // Try to find score in text
    const scoreMatch = response.match(/total['":\s]+(\d+)/i)
    if (scoreMatch) return parseInt(scoreMatch[1], 10)
    return 0
  } catch {
    return 0
  }
}

/**
 * Extract watch-outs from Policy Brief section
 */
export function extractWatchOuts(response: string): string[] {
  const watchOuts: string[] = []

  // Find the watch-outs section
  const watchOutsMatch = response.match(/(?:dikkat noktası|watch-?out)[\s\S]*?(?=---|##|```|$)/i)
  if (!watchOutsMatch) return watchOuts

  // Extract numbered items
  const items = watchOutsMatch[0].match(/\d+\.\s*(.+?)(?=\n\d+\.|\n\n|$)/g)
  if (items) {
    for (const item of items) {
      const cleaned = item.replace(/^\d+\.\s*/, '').trim()
      if (cleaned.length > 5) {
        watchOuts.push(cleaned)
      }
    }
  }

  return watchOuts.slice(0, 15)
}
