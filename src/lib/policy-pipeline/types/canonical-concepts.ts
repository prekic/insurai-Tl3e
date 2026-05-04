/**
 * Canonical Coverage Concepts
 *
 * The single source of truth for coverage concept identifiers.
 * Every coverage item extracted by the LLM must canonicalize to one of these
 * concepts. The concept determines the user-facing label (TR/EN), eliminating
 * paraphrasing variance entirely.
 *
 * Add new concepts here when a genuinely new coverage type appears in the
 * Turkish KASKO market. Each concept must have a corresponding entry in
 * CONCEPT_DISPLAY_LABELS below.
 */

// ─── Core Concept Union ───────────────────────────────────────────────────────

export type CanonicalCoverageConcept =
  // Main vehicle coverage
  | 'MAIN_KASKO_COVERAGE'
  // Liability
  | 'EXCESS_LIABILITY'
  | 'MORAL_DAMAGES_LIABILITY'
  // Personal accident
  | 'PERSONAL_ACCIDENT_DEATH'
  | 'PERSONAL_ACCIDENT_DISABILITY'
  | 'PERSONAL_ACCIDENT_MEDICAL'
  | 'SEAT_PERSONAL_ACCIDENT_DEATH'
  | 'SEAT_PERSONAL_ACCIDENT_DISABILITY'
  | 'SEAT_PERSONAL_ACCIDENT_MEDICAL'
  // Property
  | 'PERSONAL_BELONGINGS'
  | 'AUDIO_VISUAL_DEVICES'
  // Services
  | 'ROADSIDE_ASSISTANCE'
  | 'REPLACEMENT_VEHICLE'
  | 'MINI_REPAIR'
  // Glass
  | 'GLASS_DAMAGE_PROTECTION'
  // Legal protection
  | 'LEGAL_PROTECTION'
  | 'LEGAL_PROTECTION_BAIL'
  | 'LEGAL_PROTECTION_ADVANCE'
  | 'LEGAL_PROTECTION_PER_EVENT'
  | 'LEGAL_PROTECTION_ANNUAL_AGGREGATE'
  // Supplementary coverages
  | 'TANK_BODY_COVERAGE'
  | 'WRONG_FUEL'
  | 'LOCK_REPLACEMENT'
  | 'PET_INJURY'
  | 'KEY_ACQUISITION_THEFT'
  | 'INFLATION_PROTECTION'
  | 'BETTERMENT_DEDUCTION_EXCEPTION'
  | 'RODENT_DAMAGE'
  | 'NEW_FOR_OLD_REPLACEMENT'
  | 'NCD_PROTECTION'
  // Natural disasters & civil unrest
  | 'NATURAL_DISASTERS'
  | 'FLOOD_WATER_DAMAGE'
  | 'STRIKE_LOCKOUT_TERROR'
  | 'EARTHQUAKE'
  | 'MALICIOUS_ACTS'
  // Misc
  | 'UNAUTHORIZED_TOWING'
  | 'CIGARETTE_DAMAGE'
  | 'ADDITIONAL_EQUIPMENT'
  | 'VOLUNTARY_THIRD_PARTY_LIABILITY'
  // Fallback
  | 'UNKNOWN'

// ─── Display Labels ───────────────────────────────────────────────────────────

export interface ConceptDisplayLabels {
  readonly tr: string
  readonly en: string
}

/**
 * Deterministic display labels for every concept.
 * ValidatedCoverageItem.labelDisplayTR/EN is looked up from this map —
 * NOT from the LLM output. This is the mechanism that eliminates
 * "Comprehensive Coverage" vs "Market Value Coverage" oscillation.
 */
export const CONCEPT_DISPLAY_LABELS: Readonly<
  Record<CanonicalCoverageConcept, ConceptDisplayLabels>
> = {
  // Main
  MAIN_KASKO_COVERAGE: { tr: 'Kasko Teminatı', en: 'Kasko Coverage' },
  // Liability
  EXCESS_LIABILITY: { tr: 'Artan Mali Sorumluluk', en: 'Excess Liability' },
  MORAL_DAMAGES_LIABILITY: { tr: 'Manevi Tazminat', en: 'Moral Damages Liability' },
  // Personal accident – driver
  PERSONAL_ACCIDENT_DEATH: { tr: 'Ferdi Kaza - Vefat', en: 'Personal Accident - Death' },
  PERSONAL_ACCIDENT_DISABILITY: {
    tr: 'Ferdi Kaza - Sürekli Sakatlık',
    en: 'Personal Accident - Permanent Disability',
  },
  PERSONAL_ACCIDENT_MEDICAL: {
    tr: 'Ferdi Kaza - Tedavi',
    en: 'Personal Accident - Medical Treatment',
  },
  // Personal accident – seat/passenger
  SEAT_PERSONAL_ACCIDENT_DEATH: {
    tr: 'Koltuk Ferdi Kaza - Vefat',
    en: 'Seat Personal Accident - Death',
  },
  SEAT_PERSONAL_ACCIDENT_DISABILITY: {
    tr: 'Koltuk Ferdi Kaza - Sürekli Sakatlık',
    en: 'Seat Personal Accident - Permanent Disability',
  },
  SEAT_PERSONAL_ACCIDENT_MEDICAL: {
    tr: 'Koltuk Ferdi Kaza - Tedavi',
    en: 'Seat Personal Accident - Medical Treatment',
  },
  // Property
  PERSONAL_BELONGINGS: { tr: 'Kişisel Eşya', en: 'Personal Belongings' },
  AUDIO_VISUAL_DEVICES: {
    tr: 'Ses, Görüntü ve İletişim Cihazları',
    en: 'Audio, Visual and Communication Devices',
  },
  // Services
  ROADSIDE_ASSISTANCE: { tr: 'Yol Yardım', en: 'Roadside Assistance' },
  REPLACEMENT_VEHICLE: { tr: 'İkame Araç', en: 'Replacement Vehicle' },
  MINI_REPAIR: { tr: 'Mini Onarım', en: 'Mini Repair Service' },
  // Glass
  GLASS_DAMAGE_PROTECTION: { tr: 'Cam Kırılması', en: 'Glass Damage Protection' },
  // Legal protection
  LEGAL_PROTECTION: { tr: 'Hukuksal Koruma', en: 'Legal Protection' },
  LEGAL_PROTECTION_BAIL: { tr: 'Hukuksal Koruma - Kefalet', en: 'Legal Protection - Bail' },
  LEGAL_PROTECTION_ADVANCE: { tr: 'Hukuksal Koruma - Avans', en: 'Legal Protection - Advance' },
  LEGAL_PROTECTION_PER_EVENT: {
    tr: 'Hukuksal Koruma - Olay Başına',
    en: 'Legal Protection - Per Event',
  },
  LEGAL_PROTECTION_ANNUAL_AGGREGATE: {
    tr: 'Hukuksal Koruma - Yıllık Toplam',
    en: 'Legal Protection - Annual Aggregate',
  },
  // Supplementary
  TANK_BODY_COVERAGE: { tr: 'Depo ve Kasa Teminatı', en: 'Tank Body Coverage' },
  WRONG_FUEL: { tr: 'Yanlış Yakıt', en: 'Wrong Fuel Filling' },
  LOCK_REPLACEMENT: { tr: 'Kilit Mekanizması Değişimi', en: 'Lock Mechanism Replacement' },
  PET_INJURY: { tr: 'Evcil Hayvan Tedavisi', en: 'Pet Injury Treatment' },
  KEY_ACQUISITION_THEFT: {
    tr: 'Anahtar Ele Geçirme Yoluyla Hırsızlık',
    en: 'Theft by Key Acquisition',
  },
  INFLATION_PROTECTION: { tr: 'Enflasyon Koruma', en: 'Inflation Protection' },
  BETTERMENT_DEDUCTION_EXCEPTION: {
    tr: 'Eskime Payı İndirimi Muafiyeti',
    en: 'No Betterment Deduction Exception',
  },
  RODENT_DAMAGE: { tr: 'Kemirgen ve Hayvan Hasarı', en: 'Rodent and Animal Damage' },
  NEW_FOR_OLD_REPLACEMENT: { tr: 'Yenisiyle Değiştirme', en: 'New For Old Replacement' },
  NCD_PROTECTION: { tr: 'Hasarsızlık İndirimi Koruma', en: 'No-Claim Discount Protection' },
  // Natural disasters
  NATURAL_DISASTERS: { tr: 'Doğal Afetler', en: 'Natural Disasters' },
  FLOOD_WATER_DAMAGE: { tr: 'Sel ve Su Baskını', en: 'Flood and Water Damage' },
  STRIKE_LOCKOUT_TERROR: { tr: 'Grev, Lokavt, Terör', en: 'Strike, Lockout and Terror' },
  EARTHQUAKE: { tr: 'Deprem', en: 'Earthquake' },
  MALICIOUS_ACTS: { tr: 'Kötü Niyetli Hareketler', en: 'Malicious Acts' },
  // Misc
  UNAUTHORIZED_TOWING: { tr: 'İzinsiz Çekme Hasarı', en: 'Unauthorized Towing Damage' },
  CIGARETTE_DAMAGE: {
    tr: 'Sigara ve Benzeri Madde Hasarı',
    en: 'Cigarette and Similar Substance Damage',
  },
  ADDITIONAL_EQUIPMENT: { tr: 'Ek Donanım / Aksesuar', en: 'Additional Equipment / Accessories' },
  VOLUNTARY_THIRD_PARTY_LIABILITY: {
    tr: 'İhtiyari Mali Sorumluluk',
    en: 'Voluntary Third Party Liability',
  },
  // Fallback
  UNKNOWN: { tr: 'Bilinmeyen Teminat', en: 'Unknown Coverage' },
} as const

/**
 * Get the deterministic display label for a concept.
 * Returns Turkish and English labels that are always the same
 * regardless of what the LLM originally said.
 */
export function getConceptLabels(concept: CanonicalCoverageConcept): ConceptDisplayLabels {
  return CONCEPT_DISPLAY_LABELS[concept]
}

/**
 * Type guard for canonical coverage concepts.
 */
export function isCanonicalConcept(value: string): value is CanonicalCoverageConcept {
  return value in CONCEPT_DISPLAY_LABELS
}
