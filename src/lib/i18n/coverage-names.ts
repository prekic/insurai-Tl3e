/**
 * Coverage name translations: English → Turkish
 *
 * This is the canonical source of coverage name translations.
 * Used by:
 * - policy-extractor.ts to set nameTr at extraction time
 * - translations.ts for the i18n coverageNames section
 *
 * When adding new coverage names, add them here — they'll automatically
 * be available at both extraction time and display time.
 */
export const COVERAGE_NAMES_EN_TO_TR: Record<string, string> = {
  // Comprehensive / Main
  'Comprehensive Coverage': 'Kasko Ana Teminatı',
  'Comprehensive Auto Insurance': 'Kasko Ana Teminatı',
  'Motor Own Damage': 'Kasko Ana Teminatı',
  'Vehicle Market Value': 'Araç Piyasa Değeri',
  'Extended Liability Insurance': 'İhtiyari Mali Mesuliyet',

  // Collision
  Collision: 'Çarpma/Çarpışma',
  'Collision Damage': 'Çarpma/Çarpışma',
  'Collision Coverage': 'Çarpma/Çarpışma Teminatı',

  // Theft
  Theft: 'Hırsızlık',
  'Theft Protection': 'Hırsızlık Koruması',

  // Fire
  Fire: 'Yangın',
  'Fire Coverage': 'Yangın Teminatı',

  // Natural Disasters
  'Natural Disasters': 'Doğal Afetler',
  'Natural Disaster': 'Doğal Afet',
  Flood: 'Sel/Su Baskını',
  'Storm/Flood': 'Fırtına/Sel',
  Earthquake: 'Deprem',
  Hail: 'Dolu',
  Storm: 'Fırtına',
  'Water Damage': 'Su Hasarı',

  // Liability
  'Extended Liability': 'İhtiyari Mali Mesuliyet',
  'Extended Third Party Liability': 'İhtiyari Mali Mesuliyet',
  'Extended Liability Moral Compensation': 'Manevi Tazminat',
  'Increased Liability': 'Artan Mali Sorumluluk',
  'Third Party Liability': 'Üçüncü Şahıs Mali Sorumluluk',
  'Third Party Property Damage': 'Üçüncü Şahıs Maddi Hasar',
  'Third Party Bodily Injury': 'Üçüncü Şahıs Bedeni Hasar',
  'Moral Damages': 'Manevi Tazminat',
  Liability: 'Sorumluluk',

  // Personal Accident
  'Personal Accident': 'Ferdi Kaza',
  'Personal Accident Death': 'Ferdi Kaza - Vefat',
  'Personal Accident - Death': 'Ferdi Kaza - Vefat',
  'Personal Accident - Permanent Disability': 'Ferdi Kaza - Sürekli Sakatlık',
  'Personal Accident Permanent Disability': 'Ferdi Kaza - Sürekli Sakatlık',
  'Personal Accident - Medical Expenses': 'Ferdi Kaza - Tedavi Masrafları',
  'Driver Personal Accident': 'Sürücü Ferdi Kaza',
  'Seat Personal Accident': 'Koltuk Ferdi Kaza',
  'Seat PA - Death': 'Koltuk Ferdi Kaza - Vefat',
  'Seat PA - Permanent Disability': 'Koltuk Ferdi Kaza - Sürekli Sakatlık',
  'Seat PA - Medical': 'Koltuk Ferdi Kaza - Tedavi',
  'Accidental Death': 'Kaza Sonucu Vefat',
  'Permanent Disability': 'Sürekli Sakatlık',
  'Death Benefit': 'Vefat Teminatı',
  'Critical Illness': 'Kritik Hastalık',

  // Personal Belongings
  'Personal Belongings': 'Kişisel Eşya',
  'Personal Effects': 'Kişisel Eşya',

  // Glass
  'Glass Coverage': 'Cam Kırılması',
  'Glass Breakage': 'Cam Kırılması',
  Windscreen: 'Ön Cam',

  // Misc Auto
  'Key Loss': 'Anahtar Kaybı',
  'Key Replacement': 'Anahtar Değişimi',
  'Wrong Fuel': 'Hatalı Akaryakıt',
  'Tire Damage': 'Lastik Hasarı',

  // Property
  Contents: 'Eşya',
  'Rent Loss': 'Kira Kaybı',

  // Assistance
  'Road Assistance': 'Yol Yardım',
  'Roadside Assistance': 'Yol Yardım',
  'Roadside Assist': 'Yol Yardım',
  Towing: 'Çekici Hizmeti',
  'Towing Service': 'Çekici Hizmeti',
  'Replacement Vehicle': 'İkame Araç',
  'Rental Car': 'Kiralık Araç',
  'Anadolu Service': 'Anadolu Hizmet Paketi',
  'Anadolu Servis': 'Anadolu Hizmet Paketi',
  'Mini Repair Service': 'Mini Onarım',
  'Mini Repair': 'Mini Onarım',
  'Excess Liability': 'İhtiyari Mali Mesuliyet',
  'Excess Liability Moral Compensation': 'İhtiyari Mali Mesuliyet Manevi Tazminat',
  'Seat Personal Accident - Death': 'Koltuk Ferdi Kaza - Vefat',
  'Seat Personal Accident - Permanent Disability': 'Koltuk Ferdi Kaza - Sürekli Sakatlık',
  'Personal Items': 'Kişisel Eşya',

  // Legal
  'Legal Protection': 'Hukuksal Koruma',
  'Legal Expenses': 'Hukuki Masraflar',
  'Bail Advance': 'Kefalet Avansı',

  // Health
  Hospitalization: 'Yatarak Tedavi',
  Outpatient: 'Ayakta Tedavi',
  Surgery: 'Ameliyat',
  'Prescription Drugs': 'İlaç',
  Maternity: 'Doğum',
  Dental: 'Diş',
  Optical: 'Göz',
  'Emergency Abroad': 'Yurtdışı Acil',
  'Medical Expenses': 'Tedavi Masrafları',
  'Emergency Treatment': 'Acil Tedavi',
  'Hospitalization Daily Benefit': 'Günlük Hastane Yardımı',

  // Business
  'Building Damage': 'Bina Hasarı',
  'Business Interruption': 'İş Durması',
  Equipment: 'Makine Kırılması',
  'Employee Injury': 'İşçi Kazası',
  Cyber: 'Siber',

  // Cargo / Nakliyat
  'Cargo Damage - All Risks (ICC-A)': 'Emtia Hasarı - Tüm Riskler',
  'Loading/Unloading Damage': 'Yükleme/Boşaltma Hasarı',
  'Natural Perils': 'Doğal Afetler',
  'Storage Risk': 'Depoda Bekleme Riski',
  'General Average': 'Müşterek Avarya',
  'War and Strikes (optional)': 'Savaş ve Grev (isteğe bağlı)',
  'Carrier Liability (CMR)': 'Taşıyıcı Sorumluluğu (CMR)',

  // Value Types
  'Market Value': 'Rayiç Değer',
  'Vehicle Value': 'Araç Bedeli',
  'Agreed Value': 'Mutabakatlı Değer',
}

/**
 * Look up the Turkish translation for a coverage name.
 * Tries exact match first, then case-insensitive match.
 * Returns null if no translation found.
 */
export function lookupCoverageNameTr(englishName: string): string | null {
  // Exact match
  const exact = COVERAGE_NAMES_EN_TO_TR[englishName]
  if (exact) return exact

  // Case-insensitive match
  const lowerName = englishName.toLowerCase()
  for (const [key, value] of Object.entries(COVERAGE_NAMES_EN_TO_TR)) {
    if (key.toLowerCase() === lowerName) return value
  }

  return null
}

/**
 * Build the English identity map (for EN translations).
 * Keys and values are the same English names.
 */
export function buildCoverageNamesIdentityMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const key of Object.keys(COVERAGE_NAMES_EN_TO_TR)) {
    map[key] = key
  }
  return map
}
