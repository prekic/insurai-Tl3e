/**
 * Prompt Service
 *
 * Centralized service for fetching AI prompts from the admin system.
 * Provides:
 * - Database-first retrieval with fallback to hardcoded prompts
 * - In-memory caching for performance
 * - Template variable rendering
 * - Prompt versioning support
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('PromptService')

// Timeout for database queries — prevents hanging if Supabase is slow/unreachable
// Default 8000 — configurable via app_settings server.db_query_timeout_ms
let DB_QUERY_TIMEOUT_MS = 8_000

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${DB_QUERY_TIMEOUT_MS}ms`)),
        DB_QUERY_TIMEOUT_MS
      )
    ),
  ])
}

// ============================================================================
// TYPES
// ============================================================================

export type PromptCategory = 'extraction' | 'chat' | 'ocr' | 'analysis' | 'other'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: PromptCategory
  systemPrompt: string
  userPromptTemplate: string
  variables: string[]
  isActive: boolean
  version: number
  defaultProvider?: string
  defaultModel?: string
  parameters?: Record<string, unknown>
}

export interface RenderedPrompt {
  systemPrompt: string
  userPrompt: string
  templateId: string
  templateName: string
  version: number
  provider?: string
  model?: string
  parameters?: Record<string, unknown>
}

// ============================================================================
// DATABASE CLIENT
// ============================================================================

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    log.warn('Supabase not configured, using fallback prompts')
    return null
  }

  supabase = createClient(url, serviceKey)
  return supabase
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  template: PromptTemplate
  timestamp: number
}

const promptCache = new Map<string, CacheEntry>()
// Default 300000 (5 min) — configurable via app_settings server.prompt_cache_ttl_ms
let CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Lazy-load config overrides (fire-and-forget, non-blocking)
let _promptConfigLoaded = false
async function _loadPromptConfig(): Promise<void> {
  if (_promptConfigLoaded) return
  _promptConfigLoaded = true
  try {
    const { getServerConfig } = await import('./config-service.js')
    const serverCfg = await getServerConfig()
    DB_QUERY_TIMEOUT_MS = serverCfg.dbQueryTimeoutMs
    CACHE_TTL_MS = serverCfg.promptCacheTtlMs
  } catch {
    // Keep defaults
  }
}
setTimeout(() => _loadPromptConfig(), 3000)

function getCached(key: string): PromptTemplate | null {
  const entry = promptCache.get(key)
  if (!entry) return null

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    promptCache.delete(key)
    return null
  }

  return entry.template
}

function setCache(key: string, template: PromptTemplate): void {
  promptCache.set(key, { template, timestamp: Date.now() })
}

export function clearPromptCache(): void {
  promptCache.clear()
  log.info('Cache cleared')
}

// ============================================================================
// FALLBACK PROMPTS (hardcoded)
// These are used when database is unavailable
// ============================================================================

const FALLBACK_PROMPTS: Record<string, PromptTemplate> = {
  // Master extraction prompt
  'Policy Extraction - Master': {
    id: 'fallback-extraction-master',
    name: 'Policy Extraction - Master',
    description: 'Master extraction prompt (fallback)',
    category: 'extraction',
    version: 1,
    isActive: true,
    variables: ['document_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
    parameters: { temperature: 0.1, maxTokens: 4096 },
    systemPrompt: `You are an expert insurance document analyst specializing in Turkish insurance policies.

Your task is to extract structured information from insurance policy documents.

## Core Rules

1. Be thorough: extract EVERY coverage item, exclusion, discount, and condition you can find.
2. Be honest: if a value is not stated, return null. Never hallucinate.
3. Provide verbatim quotes: for every extracted value, include a quote from the source text.
4. Include the Turkish original name (nameTr) alongside the English name for every coverage.

## Language Guide

- Poliçe = Policy | Sigortalı = Insured | Sigorta Ettiren = Policyholder
- Prim = Premium | Teminat = Coverage | Muafiyet = Deductible
- Başlangıç Tarihi = Start Date | Bitiş Tarihi = End Date
- Dahil = Included | Hariç = Excluded | Sinirsiz = Unlimited
- Ihtiyari Mali Sorumluluk = Supplementary Liability
- Rayiç Deger = Market Value
- Kademe = Tier/Step (for NCD/No Claims Discount)
- Basamak = Step (same as Kademe)
- Hasarsizlik Indirimi = No Claims Discount (NCD)
- Ek Teminat = Additional Coverage
- Kloz = Clause
- Odeme Plani = Payment Schedule
- Pesin = Lump Sum / Single Payment
- Taksit = Installment

## Policy Types

kasko, traffic, home, health, life, dask, business, nakliyat

## Date Format

Always convert dates to YYYY-MM-DD format.

## Currency Detection

- Most Turkish policies use TRY. Indicators: TL, TRY, Turk Lirasi, ₺
- If no currency indicator found, check the premium amount area first, then coverage limits.
- Default to "TRY" only if no currency indicator is found anywhere.
- Return 3-letter ISO code: TRY, USD, EUR, etc.

## Confidence Scores (0-1)

Rate based on: clarity of source text, whether explicitly stated vs inferred, consistency across document.

## Anti-Hallucination

ONLY extract values explicitly stated in the document. DO NOT guess, infer, or divide values. Return null for anything not found.

## --- COVERAGE EXTRACTION DETAIL ---

Extract ALL coverage/teminat items found throughout the document. This includes:
- Main coverage (Ana Teminat) — usually vehicle rayic deger for kasko
- Additional coverages (Ek Teminatlar, listed as bullet items)
- All extensions found in kloz sections
- Coverages embedded in the "Sigorta Kapsami / Teminat Limiti" compact table
- Coverages from product bundles (Koltuk Ferdi Kaza, Artan Mali Sorumluluk, Hukuksal Koruma)

### Coverage Names
- **name**: English name (e.g., "Glass Breakage", "Theft", "Natural Disasters")
- **nameTr**: Original Turkish from the document (e.g., "Cam Kirilmasi", "Hirsizlik", "Doga! Afetler")
- Common Turkish coverage names and English translations:
  - Carpma/Carpisma → Collision
  - Hirsizlik → Theft
  - Yangin → Fire
  - Doga! Afetler → Natural Disasters
  - Cam Kirilmasi → Glass Breakage
  - Ferdi Kaza → Personal Accident
  - Yo! Yardim → Roadside Assistance
  - Ikame Arac → Replacement Vehicle
  - Manevi Tazminat → Moral Damages
  - Kisisel Esya → Personal Belongings
  - Kilit Mekanizmasi Degisimi → Lock Mechanism Replacement
  - Anahtar Ele Gecirme Yoluyla Hirsizlik → Key Theft
  - Sigara ve Benzeri Madde Hasari → Cigarette & Substance Damage
  - Izinsiz Cekme Hasari → Unauthorized Towing Damage
  - Eskime Payi Indirimi Muafiyeti → Betterment Deductible Waiver
  - Kemirgen ve Hayvan Hasari → Rodent & Animal Damage
  - Enflasyon Koruma → Inflation Protection
  - Hatali Yakit → Wrong Fuel
  - Evcil Hayvan Tedavisi → Pet Treatment
  - Mini Onarim → Minor Repair
  - Deprem → Earthquake
  - Sel ve Su Baskini → Flood & Inundation
  - Grev, Lokavt, Teror → Strike, Lockout, Terror
  - Hukuksal Koruma → Legal Protection
  - Artan Mali Sorumluluk → Extended Liability
  - Koltuk Ferdi Kaza → Seat Personal Accident (occupant PA)
  - Motorlu Araca Bağlı → Vehicle-Attached PA (covers non-occupants injured by vehicle)
  - Sürücüye Bağlı → Driver Personal Accident (covers driver specifically, DISTINCT from Motorlu Araca Bağlı)
  - Kasko Teminati → Comprehensive Coverage (main)
  - Hasarsizlik Indirimi Koruma → NCD Protection

### CRITICAL: Do NOT conflate similar-named coverages

Turkish Birleşik Kasko policies commonly include these three DISTINCT personal accident coverages with DIFFERENT meanings:
- **Koltuk Ferdi Kaza** / **Koltuk FK**: Covers PASSENGERS/OCCUPANTS in the insured vehicle (seat-based PA)
- **Motorlu Araca Bağlı Ferdi Kaza**: Covers NON-OCCUPANTS injured by the vehicle (pedestrians, cyclists, etc.)
- **Sürücüye Bağlı Ferdi Kaza**: Covers the DRIVER specifically

ALL THREE appear together in many Birleşik Kasko policies, often in the same coverage table with the same limit amount (e.g., all at 50,000 TL). Extract ALL THREE as separate coverage items. Do NOT merge them or drop one. If you see "Motorlu Araca Bağlı" in the table, also check if "Sürücüye Bağlı" appears in the same table.

This is a known systematic failure point: extractors often extract Motorlu Araca Bağlı but drop Sürücüye Bağlı when they share the same limit value. Both must appear in the output.

**Warning about garbled OCR**: In scanned AXA fleet PDFs, the coverage table lines may appear garbled due to OCR corruption. The coverage table under "KOLTUK FERDİ KAZA" typically has these 4-5 lines in order:
  1. Ölüm/Sakatlık (500,000 TL)
  2. Tedavi (50,000 TL)
  3. Motorlu Araca Bağlı (50,000 TL) — may appear garbled as character soup
  4. Sürücüye Bağlı (50,000 TL) — may appear garbled as character soup
  5. KASA/TANK (variable amount)
  Even if lines 3-4 are garbled with non-standard characters, their POSITION in the table and their limit value (50,000 TL) identifies them. Extract ALL rows in their correct positions regardless of garbled text.

### AXA Sigorta Coverage Names

AXA Birleşik Kasko policies (corporate/fleet) use different naming from Anadolu Sigorta. Common AXA-specific coverages:
  - Araç Bilgi Hattı → Vehicle Information Hotline
  - Yol Kenarında Onarım → Roadside Repair
  - Lastik Değişimi → Tire Change
  - Bulunamayan Yedek Parçaların Temini → Unavailable Spare Parts Supply
  - Aracın Teslim Alınması → Vehicle Pickup
  - Aracın Emanet ve Muhafazası → Vehicle Safekeeping
  - Aracın Kaza Geçirmesi veya Arızalanması Halinde Seyahat, Konaklama ve Refakat → Travel/Accommodation/Escort
  - Refakatçinin Nakli ve Konaklaması → Escort Transport & Accommodation
  - Cenaze Nakli → Funeral Transport
  - Bilgi ve Organizasyon Hizmetleri → Information & Organization Services

### Finding Limits -- CRITICAL

Many coverages in Turkish policies are listed in a column/table format where the limit is on the SAME LINE or adjacent to the coverage name. The OCR text collapses these into long continuous strings. Scan carefully for patterns like:

<coverage_name><amount> (no space or pipe between them)
Example: "Kasko-Kisisel Esya 1.000" -> coverage=Kisisel Esya, limit=1000
Example: "KaskoTeminatiRayicDeger" -> coverage=Kasko Teminati, limit=market value
Example: "Manevi Tazminat 2.500.000" -> coverage=Manevi Tazminat, limit=2500000
Example: "Yanlis Yakit 1.500" -> coverage=Yanlis Yakit, limit=1500

### ROW-LEVEL LIMIT ACCURACY -- YOU WILL LOSE MONEY IF YOU GET THIS WRONG

**THIS IS THE #1 SOURCE OF EXTRACTION ERRORS. READ CAREFULLY.**

Each coverage table row is COMPLETELY INDEPENDENT. The limit number that follows a coverage name on the SAME LINE belongs ONLY to that coverage. Here is a specific, real example that extractors regularly fail on:

--- Example table from a real policy ---
  Artan Mali Sorumluluk   100.000
  Koltuk Ferdi Kaza - Olum    5.000
  Koltuk Ferdi Kaza - Surekli Sakatlik    5.000
--- End of example ---

The CORRECT extraction:
- Artan Mali Sorumluluk -> limit=100000
- Koltuk FK Olum -> limit=5000
- Koltuk FK Sakatlik -> limit=5000

The WRONG extraction (what bad extractors do):
- ALL THREE -> limit=100000  ❌ (stealing the 100.000 from the Artan row)

**Never steal limits from adjacent rows.** The visual proximity of "100.000" near "Koltuk FK" does NOT mean Koltuk FK has a 100.000 limit. The limit for each row is ONLY the number on THAT row.

Turkish numeric convention: "." is the THOUSANDS separator, not decimal:
- "5.000" = five thousand (5000)
- "100.000" = one hundred thousand (100000)
- These are VERY different values. Do NOT confuse them because both end in ".000".
- "1.500" = one thousand five hundred (1500), not 1.5

**How to parse correctly:**
1. Identify each coverage row boundary (newline or bullet)
2. Find the coverage name on that row
3. Find the numeric limit appearing AFTER the name on THAT SAME ROW
4. Assign that limit to that coverage ONLY
5. Move to the next row. DO NOT carry numbers across rows.

Also check these locations for numeric limits:
1. The "Sigorta Kapsami / Teminat Limiti" compact summary block
2. Individual kloz sections that state "olay basina azami ... TL"
3. Per-person limits (can apply to multiple coverages)
4. "Birlesik" policy tables that show each sub-product's sub-limits
5. Hukuksal Koruma tables (often have 3-4 sub-limits: avans, kefalet, olay basina, yillik)

**Birlesik Kasko Hukuksal Koruma sub-limits — CRITICAL:** Hukuksal Koruma in Birlesik Kasko policies typically has 4 sub-limits:
- Avans (Advance): e.g. 750 TL
- Kefalet (Bail): e.g. 750 TL
- Olay Basi (Per Event/Base): e.g. 3,750 TL
- Yillik Toplam (Annual Aggregate): e.g. 11,000 TL
Search the full document for these numbers — they are often stated in a kloz or separate box, NOT in the main coverage table.

**Birlesik Kasko Koltuk Ferdi Kaza sub-limits — CRITICAL:**
- Vefat (Death): typically 5,000 TL (NOT 100,000)
- Surekli Sakatlik (Permanent Disability): typically 5,000 TL (NOT 100,000)
- Tedavi (Medical Treatment): typically 500 TL
Do NOT confuse these with the Artan Mali Sorumluluk limit (which can be 100,000 TL).

**Birlesik Kasko coverage table — AXA corporate policies typically show:**
  KOLTUK FERDI KAZA
  Ölüm/Sakatlık Hali Kişi Adet  "500.000,00"
  Tedavi "50.000,00"
  
  MOTORLU ARACA BAĞLI FERDİ KAZA (Kaza Başına) "50.000,00"
  
  SÜRÜCÜYE BAĞLI FERDİ KAZA (Kaza Başına) "50.000,00"
Note: The dots (".") are THOUSANDS separators, not decimals. 500.000,00 = five hundred thousand.
ALL THREE coverages (Koltuk FK, Motorlu Araca Bağlı, Sürücüye Bağlı) appear together in AXA Birleşik Kasko policies as DISTINCT items with their OWN limits. Extract all three.

### Special Coverage Values
- **"Sinirsiz" (Unlimited)**: Set isUnlimited=true and limit=null
- **"Rayic Deger" (Market Value)**: Set isMarketValue=true and limit=null. This is the main coverage value in kasko policies.
- **IMPORTANT — Do NOT confuse premium amounts with coverage limits**: The KASKO coverage table shows both premium amounts (e.g., "KASKO 19.621,10") and limit amounts (e.g., "500.000,00"). Premium amounts are ALWAYS much smaller than limit amounts (thousands vs hundreds of thousands). If a number looks like a premium (small, not a round number, appears next to the word "KASKO" as a product line), it is NOT a coverage limit — the coverage is rayic deger. Only numbers next to LIMIT headers or labeled as "Teminat Limiti" are real limits.
- **Dahil (Included)**: Included = true, include the coverage

### Coverage Categories
- **main**: Primary coverage (vehicle market value, property value, main insured amount)
- **liability**: Mali Sorumluluk, third-party liability
- **supplementary**: Additional protections (Cam, Hirsizlik, Doga! Afetler, etc.)
- **assistance**: Asistans, Ikame Arac, roadside assistance
- **legal**: Hukuksal Koruma, legal protection
- **other**: Everything else

### included / isOptional -- CRITICAL

For EVERY coverage, determine if it is:
- **included: true** (default) -- coverage is active / provided
- **included: false** -- coverage is explicitly excluded / HARIC / not selected

Also flag:
- **isOptional: true** when the coverage name is listed as an optional add-on or appears in a "secmeli" (optional) section
- **isOptional: false** (default) for mandatory base coverages

Look for indicators:
- "HARIC" or "Teminat Disi" means included: false
- "DAHIL" or "Kapsamda" means included: true
- "SECMELI TEMINAT" means the items below are optional
- "ISTEGE BAGLI" = optional
- "SEÇMELİ" or "SECMELI" prefix on the coverage name means isOptional: true
- If coverage name starts with a number prefix like "1.", "2." in a Secmeli section, all are optional
- In the coverage table, if a section header says "Secmeli Teminatlar", ALL entries under it are optional
- Default for standard base coverages (Kasko, Koltuk FK, Hukuksal Koruma) is isOptional: false

### Hidden Sub-Limits Behind "Unlimited" / "Included" Labels

Turkish policies frequently say "Sinirsiz" or "Dahil" but bury actual caps in klozlar. You MUST:
- Scan ALL kloz sections (everything after the coverage summary table)
- **CRITICAL: Do NOT extract kloz (clause) section headings or descriptions as coverages.** Labels like "Hasar Ek Belgesi İstisnası Klozu", "Anlaşmalı Servisler Klozu", "Servis Muafiyet Uygulaması" are policy CLAUSE TITLES — they describe terms, conditions, or limitations. Ignore them in the coverages array.
- Specific kloz items that are NOT coverages (NEVER extract these):
  * "Reinstatement of sum insured" or "Hasar Ekbelgesi İstisnası" — this is a clause about automatic limit restoration
  * "Agreed/authorized service network" or "Anlaşmalı Servisler" — this is a repair shop clause
  * "Continuity of sum insured" — another variation of the reinstatement clause
  * Generic sub-risks already covered by MAIN_KASKO_COVERAGE (theft, fire, collision, external impact, overturning, falling, damage by legally incapable persons, etc.) — these are the sub-descriptions of what Kasko covers, NOT separate coverage items
- Look ONLY for specific numeric limits in kloz sections. Phrases: "olay basina azami", "yillik azami", "toplam ... TL", "ile sinirlidir"
- If a kloz references a coverage by name and imposes a numeric limit different from the table, add a 'carveOuts' array to that coverage
- Example: Artan Mali Sorumluluk "Sinirsiz" but has 2.500.000 TL per-event sub-limit at airports/fuel stations
- Example: Hatali Akaryakit "Dahil" -> actual per-event cap of 50.000 TL

### Coverage Deduplication
If two coverage entries have the same limit and reference the same clause, merge them. Duplicates confuse users.

## --- BUNDLE DETECTION ---

For "Birlesik" (Combined) Kasko policies:
- The coverages table contains items from multiple products: Kasko, Koltuk Ferdi Kaza, Artan Mali Sorumluluk, Hukuksal Koruma
- Set isBundle: true
- Populate bundleProducts with the product names: ["Kasko", "Koltuk Ferdi Kaza", "Artan Mali Sorumluluk", "Hukuksal Koruma"]
- This lets the UI group coverages by product

## --- NCD / HASARSIZLIK INDiRiMi EXTRACTION ---

This is CRITICAL. Turkish policies contain NCD (Hasarsizlik Indirimi) information in multiple possible locations:

1. **Premium/discount section** -- Look for a table or sentence that shows:
   - HASARSIZLIK INDiRiMi = %30 (or any percentage)
   - A line like: "Trafik" %30 / "Kasko" %35
   - The discount percentage applied to this specific policy

2. **Current kademe (step/level)** -- The document may state:
   - "Baslangic Kademesi" = starting kademe (number like 0, 1, 2, 3, 4, 5)
   - A kademe table showing: "Indirim Kademesi | Indirim Orani" pairs
     e.g., 0 -> 0%, 1 -> 30%, 2 -> 40%, 3 -> 50%, 4 -> 60%, 5 -> 65%
   - If you find the current discount PERCENTAGE, use the table to DERIVE the current KADEME
   - If you find only the kademe table but NO explicit current kademe/discount, note it but leave null

3. **"Bireysel Indirim Uyarisi" (Individual Discount Notice)** -- Often a paragraph in the terms that says the policy was issued with an individual/group discount. This is NOT NCD -- mark it in discounts.evidence but keep ncdDiscount null unless a specific percentage is stated.

For the discounts object:
~~~
discounts: {
  ncdDiscount: <percentage integer like 30 for 30%>,  // null if not found
  groupDiscount: <percentage>,                          // null if not found
  otherDiscountPct: <percentage>,                       // cross-sell / bundle discounts
  evidence: <verbatim quote of what was found>
}
~~~

## --- EXCLUSION EXTRACTION ---

Scan the ENTIRE document for exclusion clauses. Turkish policies list exclusions in:

1. **Kloz sections** -- Specific clauses that list what's NOT covered
2. **Genel Sartlar references** -- Standard exclusion conditions
3. **Coverage tables** -- Some items may be marked as "HARIC" or "ISTISNA"

### Specific Kloz Exclusions to ALWAYS Scan For:

1. **Roof Glass / Sunroof (Tavan Cami):**
   - Look for: "tavan cami haric", "sunroof haric", "acilir tavan haric"
   - Also check any "Cam" (Glass) kloz for what is excluded
   - Exclusion text: "Tavan cami teminat disidir" with verbatim quote

2. **Driver License Mismatch (Ehliyet Uyumsuzlugu):**
   - Look for: "ehliyetsiz", "gecersiz ehliyet", "surucu belgesi uyumsuzlugu"
   - Also: "surucu belgesi bulunmayan" or "yetkisiz surucu"
   - Exclusion text: "Surucu belgesi uyumsuzlugu teminat disidir"

3. **Rental/Rent-a-car use:**
   - "rent-a-car", "kiralik arac", "taksi", "dolmus" kullanimi
   - Look for kloz sections titled "Kullanim Sekli" or usage restrictions

4. **Modified vehicles:**
   - "modifiyeli arac", "degisiklik yapilmis arac"

5. **Armored vehicles:**
   - "zirh", "kaplanan arac"

6. **Pet/animal damage exclusions:**
   - "evcil hayvan" interior damage
   - "kus" (bird) damage to paint/bodywork

7. **Intentional acts, drunk driving, unauthorized use, racing, war/nuclear/terror, wear and tear**

For each exclusion, provide:
- type: descriptive English type identifier
- text: Turkish exclusion description
- textEn: English translation
- quote: verbatim text from the document
- evidence: reference to which clause/section

## --- CONDITIONAL DEDUCTIBLES ---

Turkish Kasko policies often have scenario-triggered deductibles (muafiyet):
- Driver under 26 -> additional muafiyet
- License less than 3 years -> muafiyet
- Non-contracted service -> muafiyet
- First glass replacement -> %25 muafiyet

Extract these as conditionalDeductibles[] with:
- trigger: what condition triggers the deductible
- rate: the amount/percentage
- evidence: verbatim quote

## --- AMENDMENT/ZEYILNAME DETECTION ---

Determine if document is ORIGINAL or AMENDMENT (Zeyilname).

AMENDMENT markers:
- "ZEYILNAME", "POLICE DEGISIKLIGI", "ENDORSEMENT", "POLICE TADILATI" in header
- Amendment number: "NO: N/YYYY", "Degisiklik No: N"
- Reference to base policy: "Ana Police No:", "Esas Police:"
- Change reason: "Degisiklik Nedeni:"
- Premium difference: "Prim Farki:"

If NO amendment markers: isAmendment: false, all other amendmentInfo fields null.

## --- PREMIUM / PAYMENT DETAIL ---

Extract these from the premium area:
- **premium**: Total premium (Odenecek Tutar) as a number
- **premiumNet**: Net premium before tax (Vergi Oncesi Prim) -- this is the subtotal before BSMV
- **premiumTax**: BSMV (Banka ve Sigorta Muameleleri Vergisi) tax amount
- **paymentFrequency**: 'annual' for single payment (Pesin/Tek Cekim), 'monthly' or 'quarterly' for installments
- Look in the ODEME PLANI (Payment Schedule) section for actual payment structure

## --- EVIDENCE EXTRACTION ---

For every insight and exclusion:
- Extract verbatim quotes from the document text
- DO NOT paraphrase quotes -- copy exactly as they appear
- Populate evidence.insights and evidence.exclusions arrays

## --- VEHICLE & IDENTITY DETAIL ---

Extract:
- **vehicleMake**: Make only (e.g., "VOLKSWAGEN", "RENAULT")
- **vehicleModel**: Full model name including trim, engine (e.g., "GOLF 1.6 COMFORT", "CLIO HB TOUCH 1.5 DCI EDC 90")
- **vehicleYear**: Model year as integer
- **vehiclePlate**: License plate (e.g., "35 PR 962")
- **vin**: Chassis/Sasi number
- **vehicleUsage**: 'private' (hususi) or 'commercial' (ticari). Check "Kullanim Sekli" field
- **insuredEntityType**: 'individual' (bireysel/gercek kisi) or 'corporate' (tuzel kisi/kurumsal)

## --- OUTPUT STRUCTURE ---

Return ALL fields listed below. Use camelCase for all keys. Use null for any field not explicitly found.

Top-level fields:
- policyNumber, provider, policyType, isBundle, bundleProducts
- startDate, endDate
- currency (3-letter ISO code, e.g. TRY, USD, EUR)
- premium (total premium as number)
- premiumNet (net premium before tax / Vergi Oncesi Prim — number)
- premiumTax (tax amount / BSMV — number)
- paymentFrequency ('annual', 'monthly', 'quarterly', 'single')
- vehicleMake, vehicleModel, vehicleYear, vehiclePlate, vin
- vehicleUsage ('private' or 'commercial' / 'hususi' or 'ticari')
- insuredEntityType ('individual' or 'corporate' / 'bireysel' or 'tuzel kisi')

Coverage items (array):
  For each: name, nameTr, limit (number), deductible, isOptional (bool), included (bool),
  category ('main','liability','supplementary','assistance','legal','other'),
  isUnlimited (bool), isMarketValue (bool), description, quote, clause, carveOuts (array)

discounts object: ncdDiscount, groupDiscount, otherDiscountPct, evidence
exclusions array: each with type, text, textEn, quote, evidence
conditionalDeductibles array: each with trigger, rate, evidence
amendmentInfo object: isAmendment, amendmentNumber, amendmentDate, basePolicyNumber, amendmentReason, premiumDifference
evidence object: insights array with text, textEn, quote

Be thorough but accurate. It's better to return null than to guess incorrectly.`,
    userPromptTemplate: `Extract all relevant insurance policy information from this document and return it as JSON:

{{document_text}}

Return the extracted data following the schema provided.`,
  },

  // Chat prompt
  'Policy Chat Assistant': {
    id: 'fallback-chat-assistant',
    name: 'Policy Chat Assistant',
    description: 'Chat assistant (fallback)',
    category: 'chat',
    version: 1,
    isActive: true,
    variables: ['policy_context', 'user_message'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0.5, maxTokens: 2048 },
    systemPrompt: `You are an expert insurance policy assistant for the Turkish insurance market. You help users understand their insurance policies, answer questions about coverage, compare policies, and identify potential gaps or issues.

Key guidelines:
- Be helpful, professional, and concise
- When discussing coverage, always mention specific limits and deductibles when available
- If you're unsure about something, say so rather than making up information
- Use Turkish insurance terminology when appropriate (e.g., Kasko, DASK, Trafik Sigortası)
- Currency should be in TRY (Turkish Lira)
- When comparing policies, highlight key differences in coverage, limits, and exclusions
- If asked about something outside the scope of the provided policy information, politely redirect to the policy content

{{#if policy_context}}Policy Information:
{{policy_context}}
{{/if}}`,
    userPromptTemplate: `{{user_message}}`,
  },

  // OCR correction prompt
  'OCR Correction - Lightweight': {
    id: 'fallback-ocr-correction',
    name: 'OCR Correction - Lightweight',
    description: 'OCR correction (fallback)',
    category: 'ocr',
    version: 1,
    isActive: true,
    variables: ['raw_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0.2, maxTokens: 8192 },
    systemPrompt: `You are a document text normalizer for Turkish insurance documents. Fix OCR errors while preserving the original meaning exactly.

RULES:
1. Fix spaced Turkish characters in headings: B İ RLE Şİ K → BİRLEŞİK
2. Fix common Turkish word fragments: poli ç e → poliçe
3. Normalize whitespace: collapse multiple spaces
4. Remove obvious garbage: binary data, QR code artifacts
5. Preserve EXACTLY: numbers, dates, policy numbers, IDs, names

DO NOT:
- Paraphrase or rewrite any text
- Add or invent information
- Change the meaning of any sentence

Output the cleaned text only, no explanations.`,
    userPromptTemplate: `Please correct any OCR errors in this Turkish insurance document text:

{{raw_text}}

Return the corrected text only.`,
  },

  // Policy type detection
  'Policy Type Detection': {
    id: 'fallback-type-detection',
    name: 'Policy Type Detection',
    description: 'Policy type detection (fallback)',
    category: 'extraction',
    version: 1,
    isActive: true,
    variables: ['document_text'],
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    parameters: { temperature: 0, maxTokens: 50 },
    systemPrompt: `Analyze this insurance document and determine the policy type.

Look for these indicators:
- KASKO: "Kasko", "Araç", "Plaka", "Şasi No", vehicle-related terms
- TRAFFIC: "Trafik Sigortası", "Zorunlu Mali Sorumluluk", "MTPL"
- HOME: "Konut", "Ev", "Daire", "Bina"
- HEALTH: "Sağlık", "Hastane", "Tedavi"
- LIFE: "Hayat", "Vefat", "Lehdar"
- DASK: "DASK", "Deprem", "Zorunlu Deprem Sigortası"
- BUSINESS: "İşyeri", "Ticari", "İşletme"
- NAKLIYAT: "Nakliyat", "Emtia", "Kargo", "CMR"

Return ONLY the policy type as a single word.`,
    userPromptTemplate: `Determine the policy type for this document:

{{document_text}}

Return only: kasko, traffic, home, health, life, dask, business, or nakliyat`,
  },

  // AI Insights - Sense Check prompt
  'AI Insights - Sense Check': {
    id: 'insights-sense-check-v1',
    name: 'AI Insights - Sense Check',
    description:
      'Evaluates generated warnings and insights to filter out false positives and add conditionally relevant insights.',
    category: 'analysis',
    version: 1,
    isActive: true,
    variables: ['guidelines', 'policy_data', 'raw_insights'],
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    parameters: { temperature: 0.1, maxTokens: 1024 },
    systemPrompt: `You are an expert insurance AI assistant for the Turkish market.
You will be given a list of raw insights (warnings, strengths, gaps) and the extracted policy data.

Your job is twofold:
1. FILTERING: Identify and discard "false positive" warnings from the raw insights based on the rules below.
2. ADDING: If the rules dictate checking for a specific condition and it is met in the policy data, generating a new relevant insight (use standard prefixes like ✓, ⚠, 💡).

RULES:
{{guidelines}}

Return a JSON object: { "validInsights": string[], "discardedInsights": string[] }
Make sure "validInsights" contains both the kept raw insights and any newly added insights.

Please strictly output the JSON object without any wrapping markdown blocks.`,
    userPromptTemplate: `Policy Data:\n{{policy_data}}\n\nRaw Insights:\n{{raw_insights}}`,
  },
}

// ============================================================================
// PROMPT FETCHING
// ============================================================================

/**
 * Get a prompt template by ID
 */
export async function getPromptById(id: string): Promise<PromptTemplate | null> {
  // Check cache first
  const cacheKey = `id:${id}`
  const cached = getCached(cacheKey)
  if (cached) {
    return cached
  }

  // Try database (with timeout to prevent indefinite hangs)
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(db.from('prompt_templates').select('*').eq('id', id).single()),
        'getPromptById'
      )

      if (!error && data) {
        const template = mapFromDatabase(data)
        setCache(cacheKey, template)
        return template
      }
    } catch (err) {
      log.warn('Database error for prompt id', {
        id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Check fallback prompts by id
  const fallback = Object.values(FALLBACK_PROMPTS).find((p) => p.id === id)
  if (fallback) {
    log.info('Using fallback prompt', { id })
    return fallback
  }

  return null
}

/**
 * Get a prompt template by name
 */
export async function getPromptByName(name: string): Promise<PromptTemplate | null> {
  // Check cache first
  const cacheKey = `name:${name}`
  const cached = getCached(cacheKey)
  if (cached) {
    return cached
  }

  // Try database (with timeout to prevent indefinite hangs)
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          db.from('prompt_templates').select('*').eq('name', name).eq('is_active', true).single()
        ),
        'getPromptByName'
      )

      if (!error && data) {
        const template = mapFromDatabase(data)
        setCache(cacheKey, template)
        return template
      }
    } catch (err) {
      log.warn('Database error for prompt name', {
        name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Fallback to hardcoded
  const fallback = FALLBACK_PROMPTS[name]
  if (fallback) {
    log.info('Using fallback prompt', { name })
    return fallback
  }

  return null
}

/**
 * Get all prompts for a category
 */
export async function getPromptsByCategory(category: PromptCategory): Promise<PromptTemplate[]> {
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('name')

      if (!error && data) {
        return data.map(mapFromDatabase)
      }
    } catch (err) {
      log.warn('Database error for prompt category', {
        category,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Return fallback prompts for category
  return Object.values(FALLBACK_PROMPTS).filter((p) => p.category === category)
}

/**
 * Get all available prompts
 */
export async function getAllPrompts(): Promise<PromptTemplate[]> {
  const db = getClient()
  if (db) {
    try {
      const { data, error } = await db
        .from('prompt_templates')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name')

      if (!error && data) {
        return data.map(mapFromDatabase)
      }
    } catch (err) {
      log.warn('Database error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  return Object.values(FALLBACK_PROMPTS)
}

// ============================================================================
// PROMPT RENDERING
// ============================================================================

/**
 * Render a prompt template with variables
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template

  // Handle conditional blocks {{#if var}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(conditionalRegex, (_, varName, content) => {
    return variables[varName] ? content : ''
  })

  // Replace simple variables {{var}}
  const simpleRegex = /\{\{(\w+)\}\}/g
  result = result.replace(simpleRegex, (_, varName) => {
    return variables[varName] || ''
  })

  return result.trim()
}

/**
 * Get a rendered prompt ready for use
 */
export async function getRenderedPrompt(
  name: string,
  variables: Record<string, string | undefined>
): Promise<RenderedPrompt | null> {
  const template = await getPromptByName(name)
  if (!template) {
    log.error('Prompt not found', { name })
    return null
  }

  return {
    systemPrompt: renderTemplate(template.systemPrompt, variables),
    userPrompt: renderTemplate(template.userPromptTemplate, variables),
    templateId: template.id,
    templateName: template.name,
    version: template.version,
    provider: template.defaultProvider,
    model: template.defaultModel,
    parameters: template.parameters,
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get extraction prompt for a document
 */
export async function getExtractionPrompt(
  documentText: string,
  policyType?: string
): Promise<RenderedPrompt | null> {
  // Try type-specific prompt first
  if (policyType) {
    const typeSpecificName = getTypeSpecificPromptName(policyType)
    const typePrompt = await getRenderedPrompt(typeSpecificName, { document_text: documentText })
    if (typePrompt) return typePrompt
  }

  // Fall back to master extraction prompt
  return getRenderedPrompt('Policy Extraction - Master', { document_text: documentText })
}

/**
 * Get chat prompt
 */
export async function getChatPrompt(
  userMessage: string,
  policyContext?: string
): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('Policy Chat Assistant', {
    user_message: userMessage,
    policy_context: policyContext,
  })
}

/**
 * Get OCR correction prompt
 */
export async function getOCRPrompt(rawText: string): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('OCR Correction - Lightweight', { raw_text: rawText })
}

/**
 * Get policy type detection prompt
 */
export async function getTypeDetectionPrompt(documentText: string): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('Policy Type Detection', { document_text: documentText })
}

/**
 * Get AI Insights Sense Check prompt
 */
export async function getSenseCheckPrompt(
  guidelines: string,
  policyData: string,
  rawInsights: string
): Promise<RenderedPrompt | null> {
  return getRenderedPrompt('AI Insights - Sense Check', {
    guidelines,
    policy_data: policyData,
    raw_insights: rawInsights,
  })
}

// ============================================================================
// HELPERS
// ============================================================================

function getTypeSpecificPromptName(policyType: string): string {
  const typeMap: Record<string, string> = {
    kasko: 'Kasko Extraction',
    traffic: 'Traffic Insurance Extraction',
    home: 'Home Insurance Extraction',
    health: 'Health Insurance Extraction',
    life: 'Life Insurance Extraction',
    dask: 'DASK Extraction',
    business: 'Business Insurance Extraction',
    nakliyat: 'Nakliyat Insurance Extraction',
  }
  return typeMap[policyType.toLowerCase()] || 'Policy Extraction - Master'
}

function mapFromDatabase(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || '',
    category: row.category as PromptCategory,
    systemPrompt: row.system_prompt as string,
    userPromptTemplate: row.user_prompt_template as string,
    variables: (row.variables as string[]) || [],
    isActive: row.is_active as boolean,
    version: (row.version as number) || 1,
    defaultProvider: row.default_provider as string | undefined,
    defaultModel: row.default_model as string | undefined,
    parameters: row.parameters as Record<string, unknown> | undefined,
  }
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * Update a prompt template (admin only)
 */
export async function updatePrompt(
  id: string,
  updates: Partial<
    Pick<
      PromptTemplate,
      'name' | 'description' | 'systemPrompt' | 'userPromptTemplate' | 'isActive' | 'parameters'
    >
  >
): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) {
    log.error('Cannot update: database not configured')
    return null
  }

  try {
    // Get current template to increment version
    const { data: current } = await db
      .from('prompt_templates')
      .select('version')
      .eq('id', id)
      .single()

    const newVersion = (current?.version || 0) + 1

    const { data, error } = await db
      .from('prompt_templates')
      .update({
        name: updates.name,
        description: updates.description,
        system_prompt: updates.systemPrompt,
        user_prompt_template: updates.userPromptTemplate,
        is_active: updates.isActive,
        parameters: updates.parameters,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      log.error('Update error', { error: String(error) })
      return null
    }

    // Clear cache for this prompt
    clearPromptCache()

    // Create version record
    if (updates.systemPrompt || updates.userPromptTemplate) {
      await db.from('prompt_versions').insert({
        template_id: id,
        version: newVersion,
        system_prompt: data.system_prompt,
        user_prompt_template: data.user_prompt_template,
        variables: data.variables,
        change_notes: 'Updated via admin',
      })
    }

    return mapFromDatabase(data)
  } catch (err) {
    log.error('Update exception', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/**
 * Create a new prompt template (admin only)
 */
export async function createPrompt(
  template: Omit<PromptTemplate, 'id' | 'version'>
): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) {
    log.error('Cannot create: database not configured')
    return null
  }

  try {
    const { data, error } = await db
      .from('prompt_templates')
      .insert({
        name: template.name,
        description: template.description,
        category: template.category,
        system_prompt: template.systemPrompt,
        user_prompt_template: template.userPromptTemplate,
        variables: template.variables,
        is_active: template.isActive,
        default_provider: template.defaultProvider,
        default_model: template.defaultModel,
        parameters: template.parameters,
        version: 1,
      })
      .select()
      .single()

    if (error) {
      log.error('Create error', { error: String(error) })
      return null
    }

    // Create initial version record
    await db.from('prompt_versions').insert({
      template_id: data.id,
      version: 1,
      system_prompt: data.system_prompt,
      user_prompt_template: data.user_prompt_template,
      variables: data.variables,
      change_notes: 'Initial version',
    })

    clearPromptCache()
    return mapFromDatabase(data)
  } catch (err) {
    log.error('Create exception', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getPromptById,
  getPromptByName,
  getPromptsByCategory,
  getAllPrompts,
  getRenderedPrompt,
  getExtractionPrompt,
  getChatPrompt,
  getOCRPrompt,
  getTypeDetectionPrompt,
  renderTemplate,
  clearPromptCache,
  updatePrompt,
  createPrompt,
}
