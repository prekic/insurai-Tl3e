/**
 * Common Turkish exclusion patterns → English translations
 *
 * Used as a fallback when the AI extraction does not populate `exclusionsEn`.
 * Each key is a lowercase Turkish substring to match against exclusion text.
 * Values are English translations of the full exclusion concept.
 *
 * @module exclusion-translations
 */

/**
 * Map of Turkish exclusion keyword/phrase → English translation.
 * Matched via case-insensitive substring check against each exclusion string.
 * More specific patterns should be listed first (matched in order, first hit wins).
 */
export const EXCLUSION_TR_TO_EN: Array<{ pattern: string; en: string }> = [
  // --- Key-in-ignition / key-left-in-vehicle theft ---
  {
    pattern: 'anahtarla çalışan araçlarda',
    en: 'Theft of vehicles with keys left in the ignition or inside the vehicle is not covered.',
  },
  {
    pattern: 'anahtar üzerinde',
    en: 'Theft when key is left in the ignition is not covered.',
  },
  {
    pattern: 'anahtarın kontak',
    en: 'Theft while key is left in the ignition is not covered.',
  },
  {
    pattern: 'anahtarın araç içerisinde',
    en: 'Theft when key is left inside the vehicle is not covered.',
  },

  // --- Alcohol / substance ---
  {
    pattern: 'alkollü',
    en: 'Damages while driving under the influence of alcohol are not covered.',
  },
  {
    pattern: 'alkol',
    en: 'Damages related to alcohol use are not covered.',
  },
  {
    pattern: 'uyuşturucu',
    en: 'Damages while under the influence of drugs or stimulants are not covered.',
  },
  {
    pattern: 'uyarıcı madde',
    en: 'Damages while under the influence of stimulant substances are not covered.',
  },

  // --- License / driver ---
  {
    pattern: 'ehliyetsiz',
    en: 'Damages caused by driving without a valid license are not covered.',
  },
  {
    pattern: 'ehliyet',
    en: 'Damages involving license-related violations are not covered.',
  },
  {
    pattern: 'yetkisiz sürücü',
    en: 'Damages caused by an unauthorized driver are not covered.',
  },
  {
    pattern: 'belirli sürücü',
    en: 'Only designated drivers are covered; others are excluded.',
  },

  // --- Racing / speed ---
  {
    pattern: 'yarış',
    en: 'Damages during racing, speed tests, or rally events are not covered.',
  },
  {
    pattern: 'hız denemesi',
    en: 'Damages during speed tests are not covered.',
  },
  {
    pattern: 'ralli',
    en: 'Damages during rally events are not covered.',
  },

  // --- Intentional / fraud ---
  {
    pattern: 'kasıtlı',
    en: 'Intentional damages are not covered.',
  },
  {
    pattern: 'kasıt',
    en: 'Deliberate damages are not covered.',
  },
  {
    pattern: 'dolandırıcılık',
    en: 'Insurance fraud is not covered.',
  },

  // --- War / terrorism / unrest ---
  {
    pattern: 'savaş',
    en: 'Damages during war or civil war are not covered.',
  },
  {
    pattern: 'terör',
    en: 'Damages from terrorist acts are not covered (may be covered by special funds).',
  },
  {
    pattern: 'isyan',
    en: 'Damages during riots or civil unrest are not covered.',
  },
  {
    pattern: 'halk hareketleri',
    en: 'Damages during civil disturbances are not covered.',
  },
  {
    pattern: 'grev',
    en: 'Damages during strikes or lockouts are not covered.',
  },

  // --- Nuclear / chemical / biological ---
  {
    pattern: 'nükleer',
    en: 'Nuclear, radiological, or atomic risks are excluded.',
  },
  {
    pattern: 'radyoaktif',
    en: 'Radioactive contamination damages are excluded.',
  },
  {
    pattern: 'kimyasal',
    en: 'Chemical contamination damages are excluded.',
  },
  {
    pattern: 'biyolojik',
    en: 'Biological hazard damages are excluded.',
  },

  // --- Natural disasters ---
  {
    pattern: 'deprem',
    en: 'Earthquake damages are not covered (or covered separately).',
  },
  {
    pattern: 'sel',
    en: 'Flood damages are not covered.',
  },
  {
    pattern: 'su baskını',
    en: 'Water flood damages are not covered.',
  },
  {
    pattern: 'heyelan',
    en: 'Landslide damages are not covered.',
  },
  {
    pattern: 'volkanik',
    en: 'Volcanic eruption damages are not covered.',
  },
  {
    pattern: 'tsunami',
    en: 'Tsunami damages are not covered.',
  },
  {
    pattern: 'doğal afet',
    en: 'Natural disaster damages are not covered.',
  },
  {
    pattern: 'fırtına',
    en: 'Storm damages are not covered.',
  },
  {
    pattern: 'dolu',
    en: 'Hail damages are not covered.',
  },

  // --- Mechanical / wear ---
  {
    pattern: 'mekanik arıza',
    en: 'Mechanical breakdown damages are not covered.',
  },
  {
    pattern: 'yıpranma',
    en: 'Normal wear and tear is not covered.',
  },
  {
    pattern: 'aşınma',
    en: 'Natural wear and deterioration are not covered.',
  },
  {
    pattern: 'bakım',
    en: 'Damages due to lack of maintenance are not covered.',
  },
  {
    pattern: 'lastik patlaması',
    en: 'Tire blowout damages are not covered (unless caused by an accident).',
  },
  {
    pattern: 'elektrik arızası',
    en: 'Electrical malfunction damages are not covered.',
  },

  // --- Theft-related ---
  {
    pattern: 'hırsızlık teşebbüs',
    en: 'Attempted theft damages are not covered.',
  },
  {
    pattern: 'çalınma',
    en: 'Theft-related damages or losses under these conditions are not covered.',
  },
  {
    pattern: 'gasp',
    en: 'Robbery/carjacking under these conditions is not covered.',
  },

  // --- Usage-related ---
  {
    pattern: 'ticari amaç',
    en: 'Damages when vehicle is used for commercial purposes are not covered.',
  },
  {
    pattern: 'kiralama',
    en: 'Damages during vehicle rental are not covered.',
  },
  {
    pattern: 'vale',
    en: 'Damages during valet parking are not covered.',
  },
  {
    pattern: 'aşırı yükleme',
    en: 'Damages due to overloading are not covered.',
  },
  {
    pattern: 'taşıma kapasitesi',
    en: 'Damages due to exceeding carrying capacity are not covered.',
  },

  // --- Pandemic / epidemic ---
  {
    pattern: 'salgın',
    en: 'Damages related to pandemic or epidemic are not covered.',
  },
  {
    pattern: 'pandemi',
    en: 'Pandemic-related indirect damages are not covered.',
  },

  // --- Cyber ---
  {
    pattern: 'siber',
    en: 'Cyber attack or software failure damages are not covered.',
  },

  // --- Coverage scope ---
  {
    pattern: 'teminat kapsamı dışında',
    en: 'This is excluded from coverage scope.',
  },
  {
    pattern: 'teminat dışı',
    en: 'This is outside the scope of coverage.',
  },
  {
    pattern: 'kapsam dışı',
    en: 'This is excluded from coverage.',
  },
  {
    pattern: 'hariçtir',
    en: 'This is excluded.',
  },
  {
    pattern: 'karşılanmaz',
    en: 'This is not covered.',
  },

  // --- Deductible / waiting ---
  {
    pattern: 'muafiyet',
    en: 'Deductible/excess applies to this coverage.',
  },
  {
    pattern: 'bekleme süresi',
    en: 'A waiting period applies before coverage begins.',
  },

  // --- Modification ---
  {
    pattern: 'tadilat',
    en: 'Unauthorized vehicle modifications void coverage.',
  },
  {
    pattern: 'modifikasyon',
    en: 'Unauthorized modifications are not covered.',
  },

  // --- Other ---
  {
    pattern: 'dolaylı zarar',
    en: 'Indirect damages (consequential loss) are not covered.',
  },
  {
    pattern: 'maddi hasar',
    en: 'Property damage under these conditions is not covered.',
  },
  {
    pattern: 'manevi tazminat',
    en: 'Moral/non-pecuniary damages are not covered.',
  },
  {
    pattern: 'değer kaybı',
    en: 'Diminished value (loss of value after repair) is not covered.',
  },
  {
    pattern: 'kişisel eşya',
    en: 'Personal belongings inside the vehicle are not covered.',
  },
]

/**
 * Translate a Turkish exclusion text to English using pattern matching.
 * Returns the English translation if a pattern matches, or null if no match found.
 */
export function translateExclusionToEn(turkishText: string): string | null {
  const lower = turkishText.toLowerCase()
  for (const { pattern, en } of EXCLUSION_TR_TO_EN) {
    if (lower.includes(pattern)) {
      return en
    }
  }
  return null
}

/**
 * Given parallel arrays of exclusions (TR) and exclusionsEn,
 * fill in any gaps in the English array using the pattern-based translator.
 * Returns a new exclusionsEn array with the same length as exclusions.
 */
export function ensureExclusionsEn(exclusions: string[], exclusionsEn?: string[] | null): string[] {
  const en = [...(exclusionsEn || [])]

  for (let i = 0; i < exclusions.length; i++) {
    if (!en[i] || en[i].trim() === '') {
      en[i] = translateExclusionToEn(exclusions[i]) || exclusions[i]
    }
  }

  // Trim to same length as exclusions (in case en was longer from bad AI output)
  return en.slice(0, exclusions.length)
}
