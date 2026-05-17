import { CanonicalCoverageConcept } from '../types/canonical-concepts.js'
import { normalizeCoverageLabel } from './normalize-text.js'

export class UnmatchedCoverageLabelError extends Error {
  public label: string
  constructor(label: string) {
    super(`Unmatched coverage label: "${label}"`)
    this.name = 'UnmatchedCoverageLabelError'
    this.label = label
  }
}

/**
 * Maps a raw coverage label (EN or TR) to its CanonicalCoverageConcept.
 * Uses priority-based matching with fallback to a dictionary of 188 unique normalized labels.
 *
 * @param rawLabel - The original string from the LLM or policy text
 * @param strictMode - If true, throws UnmatchedCoverageLabelError on UNKNOWN. False by default.
 * @returns CanonicalCoverageConcept
 */
export function canonicalizeCoverage(
  rawLabel: string | null | undefined,
  strictMode = false
): CanonicalCoverageConcept {
  if (!rawLabel) return 'UNKNOWN'

  const normalized = normalizeCoverageLabel(rawLabel)
  // Because toLocaleLowerCase('tr-TR') turns 'I' into 'ı', English words like 'Items', 'Inflation'
  // become 'ıtems', 'ınflation'. We create a normalizedEn variable to safely check English terms.
  const normalizedEn = normalized.replace(/ı/g, 'i')

  // 1. Precise Priority Matches
  if (normalized.includes('avans') || normalizedEn.includes('advance'))
    return 'LEGAL_PROTECTION_ADVANCE'
  if (normalized.includes('kefalet') || normalizedEn.includes('bail'))
    return 'LEGAL_PROTECTION_BAIL'
  if (
    normalized.includes('yıllık') ||
    normalizedEn.includes('annual') ||
    normalized.includes('süresi içinde') ||
    normalizedEn.includes('aggregate') ||
    normalizedEn.includes('insurance period')
  )
    return 'LEGAL_PROTECTION_ANNUAL_AGGREGATE'
  if (normalized.includes('olay başı') || normalizedEn.includes('per event'))
    return 'LEGAL_PROTECTION_PER_EVENT'
  if (normalized === 'hukuksal koruma' || normalizedEn === 'legal protection')
    return 'LEGAL_PROTECTION'

  // Basic kasko coverages that LLM outputs in English
  if (
    normalizedEn.includes('collision') ||
    normalizedEn.includes('comprehensive') ||
    normalizedEn.includes('kasko coverage')
  )
    return 'MAIN_KASKO_COVERAGE'

  if (
    normalizedEn.includes('fires') ||
    normalizedEn.includes('fire damage') ||
    normalized === 'yangın' ||
    normalized === 'fire'
  )
    return 'FIRE' // needs concept pair, fallback okay

  if (normalized === 'hırsızlık' || normalizedEn === 'theft') return 'THEFT'

  if (
    normalizedEn.includes('third party liability') ||
    normalizedEn.includes('third party') ||
    normalized.includes('üçüncü şahıs') ||
    normalized.includes('ucuncu sahis')
  )
    return 'THIRD_PARTY_LIABILITY'

  if (
    normalized.includes('ölüm') ||
    normalized.includes('vefat') ||
    normalizedEn.includes('death')
  ) {
    if (
      normalized.includes('koltuk') ||
      normalized.includes('sürücü') ||
      normalized.includes('yolcu') ||
      normalizedEn.includes('seat') ||
      normalizedEn.includes('driver') ||
      normalizedEn.includes('passenger')
    )
      return 'SEAT_PERSONAL_ACCIDENT_DEATH'
    return 'PERSONAL_ACCIDENT_DEATH'
  }
  if (normalized.includes('sakatlık') || normalizedEn.includes('disability')) {
    if (
      normalized.includes('koltuk') ||
      normalized.includes('sürücü') ||
      normalized.includes('yolcu') ||
      normalizedEn.includes('seat') ||
      normalizedEn.includes('driver') ||
      normalizedEn.includes('passenger')
    )
      return 'SEAT_PERSONAL_ACCIDENT_DISABILITY'
    return 'PERSONAL_ACCIDENT_DISABILITY'
  }
  if (normalized.includes('tedavi') || normalizedEn.includes('medical')) {
    if (
      normalized.includes('koltuk') ||
      normalized.includes('sürücü') ||
      normalized.includes('yolcu') ||
      normalizedEn.includes('seat') ||
      normalizedEn.includes('driver') ||
      normalizedEn.includes('passenger')
    )
      return 'SEAT_PERSONAL_ACCIDENT_MEDICAL'
    return 'PERSONAL_ACCIDENT_MEDICAL'
  }

  // AXA-specific patterns — must be before the generic 'sürücü'/'driver' catch-all below
  // which would otherwise match 'Sürücüye Bağlı' / 'Driver Personal Accident' as
  // SEAT_PERSONAL_ACCIDENT_DEATH
  if (normalized.includes('sürücüye bağlı')) return 'DRIVER_PERSONAL_ACCIDENT'
  if (normalized.includes('motorlu araca bağlı')) return 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'
  if (normalized.includes('kasa') && (normalized.includes('tank') || normalized.includes('depo')))
    return 'TANK_BODY_COVERAGE'
  if (normalized.includes('eksik aşkın') || normalized.includes('excess insurance'))
    return 'EXCESS_INSURANCE'
  // English variants (LLM may output these)
  if (normalizedEn.includes('driver personal accident') || normalizedEn.includes('driver-attached'))
    return 'DRIVER_PERSONAL_ACCIDENT'
  if (
    normalizedEn.includes('personal accident attached') ||
    normalizedEn.includes('attached to motor vehicle') ||
    normalizedEn.includes('vehicle-attached')
  )
    return 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'
  if (
    normalizedEn.includes('body/tank') ||
    (normalizedEn.includes('body') && normalizedEn.includes('tank'))
  )
    return 'TANK_BODY_COVERAGE'
  if (
    normalizedEn.includes('underinsurance') ||
    normalizedEn.includes('overinsurance') ||
    normalizedEn.includes('excess insurance')
  )
    return 'EXCESS_INSURANCE'

  // Catch general driver/passenger without explicit death/disability
  if (
    normalized.includes('sürücü') ||
    normalized.includes('yolcu') ||
    normalizedEn.includes('driver') ||
    normalizedEn.includes('passenger')
  ) {
    return 'SEAT_PERSONAL_ACCIDENT_DEATH'
  }

  // 2. Exact/Contains Dictionary
  if (
    normalized.includes('artan mali sorumluluk') ||
    normalizedEn.includes('excess liability') ||
    normalizedEn.includes('excess third party liability')
  ) {
    if (normalized.includes('manevi') || normalizedEn.includes('moral'))
      return 'MORAL_DAMAGES_LIABILITY'
    if (normalized.includes('kombine') || normalizedEn.includes('combined'))
      return 'EXCESS_LIABILITY'
    return 'EXCESS_LIABILITY'
  }

  if (
    normalized.includes('kişisel eşya') ||
    normalizedEn.includes('personal belongings') ||
    normalizedEn.includes('personal items') ||
    normalizedEn.includes('personal property') ||
    normalizedEn.includes('personal effects')
  ) {
    return 'PERSONAL_BELONGINGS'
  }

  if (
    normalized.includes('genişletilmiş kasko') ||
    normalizedEn.includes('comprehensive kasko') ||
    normalized === 'kasko' ||
    normalizedEn.includes('vehicle coverage') ||
    normalizedEn.includes('comprehensive coverage') ||
    normalizedEn.includes('comprehensive vehicle coverage')
  ) {
    return 'MAIN_KASKO_COVERAGE'
  }

  if (normalized.includes('mini onarım') || normalizedEn.includes('mini repair'))
    return 'MINI_REPAIR'

  if (
    normalized.includes('yetkili olmayan') ||
    normalizedEn.includes('unauthorized towing') ||
    normalized.includes('yetkisiz') ||
    (normalizedEn.includes('towed') && normalizedEn.includes('unauthorized'))
  )
    return 'UNAUTHORIZED_TOWING'

  if (
    normalized.includes('asistans') ||
    normalizedEn.includes('assistance') ||
    normalized.includes('anadolu hizmet')
  ) {
    if (normalized.includes('yol') || normalizedEn.includes('roadside'))
      return 'ROADSIDE_ASSISTANCE'
    return 'ROADSIDE_ASSISTANCE'
  }

  if (normalized.includes('sigara') || normalizedEn.includes('cigarette')) return 'CIGARETTE_DAMAGE'

  if (normalized.includes('deprem') || normalizedEn.includes('earthquake')) {
    if (
      normalized.includes('heyelan') ||
      normalized.includes('fırtına') ||
      normalized.includes('dolu') ||
      normalized.includes('yıldırım') ||
      normalizedEn.includes('landslide') ||
      normalizedEn.includes('storm')
    )
      return 'NATURAL_DISASTERS'
    if (normalized.includes('yanardağ') || normalizedEn.includes('volcanic')) return 'EARTHQUAKE'
    if (normalized.includes('sel')) return 'NATURAL_DISASTERS'
    return 'EARTHQUAKE'
  }

  if (
    normalized.includes('heyelan') ||
    normalized.includes('fırtına') ||
    normalized.includes('dolu') ||
    normalized.includes('yıldırım') ||
    normalizedEn.includes('landslide') ||
    normalizedEn.includes('storm')
  ) {
    return 'NATURAL_DISASTERS'
  }

  if (normalized === 'doğal afetler' || normalizedEn === 'natural disasters') {
    return 'NATURAL_DISASTERS'
  }

  if (
    normalized.includes('sel') ||
    normalized.includes('su baskını') ||
    normalizedEn.includes('flood') ||
    normalizedEn.includes('water')
  ) {
    return 'FLOOD_WATER_DAMAGE'
  }

  if (normalized.includes('cam') || normalizedEn.includes('glass')) return 'GLASS_DAMAGE_PROTECTION'

  if (normalized.includes('anahtar') || normalizedEn.includes('key')) {
    if (normalized.includes('kaybı') || normalizedEn.includes('loss')) return 'LOCK_REPLACEMENT'
    if (
      normalized.includes('çalınma') ||
      normalizedEn.includes('theft') ||
      normalized.includes('ele geçirme') ||
      normalizedEn.includes('acquisition')
    )
      return 'KEY_ACQUISITION_THEFT'
    if (normalized.includes('kilit') || normalizedEn.includes('lock')) return 'LOCK_REPLACEMENT'
    return 'LOCK_REPLACEMENT'
  }

  if (
    normalized.includes('kilit') ||
    normalizedEn.includes('lock mechanism') ||
    normalizedEn.includes('lock replacement')
  )
    return 'LOCK_REPLACEMENT'

  if (
    normalized.includes('manevi') ||
    normalizedEn.includes('moral damages') ||
    normalizedEn.includes('moral compensation') ||
    normalizedEn.includes('moral')
  )
    return 'MORAL_DAMAGES_LIABILITY'

  if (
    normalized.includes('ikame') ||
    normalized.includes('kiralık') ||
    normalizedEn.includes('replacement vehicle') ||
    normalizedEn.includes('rental car')
  )
    return 'REPLACEMENT_VEHICLE'

  if (
    normalized.includes('kemirgen') ||
    normalized.includes('vahşi') ||
    normalized.includes('hayvan') ||
    normalizedEn.includes('rodent') ||
    normalizedEn.includes('animal')
  ) {
    if (normalized.includes('evcil') || normalizedEn.includes('pet')) return 'PET_INJURY'
    return 'RODENT_DAMAGE'
  }
  if (normalized.includes('evcil') || normalizedEn.includes('pet')) return 'PET_INJURY'

  if (
    normalized.includes('terör') ||
    normalizedEn.includes('terror') ||
    normalized.includes('grev') ||
    normalizedEn.includes('strike') ||
    normalized.includes('lokavt') ||
    normalizedEn.includes('lockout') ||
    normalized.includes('halk hareketleri') ||
    normalizedEn.includes('civil commotion') ||
    normalizedEn.includes('riot') ||
    normalizedEn.includes('public movements')
  ) {
    return 'STRIKE_LOCKOUT_TERROR'
  }

  if (normalized.includes('ihtiyari') || normalizedEn.includes('voluntary'))
    return 'VOLUNTARY_THIRD_PARTY_LIABILITY'

  if (normalized.includes('enflasyon') || normalizedEn.includes('inflation'))
    return 'INFLATION_PROTECTION'

  if (
    normalized.includes('kıymet kazanma') ||
    normalizedEn.includes('betterment') ||
    normalized.includes('eskime payı')
  )
    return 'BETTERMENT_DEDUCTION_EXCEPTION'

  if (
    normalized.includes('donanım') ||
    normalized.includes('aksesuar') ||
    normalizedEn.includes('equipment') ||
    normalizedEn.includes('accessories')
  )
    return 'ADDITIONAL_EQUIPMENT'

  if (
    normalized.includes('ses') ||
    normalized.includes('görüntü') ||
    normalizedEn.includes('audio') ||
    normalizedEn.includes('visual')
  )
    return 'AUDIO_VISUAL_DEVICES'

  if (normalized.includes('kötü niyetli') || normalizedEn.includes('malicious'))
    return 'MALICIOUS_ACTS'

  if (
    normalized.includes('hasarsızlık') ||
    normalizedEn.includes('no-claim') ||
    normalizedEn.includes('no claim')
  )
    return 'NCD_PROTECTION'

  if (
    normalized.includes('hatalı') ||
    normalized.includes('yanlış') ||
    normalizedEn.includes('wrong fuel')
  )
    return 'WRONG_FUEL'

  if (
    normalized.includes('çekme') ||
    normalized.includes('kurtarma') ||
    normalizedEn.includes('towing and recovery') ||
    normalizedEn.includes('towing')
  )
    return 'ROADSIDE_ASSISTANCE'

  if (normalized.includes('rayiç değer') || normalizedEn.includes('market value'))
    return 'MAIN_KASKO_COVERAGE'

  // AXA-specific assistance services (mapped to canonical concepts)
  // Note: LLM may output in English (e.g. 'Roadside Repair') or Turkish ('Yol Kenarında Onarım')
  // We check both normalized (TR locale) and normalizedEn (English safe variant)
  if (normalized.includes('aracın teslim') || normalizedEn.includes('vehicle retrieval'))
    return 'VEHICLE_PICKUP_DELIVERY'
  if (
    normalized.includes('emanet') ||
    normalized.includes('muhafaza') ||
    normalizedEn.includes('vehicle custody') ||
    (normalizedEn.includes('vehicle') && normalizedEn.includes('safekeeping'))
  )
    return 'VEHICLE_SAFEKEEPING'
  if (
    normalized.includes('araç bilgi hattı') ||
    normalizedEn.includes('vehicle information hotline') ||
    normalizedEn.includes('vehicle info')
  )
    return 'VEHICLE_INFORMATION_HOTLINE'
  if (normalized.includes('yol kenarında onarım') || normalizedEn.includes('roadside repair'))
    return 'ROADSIDE_REPAIR'
  if (
    normalized.includes('yedek parç') ||
    normalized.includes('spare part') ||
    normalizedEn.includes('unavailable spare parts') ||
    normalizedEn.includes('spare parts supply')
  )
    return 'UNAVAILABLE_SPARE_PARTS'
  if (
    normalized.includes('refakatç') ||
    normalizedEn.includes('escort transport') ||
    normalizedEn.includes('companion transport')
  )
    return 'ESCORT_TRANSPORT_ACCOMMODATION'
  if (
    normalized.includes('cenaze') ||
    normalizedEn.includes('funeral transport') ||
    normalizedEn.includes('funeral')
  )
    return 'FUNERAL_TRANSPORT'
  if (
    normalized.includes('bilgi ve organizasyon') ||
    normalizedEn.includes('information and organization')
  )
    return 'INFORMATION_ORGANIZATION_SERVICES'
  if (
    (normalized.includes('konaklama') && normalized.includes('arızalanma')) ||
    (normalized.includes('konaklama') && normalized.includes('kaza')) ||
    normalizedEn.includes('accommodation and travel') ||
    normalizedEn.includes('travel and accommodation')
  )
    return 'BREAKDOWN_OR_ACCIDENT_TRAVEL_ACCOMMODATION'
  if (
    normalized.includes('lastik') ||
    normalizedEn.includes('tire change') ||
    normalizedEn.includes('tyre change') ||
    normalizedEn.includes('tire replacement') ||
    normalizedEn.includes('tyre replacement')
  )
    return 'TIRE_CHANGE'
  if (normalized.includes('çilingir') || normalizedEn.includes('locksmith'))
    return 'LOCKSMITH_SERVICE'

  if (strictMode) {
    throw new UnmatchedCoverageLabelError(rawLabel)
  }

  return 'UNKNOWN'
}
