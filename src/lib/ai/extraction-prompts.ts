/**
 * Policy-Type-Specific Extraction Prompts
 *
 * Specialized prompts for each insurance type to extract relevant fields.
 * These augment the base system prompt with type-specific guidance.
 */

import type { PolicyType } from '@/types/policy'

/**
 * Base system prompt used for all policy types
 */
export const BASE_EXTRACTION_PROMPT = `You are an expert insurance document analyst specializing in Turkish insurance policies.

Your task is to extract structured information from insurance policy documents.

## Guidelines:

1. **Language**: Documents may be in Turkish or English. Common Turkish terms:
   - Poliçe = Policy
   - Sigortalı = Insured
   - Sigorta Ettiren = Policyholder
   - Prim = Premium
   - Teminat = Coverage/Guarantee
   - Muafiyet = Deductible/Excess
   - Başlangıç Tarihi = Start Date
   - Bitiş Tarihi = End Date
   - Riziko Adresi = Risk Address

2. **Date Format**:
   - Turkish documents often use DD.MM.YYYY or DD/MM/YYYY
   - Convert ALL dates to YYYY-MM-DD format in your output

3. **Currency Detection** (CRITICAL):
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
     - AUD/CAD/NZD: A$, C$, NZ$
     - SEK/NOK/DKK: kr, Krone/Krona
     - PLN: zł, Zloty
     - RUB: ₽, Ruble
     - KRW: ₩, Won
     - BRL: R$, Real
     - MXN: MX$, Peso
     - ZAR: R, Rand
     - SGD/HKD: S$, HK$
   - **IMPORTANT**:
     - Extract the currency code for EACH monetary value
     - Verify consistency: 99% of policies use ONE currency throughout
     - If mixed currencies (rare), use the currency of premium/main coverage
     - ALWAYS return the 3-letter ISO currency code
     - Default to "TRY" only if no currency indicator found

4. **Confidence Scores**: Rate your confidence (0-1) based on:
   - Clarity of the source text
   - Whether the information was explicitly stated vs inferred
   - Consistency of information across the document

5. **Missing Information**: Use null for fields you cannot confidently extract

6. **Coverage Extraction**:
   - Ana Teminat = Main Coverage
   - Ek Teminatlar = Additional Coverages
   - İsteğe Bağlı = Optional
   - Zorunlu = Mandatory

Be thorough but accurate. It's better to return null than to guess incorrectly.`

/**
 * Policy-type-specific prompt extensions
 */
export const POLICY_TYPE_PROMPTS: Record<PolicyType, string> = {
  kasko: `
## KASKO (Comprehensive Auto Insurance) Specific Fields:

**CRITICAL - Coverage Calculation for Kasko**:
The main coverage for kasko is the VEHICLE VALUE, which is typically shown as:
- "Rayiç Değer" = Current market value of the vehicle
- "Araç Bedeli" = Vehicle value (may be a specific TRY amount)
- "Kasko Kapsamındaki Değerler" section shows the vehicle value

DO NOT sum all the liability limits! The other limits (Mali Sorumluluk, Hukuki Koruma, Ferdi Kaza, etc.) are SEPARATE coverages with their own limits, not added to the main vehicle coverage.

Extract these additional vehicle-specific fields:
- **Vehicle Information**:
  - vehicleMake (Marka): e.g., Toyota, Ford, Volkswagen
  - vehicleModel (Model): e.g., Corolla, Focus, Golf
  - vehicleYear (Model Yılı / Model Bilgisi): Manufacturing year (e.g., 2022)
  - plateNumber (Plaka): Turkish format (e.g., 34 ABC 123)
  - chassisNumber (Şasi No): 17-character VIN
  - engineNumber (Motor No): Engine identification
  - vehicleValue (Araç Değeri): Declared value - this is the MAIN coverage amount
  - usageType (Kullanım Şekli): 'private' (Hususi) or 'commercial' (Ticari)

- **Driver Information**:
  - driverAge (Sürücü Yaşı): Primary driver's age
  - licenseYear (Ehliyet Yılı): Year license was obtained
  - bonusMalus (Hasarsızlık Kademesi): Discount level 1-7 (7 = max discount)

- **Coverage Categories** (IMPORTANT for categorization):
  - category: "main" → Vehicle value (Araç Bedeli, Rayiç Değer)
  - category: "liability" → Artan Mali Sorumluluk, Koltuk Ferdi Kaza
  - category: "supplementary" → Kişisel Eşya, Hatalı Akaryakıt, Mini Onarım
  - category: "assistance" → Asistans, İkame Araç, Anadolu Hizmet
  - category: "legal" → Hukuki Koruma

- **Special Values**:
  - "Sınırsız" = Unlimited → Set isUnlimited=true, limit=null
  - "Rayiç Değer" = Market Value → Set isMarketValue=true, limit=null

- **Depreciation Clause (Eskime Payı / Kıymet Artışı)** (CRITICAL):
  Turkish kasko policies frequently include depreciation clauses that cap the
  age-related reduction applied to parts during repair or total-loss settlement.
  Look for these patterns:
  - "Eskime payı azami %50 ile sınırlıdır" (depreciation capped at 50%)
  - "Eskime payı uygulanır" (depreciation applies)
  - "Kıymet artışı/kazancı dikkate alınmaz" (betterment disregarded)
  - "Yıpranma payı" (wear-and-tear deduction)
  If found, extract as a conditionalDeductible with:
    trigger: "depreciation / eskime payı"
    rate: the percentage cap (e.g., "%50", "%30") or "uygulanır" if uncapped
    evidence: verbatim quote from the policy
  Do NOT put depreciation clauses into exclusions — they are deductible modifiers.

- **Coverage Types to Look For**:
  - Tam Kasko = Full comprehensive (category: main)
  - Mini Kasko = Limited comprehensive
  - Deprem = Earthquake (category: supplementary)
  - Sel/Su Baskını = Flood (category: supplementary)
  - Hırsızlık = Theft (category: supplementary)
  - Cam Kırılması = Glass breakage (category: supplementary)
  - Ferdi Kaza = Personal accident (category: liability). Do NOT collapse sub-limits! Extract Death/Disability, Medical Expenses, Driver, Passenger as separate line items.

- **CRITICAL — Coverage Granularity Rules**:
  - **Ferdi Kaza (Personal Accident) sub-limits**: You MUST extract FOUR separate coverage line items:
    1. "Personal Accident – Death/Disability" (Vefat/Sakatlık) with its per-seat limit (e.g. 500,000)
    2. "Personal Accident – Medical Expenses" (Tedavi Masrafları) with its limit (e.g. 50,000)
    3. "Vehicle-Related Personal Accident" (Araç İçi Ferdi Kaza) with its limit (e.g. 50,000)
    4. "Driver-Related Personal Accident" (Sürücü Ferdi Kaza) with its limit (e.g. 50,000)
    Do NOT collapse these into a single "Personal Accident" line. Each has a different limit.
  - **Strike/Lockout/Civil Commotion/Terror (GLKHHT)**: Extract as a SEPARATE supplementary coverage line item with its own limit (often 100% of sum insured). Do NOT merge into main vehicle coverage.
  - **Natural Disasters**: Extract as a SEPARATE supplementary coverage line item. Look for "Doğal Afetler" or "Deprem/Sel/Fırtına" clauses with their own limits.
  - **Flood/Water Damage (Sel/Su Baskını)**: Extract as a SEPARATE supplementary coverage line item if it has a distinct limit or clause.
  - **Kasa/Tank**: In commercial KASKO, "Kasa" and "Tank" refer to the vehicle's body/tank/trailer structure. Extract as "Body/Tank Coverage" (NOT "Cargo Coverage"). Cargo (emtia) is a separate Nakliyat insurance line.

- **Fleet Detection** (IMPORTANT for AI Insights):
  If the policy contains any of these fleet markers, include a structured insight:
  - "POLİÇE ADET KONTROL KLOZU" (policy count control clause)
  - "filo indirimi" or "filo poliçesi" (fleet discount/policy)
  - "toplu poliçe" (group policy)
  - "Bağlı Pol No" or "bağlı poliçe" (linked/parent policy number)
  - References to a master policy or multiple vehicle schedule
  Count the number of "özel kloz" (special clauses) if visible. Note the fleet size if stated. Mark this as an insight for the reviewer.

- **Exclusion Extraction** (CRITICAL):
  - Do NOT extract standard "General Conditions" (Genel Şartlar) as exclusions, such as "alkollü sürüş" (drunk driving), "ehliyetsiz kullanım" (unauthorized driving), or standard "çekme/kurtarma" (towing) rules unless they are specifically highlighted as extra exclusions beyond standard law.
  - Target specific sections labeled "UYARI", "Teminat Dışında Kalan Haller", "Özel Şartlar", or "Hariç" for true policy-specific exclusions.
  - Return clean, distinct exclusion strings.
  - Asistans / Çekme = Extract as "Towing and Rescue (Domestic)" if it has a specific limit (e.g. 15,000 TL) instead of generic "Asistans".
  - İkame Araç = Replacement vehicle (category: assistance)
  - Artan Mali Sorumluluk = Increased liability (category: liability)
  - Hukuki Koruma = Legal protection (category: legal)
  - Kasa/Tank, Römork = Vehicle accessories/add-ons (category: supplementary). Must be extracted as separate items, do not sum with main vehicle value.

- **Common Turkish Terms**:
  - Araç Sahibi = Vehicle Owner
  - Hasar = Damage/Claim
  - Koltuk Ferdi Kaza = Seat personal accident
  - Ani Hareket = Sudden movement
`,

  traffic: `
## TRAFİK SİGORTASI (Mandatory Traffic Liability) Specific Fields:

Extract these traffic insurance specific fields:
- **Vehicle Information**:
  - vehicleMake (Marka)
  - vehicleModel (Model)
  - vehicleYear (Model Yılı)
  - plateNumber (Plaka)
  - vehicleClass (Araç Türü): 'otomobil', 'minibüs', 'kamyon', 'motosiklet', 'traktör'
  - passengerCount (Yolcu Sayısı): Vehicle passenger capacity
  - usageType (Kullanım): 'özel' (private), 'ticari' (commercial), 'resmi' (official)

- **Liability Limits** (SEDDK 2024 minimums):
  - bodilyInjuryPerPerson (Kişi Başına Bedeni): Min ₺1,200,000
  - bodilyInjuryTotal (Kaza Başına Bedeni): Total bodily injury limit
  - propertyDamageLimit (Maddi Hasar): Min ₺300,000
  - deathBenefitLimit (Vefat): Death benefit limit

- **Coverage Types**:
  - Bedeni Hasar = Bodily injury
  - Maddi Hasar = Property damage
  - Vefat = Death
  - Tedavi Masrafları = Medical expenses
  - Hukuki Koruma = Legal protection

- **Common Turkish Terms**:
  - Trafik Sigortası = Traffic Insurance (MTPL)
  - Zorunlu Mali Sorumluluk = Mandatory liability
  - Üçüncü Şahıs = Third party
`,

  home: `
## KONUT SİGORTASI (Home Insurance) Specific Fields:

Extract these property-specific fields:
- **Property Information**:
  - propertyType (Konut Türü): 'daire' (apartment), 'müstakil' (detached), 'villa', 'residence'
  - constructionType (Yapı Tarzı): 'betonarme' (reinforced concrete), 'yığma' (masonry), 'ahşap' (wood), 'çelik' (steel)
  - constructionYear (İnşaat Yılı): Building construction year
  - totalArea (Metrekare): Total area in m²
  - floorNumber (Kat): Floor number of the unit
  - totalFloors (Toplam Kat): Total floors in building
  - ownershipType (Mülkiyet): 'malik' (owner), 'kiracı' (tenant)

- **Values**:
  - buildingValue (Bina Bedeli): Building/structure value
  - contentsValue (Eşya Bedeli): Contents/belongings value
  - valuablesValue (Kıymetli Eşya): Jewelry, art, etc.

- **Security Features**:
  - hasAlarm (Alarm Sistemi): true/false
  - hasSprinkler (Sprinkler): true/false
  - hasSecurityDoor (Çelik Kapı): true/false
  - hasSecurityCamera (Kamera): true/false
  - is24HourSecurity (24 Saat Güvenlik): true/false

- **Coverage Types**:
  - Yangın = Fire
  - Hırsızlık = Theft
  - Su Hasarı = Water damage
  - Cam Kırılması = Glass breakage
  - Deprem = Earthquake
  - Doğal Afet = Natural disaster
  - Ferdi Kaza = Personal accident
  - Ev Sahibi Mali Sorumluluk = Landlord liability
  - Kiracı Mali Sorumluluk = Tenant liability
  - Enkaz Kaldırma = Debris removal

- **Common Turkish Terms**:
  - Konut = Residence
  - Bina = Building
  - Eşya = Contents
  - Muhteviyat = Belongings
`,

  health: `
## SAĞLIK SİGORTASI (Health Insurance) Specific Fields:

Extract these health insurance specific fields:
- **Beneficiary Information**:
  - beneficiaryCount (Sigortalı Sayısı): Number of covered persons
  - beneficiaryType (Kapsam): 'bireysel' (individual), 'aile' (family), 'grup' (group)
  - primaryAge (Yaş): Primary insured's age
  - dependents (Bakmakla Yükümlüler): Array of dependent info

- **Cost Sharing**:
  - copayPercentage (Katılım Payı %): e.g., 20% means patient pays 20%
  - annualDeductible (Yıllık Muafiyet): Annual deductible amount
  - outOfPocketMax (Azami Katılım): Maximum out-of-pocket per year
  - perVisitCopay (Muayene Katılım): Per-visit copay amount

- **Coverage Limits**:
  - annualLimit (Yıllık Limit): Annual maximum coverage
  - lifetimeLimit (Ömür Boyu Limit): Lifetime maximum
  - hospitalizationLimit (Yatış Limiti): Per-hospitalization limit
  - outpatientLimit (Ayakta Tedavi): Outpatient limit

- **Waiting Periods** (in days):
  - generalWaiting (Genel Bekleme): General waiting period
  - maternityWaiting (Doğum Bekleme): Maternity waiting
  - preExistingWaiting (Mevcut Hastalık): Pre-existing condition waiting

- **Network Information**:
  - networkType (Ağ Tipi): 'geniş' (broad), 'dar' (narrow), 'sınırsız' (unlimited)
  - preferredHospitals (Anlaşmalı Hastaneler): List of network hospitals

- **Coverage Types**:
  - Yatarak Tedavi = Inpatient treatment
  - Ayakta Tedavi = Outpatient treatment
  - Ameliyat = Surgery
  - Doğum = Maternity
  - Diş = Dental
  - Göz = Vision
  - Fizik Tedavi = Physical therapy
  - Check-up = Health screening
  - Psikolojik Destek = Mental health
  - Yurtdışı Tedavi = International treatment
  - Ambulans = Ambulance

- **Common Turkish Terms**:
  - Sağlık Sigortası = Health Insurance
  - Tamamlayıcı = Supplementary
  - Özel Sağlık = Private Health
`,

  life: `
## HAYAT SİGORTASI (Life Insurance) Specific Fields:

Extract these life insurance specific fields:
- **Policy Structure**:
  - policyVariant (Poliçe Türü): 'vadeli' (term), 'ömür boyu' (whole life), 'karma' (endowment), 'yatırım' (investment-linked)
  - termYears (Süre): Policy term in years
  - sumAssured (Sigorta Bedeli): Death benefit amount

- **Beneficiary Information**:
  - primaryBeneficiary (Birinci Lehdar): Primary beneficiary name
  - secondaryBeneficiary (İkinci Lehdar): Contingent beneficiary
  - beneficiaryRelation (Yakınlık): Relationship to insured

- **Premium Details**:
  - regularPremium (Düzenli Prim): Regular premium amount
  - singlePremium (Tek Prim): Single/lump sum premium
  - premiumTerm (Prim Ödeme Süresi): Premium payment period

- **Cash Values**:
  - surrenderValue (İştira Değeri): Current cash surrender value
  - paidUpValue (Tenzil Değeri): Paid-up value
  - loanValue (İkraz Değeri): Policy loan available

- **Riders (Ek Teminatlar)**:
  - hasAccidentalDeath (Kaza Sonucu Vefat): Accidental death benefit
  - hasDisability (Maluliyet): Disability coverage
  - hasCriticalIllness (Kritik Hastalık): Critical illness
  - hasWaiverOfPremium (Primden Muafiyet): Waiver of premium
  - hasHospitalCash (Günlük Hastane): Hospital cash benefit

- **Coverage Types**:
  - Vefat Teminatı = Death benefit
  - Kaza Sonucu Vefat = Accidental death
  - Sürekli Maluliyet = Permanent disability
  - Kritik Hastalık = Critical illness
  - Birikim = Savings/accumulation
  - Yatırım Geliri = Investment returns

- **Common Turkish Terms**:
  - Hayat Sigortası = Life Insurance
  - Birikimli = With savings
  - Koruma Amaçlı = Protection-oriented
  - Lehdar = Beneficiary
`,

  dask: `
## DASK (Zorunlu Deprem Sigortası) Specific Fields:

Extract these earthquake insurance specific fields:
- **Building Information**:
  - buildingClass (Yapı Tarzı): 'A' (reinforced concrete), 'B' (masonry/other)
  - constructionYear (İnşaat Yılı): Year building was constructed
  - totalArea (Brüt Alan m²): Gross area in square meters
  - floorCount (Kat Sayısı): Number of floors in building
  - unitFloor (Daire Katı): Floor of the insured unit
  - buildingAge (Bina Yaşı): Age of building

- **Location Risk**:
  - earthquakeZone (Deprem Bölgesi): Zone 1-5 (1 = highest risk)
  - province (İl): Province name
  - district (İlçe): District name

- **Coverage Details**:
  - coverageLimit (Teminat Tutarı): Coverage amount (has legal maximums)
  - landRegistryInfo (Tapu Bilgileri): Land registry reference
  - apartmentNumber (Bağımsız Bölüm No): Unit/apartment number

- **DASK Specific**:
  - daskPolicyNumber (DASK Poliçe No): Specific DASK policy number
  - tcKimlikNo (TC Kimlik): National ID number
  - buildingType (Bina Türü): 'mesken' (residential), 'işyeri' (commercial)

- **Coverage Includes**:
  - Deprem = Earthquake
  - Deprem Sonucu Yangın = Fire following earthquake
  - Deprem Sonucu İnfilak = Explosion following earthquake
  - Deprem Sonucu Tsunami = Tsunami following earthquake
  - Deprem Sonucu Yer Kayması = Landslide following earthquake

- **Common Turkish Terms**:
  - Zorunlu Deprem Sigortası = Mandatory Earthquake Insurance
  - Bağımsız Bölüm = Independent unit
  - Tapu = Title deed
  - Betonarme = Reinforced concrete
  - Yığma = Masonry
`,

  business: `
## İŞYERİ SİGORTASI (Business Insurance) Specific Fields:

Extract these commercial insurance specific fields:
- **Business Information**:
  - businessType (İşyeri Türü): e.g., 'ofis', 'mağaza', 'restoran', 'fabrika', 'depo'
  - industryCode (Faaliyet Kodu): NACE/business activity code
  - businessName (İşletme Adı): Business/company name
  - taxNumber (Vergi No): Tax identification number
  - employeeCount (Çalışan Sayısı): Number of employees
  - annualRevenue (Yıllık Ciro): Annual revenue/turnover

- **Property Values**:
  - buildingValue (Bina Bedeli): Building/structure value
  - stockValue (Emtia/Stok Bedeli): Inventory/stock value
  - equipmentValue (Makine/Teçhizat): Machinery and equipment value
  - fixturesValue (Demirbaş): Fixtures and furniture value
  - businessInterruption (İş Durması): Business interruption coverage

- **Liability Coverages**:
  - publicLiability (Üçüncü Şahıs Sorumluluk): Public liability limit
  - productLiability (Ürün Sorumluluk): Product liability
  - professionalLiability (Mesleki Sorumluluk): Professional liability
  - employerLiability (İşveren Sorumluluk): Employer's liability

- **Specialty Coverages**:
  - cyberLiability (Siber Sorumluluk): Cyber risk coverage
  - electronicEquipment (Elektronik Cihaz): Electronic equipment
  - machineryBreakdown (Makine Kırılması): Machinery breakdown
  - moneyInsurance (Para Sigortası): Cash/money coverage
  - fidelityInsurance (Güveni Kötüye Kullanma): Employee dishonesty

- **Coverage Types**:
  - Yangın = Fire
  - Hırsızlık = Theft
  - Su Hasarı = Water damage
  - Cam = Glass
  - Deprem = Earthquake
  - Doğal Afetler = Natural disasters
  - İş Durması = Business interruption
  - Kira Kaybı = Loss of rent
  - Enkaz Kaldırma = Debris removal
  - Taşıma = Goods in transit

- **Common Turkish Terms**:
  - İşyeri Paketi = Business package
  - Yangın Sigortası = Fire insurance
  - Tekne-Makine = Hull and machinery
  - Nakliyat = Transportation/marine
`,

  nakliyat: `
## NAKLİYAT SİGORTASI (Transportation/Cargo Insurance) Specific Fields:

Extract these transportation insurance specific fields:
- **Shipment Information**:
  - cargoType (Emtia Türü): Type of goods being transported
  - cargoDescription (Mal Tanımı): Detailed description of cargo
  - cargoValue (Emtia Değeri): Declared value of cargo
  - packagingType (Ambalaj Şekli): Packaging method
  - totalWeight (Toplam Ağırlık): Total weight in kg
  - numberOfPackages (Koli/Paket Sayısı): Number of packages

- **Transport Details**:
  - transportMode (Taşıma Şekli): 'karayolu' (road), 'denizyolu' (sea), 'havayolu' (air), 'demiryolu' (rail), 'kombine' (multimodal)
  - originPoint (Yükleme Yeri): Loading/origin location
  - destinationPoint (Boşaltma Yeri): Unloading/destination location
  - transitCountries (Güzergah Ülkeleri): Countries in transit route
  - voyageNumber (Sefer No): Voyage/trip number
  - vesselName (Gemi/Araç Adı): Name of vessel/vehicle

- **Insurance Scope**:
  - coverageType (Teminat Türü): 'dar' (ICC-C), 'geniş' (ICC-A), 'tam' (All Risks)
  - incoterms (Teslim Şekli): FOB, CIF, CFR, EXW, etc.
  - policyBasis (Poliçe Esası): 'tek sefer' (single), 'abonman' (open policy), 'flotan' (floating)
  - warehouseToWarehouse (Depodan Depoya): true/false

- **Coverage Types**:
  - Emtia Nakliyat = Cargo insurance
  - Kıymet Nakliyat = Valuable goods transportation
  - Taşıyıcı Sorumluluk = Carrier liability (CMR)
  - Navlun = Freight insurance
  - Müşterek Avarya = General average
  - Savaş ve Grev = War and strike risks
  - Depoda Bekleme = Storage risks
  - Yükleme/Boşaltma = Loading/unloading risks
  - Gecikmeden Doğan Zarar = Delay damage

- **ICC Clause Types**:
  - ICC (A) = All Risks (Tüm Riskler)
  - ICC (B) = Limited Named Perils
  - ICC (C) = Minimum Coverage (fire, sinking, collision)

- **Common Turkish Terms**:
  - Nakliyat Sigortası = Transportation/Cargo Insurance
  - Emtia = Goods/Cargo
  - Navlun = Freight
  - Konşimento = Bill of Lading
  - CMR = Road Transport Convention
  - Taşıyıcı = Carrier
  - Gönderen = Shipper/Consignor
  - Alıcı = Consignee
`,
}

/**
 * Get the complete extraction prompt for a specific policy type
 */
export function getExtractionPrompt(policyType?: PolicyType | null): string {
  if (!policyType) {
    // Return base prompt with all type hints if type unknown
    return `${BASE_EXTRACTION_PROMPT}

## Policy Types - Detect and Extract Type-Specific Fields:

The document could be any of these types. First identify the policy type, then extract the relevant fields:

${Object.entries(POLICY_TYPE_PROMPTS)
  .map(([type, prompt]) => `### ${type.toUpperCase()}\n${prompt}`)
  .join('\n\n')}`
  }

  // Return type-specific prompt
  return `${BASE_EXTRACTION_PROMPT}

## Policy Type Detected: ${policyType.toUpperCase()}

${POLICY_TYPE_PROMPTS[policyType]}`
}

/**
 * Get a minimal detection prompt to identify policy type from document
 */
export const POLICY_TYPE_DETECTION_PROMPT = `Analyze this insurance document and determine the policy type.

Look for these indicators:
- KASKO: "Kasko", "Araç", "Plaka", "Şasi No", vehicle-related terms
- TRAFFIC: "Trafik Sigortası", "Zorunlu Mali Sorumluluk", "MTPL"
- HOME: "Konut", "Ev", "Daire", "Bina", residential property terms
- HEALTH: "Sağlık", "Hastane", "Tedavi", medical terms
- LIFE: "Hayat", "Vefat", "Lehdar", beneficiary terms
- DASK: "DASK", "Deprem", "Zorunlu Deprem Sigortası", earthquake terms
- BUSINESS: "İşyeri", "Ticari", "İşletme", business/commercial terms
- NAKLIYAT: "Nakliyat", "Emtia", "Kargo", "Taşımacılık", "CMR", "Konşimento", "Navlun", transportation/cargo terms

Return ONLY the policy type as a single word: kasko, traffic, home, health, life, dask, business, or nakliyat`
