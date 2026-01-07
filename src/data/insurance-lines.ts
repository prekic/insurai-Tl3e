/**
 * Turkish Insurance Lines (Sigorta Branşları)
 *
 * Based on TSB (Türkiye Sigorta Birliği) and SEDDK official classifications
 * Source: https://www.tsb.org.tr, https://www.seddk.gov.tr
 * Last Updated: January 2026
 */

// =============================================================================
// INSURANCE LINE TYPES
// =============================================================================

export type InsuranceCategory =
  | 'hayat_disi' // Non-Life Insurance
  | 'hayat' // Life Insurance
  | 'bireysel_emeklilik' // Private Pension

export type InsuranceBranchCode =
  // Hayat Dışı (Non-Life)
  | 'kara_araclari' // Motor Own Damage (Kasko)
  | 'kara_araclari_sorumluluk' // Motor Liability (Traffic)
  | 'yangin_dogal_afet' // Fire & Natural Disasters
  | 'genel_zararlar' // General Damages
  | 'kaza' // Accident
  | 'saglik' // Health (Non-Life)
  | 'deniz_araclari' // Marine Hull
  | 'hava_araclari' // Aviation
  | 'rayli_araclari' // Railway Vehicles
  | 'nakliyat' // Cargo/Transportation
  | 'genel_sorumluluk' // General Liability
  | 'kredi' // Credit
  | 'emniyeti_suistimal' // Fidelity Guarantee
  | 'finansal_kayiplar' // Financial Losses
  | 'hukuksal_koruma' // Legal Protection
  | 'destek' // Assistance
  // Hayat (Life)
  | 'hayat' // Life
  | 'hayat_kar_paylı' // Life with Profit Sharing
  | 'evlilik_dogum' // Marriage/Birth
  | 'yatirim_fonlu' // Unit-Linked
  | 'sermaye_itfa' // Capital Redemption

// =============================================================================
// INSURANCE LINE INTERFACE
// =============================================================================

export interface InsuranceLine {
  code: InsuranceBranchCode
  category: InsuranceCategory
  nameTR: string
  nameEN: string
  description: string
  descriptionTR: string
  mandatory: boolean
  regulatedBy: 'SEDDK' | 'DASK' | 'TARSİM' | 'Hazine'
  subBranches: SubBranch[]
  generalConditionsRef?: string // Reference to genel şartlar
  keyRegulations?: string[]
  marketShare2024?: number // Percentage of market
  avgPremium2024?: number // Average premium in TRY
}

export interface SubBranch {
  code: string
  nameTR: string
  nameEN: string
  mandatory: boolean
  generalConditionsRef?: string
}

// =============================================================================
// HAYAT DIŞI (NON-LIFE) INSURANCE LINES
// =============================================================================

export const NON_LIFE_INSURANCE_LINES: InsuranceLine[] = [
  {
    code: 'kara_araclari',
    category: 'hayat_disi',
    nameTR: 'Kara Araçları (Kasko)',
    nameEN: 'Motor Own Damage (Comprehensive)',
    description: 'Covers own vehicle damage from accidents, theft, natural disasters',
    descriptionTR:
      'Aracın kaza, hırsızlık, doğal afet gibi risklere karşı teminat altına alınması',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 12.8,
    avgPremium2024: 15000,
    generalConditionsRef: 'kara_araclari_kasko_genel_sartlari',
    keyRegulations: [
      'Kara Araçları Kasko Sigortası Genel Şartları',
      'Kasko Değer Listesi Tebliği',
    ],
    subBranches: [
      {
        code: 'kasko_tam',
        nameTR: 'Tam Kasko',
        nameEN: 'Full Comprehensive',
        mandatory: false,
      },
      {
        code: 'kasko_dar',
        nameTR: 'Dar Kasko',
        nameEN: 'Limited Comprehensive',
        mandatory: false,
      },
      {
        code: 'kasko_genisletilmis',
        nameTR: 'Genişletilmiş Kasko',
        nameEN: 'Extended Comprehensive',
        mandatory: false,
      },
      {
        code: 'mini_kasko',
        nameTR: 'Mini Kasko',
        nameEN: 'Mini Comprehensive',
        mandatory: false,
      },
    ],
  },
  {
    code: 'kara_araclari_sorumluluk',
    category: 'hayat_disi',
    nameTR: 'Kara Araçları Sorumluluk',
    nameEN: 'Motor Third Party Liability',
    description: 'Mandatory coverage for third party damages in traffic accidents',
    descriptionTR:
      'Motorlu araç işletenlerinin üçüncü şahıslara verecekleri zararları karşılayan zorunlu sigorta',
    mandatory: true,
    regulatedBy: 'SEDDK',
    marketShare2024: 18.5,
    avgPremium2024: 4500,
    generalConditionsRef: 'zmss_genel_sartlari',
    keyRegulations: [
      'Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası Genel Şartları',
      'ZMMS Tarife ve Talimat',
      '2918 Sayılı Karayolları Trafik Kanunu',
    ],
    subBranches: [
      {
        code: 'zmss',
        nameTR: 'Zorunlu Mali Sorumluluk Sigortası (Trafik)',
        nameEN: 'Mandatory Motor Third Party Liability (Traffic)',
        mandatory: true,
        generalConditionsRef: 'zmss_genel_sartlari',
      },
      {
        code: 'ihtiyari_mali_sorumluluk',
        nameTR: 'İhtiyari Mali Sorumluluk',
        nameEN: 'Voluntary Motor Liability',
        mandatory: false,
        generalConditionsRef: 'ihtiyari_mali_sorumluluk_genel_sartlari',
      },
      {
        code: 'yesil_kart',
        nameTR: 'Yeşil Kart',
        nameEN: 'Green Card (International Motor)',
        mandatory: false,
      },
    ],
  },
  {
    code: 'yangin_dogal_afet',
    category: 'hayat_disi',
    nameTR: 'Yangın ve Doğal Afetler',
    nameEN: 'Fire and Natural Disasters',
    description: 'Property coverage against fire, explosion, natural disasters',
    descriptionTR:
      'Yangın, patlama, yıldırım, doğal afetler gibi risklere karşı mal sigortası',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 8.2,
    avgPremium2024: 3500,
    generalConditionsRef: 'yangin_sigortasi_genel_sartlari',
    keyRegulations: ['Yangın Sigortası Genel Şartları', 'Yangın Tarifesi'],
    subBranches: [
      {
        code: 'yangin',
        nameTR: 'Yangın Sigortası',
        nameEN: 'Fire Insurance',
        mandatory: false,
        generalConditionsRef: 'yangin_sigortasi_genel_sartlari',
      },
      {
        code: 'dask',
        nameTR: 'Zorunlu Deprem Sigortası (DASK)',
        nameEN: 'Mandatory Earthquake Insurance',
        mandatory: true,
        generalConditionsRef: 'zorunlu_deprem_sigortasi_genel_sartlari',
      },
      {
        code: 'konut_paket',
        nameTR: 'Konut Paket Sigortası',
        nameEN: 'Home Package Insurance',
        mandatory: false,
      },
      {
        code: 'isyeri',
        nameTR: 'İşyeri Sigortası',
        nameEN: 'Business Property Insurance',
        mandatory: false,
      },
    ],
  },
  {
    code: 'genel_zararlar',
    category: 'hayat_disi',
    nameTR: 'Genel Zararlar',
    nameEN: 'General Damages',
    description: 'Miscellaneous property damage coverages',
    descriptionTR: 'Çeşitli mal zararlarına karşı teminatlar',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 5.1,
    subBranches: [
      {
        code: 'hirsizlik',
        nameTR: 'Hırsızlık Sigortası',
        nameEN: 'Theft Insurance',
        mandatory: false,
        generalConditionsRef: 'hirsizlik_sigortasi_genel_sartlari',
      },
      {
        code: 'cam_kirilmasi',
        nameTR: 'Cam Kırılması',
        nameEN: 'Glass Breakage',
        mandatory: false,
        generalConditionsRef: 'cam_kirilmasi_genel_sartlari',
      },
      {
        code: 'makine_kirilmasi',
        nameTR: 'Makine Kırılması',
        nameEN: 'Machinery Breakdown',
        mandatory: false,
        generalConditionsRef: 'makine_kirilmasi_genel_sartlari',
      },
      {
        code: 'elektronik_cihaz',
        nameTR: 'Elektronik Cihaz Sigortası',
        nameEN: 'Electronic Equipment Insurance',
        mandatory: false,
        generalConditionsRef: 'elektronik_cihaz_genel_sartlari',
      },
    ],
  },
  {
    code: 'kaza',
    category: 'hayat_disi',
    nameTR: 'Kaza Sigortaları',
    nameEN: 'Accident Insurance',
    description: 'Personal accident coverage for death and disability',
    descriptionTR: 'Kaza sonucu ölüm ve sakatlık teminatları',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 4.3,
    avgPremium2024: 500,
    generalConditionsRef: 'ferdi_kaza_genel_sartlari',
    keyRegulations: ['Ferdi Kaza Sigortası Genel Şartları'],
    subBranches: [
      {
        code: 'ferdi_kaza',
        nameTR: 'Ferdi Kaza Sigortası',
        nameEN: 'Personal Accident Insurance',
        mandatory: false,
        generalConditionsRef: 'ferdi_kaza_genel_sartlari',
      },
      {
        code: 'koltuk_ferdi_kaza',
        nameTR: 'Karayolu Yolcu Taşımacılığı Zorunlu Koltuk Ferdi Kaza',
        nameEN: 'Mandatory Seat Accident Insurance',
        mandatory: true,
        generalConditionsRef: 'koltuk_ferdi_kaza_genel_sartlari',
      },
      {
        code: 'maden_ferdi_kaza',
        nameTR: 'Maden Çalışanları Zorunlu Ferdi Kaza',
        nameEN: 'Mine Workers Mandatory Accident',
        mandatory: true,
        generalConditionsRef: 'maden_ferdi_kaza_genel_sartlari',
      },
    ],
  },
  {
    code: 'saglik',
    category: 'hayat_disi',
    nameTR: 'Hastalık/Sağlık',
    nameEN: 'Health Insurance',
    description: 'Medical expense coverage and health protection',
    descriptionTR: 'Hastalık ve tedavi giderlerinin karşılanması',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 15.7,
    avgPremium2024: 25000,
    generalConditionsRef: 'saglik_sigortasi_genel_sartlari',
    keyRegulations: [
      'Sağlık Sigortası Genel Şartları',
      'Özel Sağlık Sigortaları Yönetmeliği',
      'Genelge 2025/28',
    ],
    subBranches: [
      {
        code: 'ozel_saglik',
        nameTR: 'Özel Sağlık Sigortası',
        nameEN: 'Private Health Insurance',
        mandatory: false,
        generalConditionsRef: 'saglik_sigortasi_genel_sartlari',
      },
      {
        code: 'tamamlayici_saglik',
        nameTR: 'Tamamlayıcı Sağlık Sigortası',
        nameEN: 'Supplementary Health Insurance',
        mandatory: false,
      },
      {
        code: 'seyahat_saglik',
        nameTR: 'Seyahat Sağlık Sigortası',
        nameEN: 'Travel Health Insurance',
        mandatory: false,
        generalConditionsRef: 'seyahat_saglik_genel_sartlari',
      },
      {
        code: 'yabanci_saglik',
        nameTR: 'Yabancı Uyruklu Sağlık Sigortası',
        nameEN: 'Foreign Nationals Health Insurance',
        mandatory: false,
      },
    ],
  },
  {
    code: 'nakliyat',
    category: 'hayat_disi',
    nameTR: 'Nakliyat',
    nameEN: 'Marine & Transportation',
    description: 'Cargo and goods in transit coverage',
    descriptionTR: 'Emtia ve taşınan malların sigortalanması',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 3.2,
    generalConditionsRef: 'emtia_nakliyat_genel_sartlari',
    subBranches: [
      {
        code: 'emtia_nakliyat',
        nameTR: 'Emtia Nakliyat Sigortası',
        nameEN: 'Cargo Insurance',
        mandatory: false,
        generalConditionsRef: 'emtia_nakliyat_genel_sartlari',
      },
      {
        code: 'kiymet_nakliyat',
        nameTR: 'Kıymet Nakliyat Sigortası',
        nameEN: 'Valuable Goods Transportation',
        mandatory: false,
        generalConditionsRef: 'kiymet_nakliyat_genel_sartlari',
      },
      {
        code: 'tasiyici_sorumluluk',
        nameTR: 'Taşıyıcı Mali Sorumluluk',
        nameEN: 'Carrier Liability',
        mandatory: true,
        generalConditionsRef: 'tasiyici_sorumluluk_genel_sartlari',
      },
    ],
  },
  {
    code: 'deniz_araclari',
    category: 'hayat_disi',
    nameTR: 'Deniz Araçları',
    nameEN: 'Marine Hull',
    description: 'Vessel and boat insurance',
    descriptionTR: 'Deniz taşıtlarının sigortalanması',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 1.8,
    generalConditionsRef: 'tekne_genel_sartlari',
    subBranches: [
      {
        code: 'tekne',
        nameTR: 'Tekne Sigortası',
        nameEN: 'Vessel Insurance',
        mandatory: false,
        generalConditionsRef: 'tekne_genel_sartlari',
      },
      {
        code: 'deniz_sorumluluk',
        nameTR: 'Deniz Araçları Zorunlu Mali Sorumluluk',
        nameEN: 'Marine Vessel Mandatory Liability',
        mandatory: true,
        generalConditionsRef: 'deniz_araclari_zmms_genel_sartlari',
      },
    ],
  },
  {
    code: 'hava_araclari',
    category: 'hayat_disi',
    nameTR: 'Hava Araçları',
    nameEN: 'Aviation',
    description: 'Aircraft hull and liability insurance',
    descriptionTR: 'Hava taşıtları ve havacılık sigortaları',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 0.9,
    subBranches: [
      {
        code: 'ucak_govde',
        nameTR: 'Uçak Gövde Sigortası',
        nameEN: 'Aircraft Hull Insurance',
        mandatory: false,
      },
      {
        code: 'hava_sorumluluk',
        nameTR: 'Hava Araçları Mali Sorumluluk',
        nameEN: 'Aircraft Liability Insurance',
        mandatory: true,
      },
    ],
  },
  {
    code: 'genel_sorumluluk',
    category: 'hayat_disi',
    nameTR: 'Genel Sorumluluk',
    nameEN: 'General Liability',
    description: 'Third party liability coverage for various activities',
    descriptionTR: 'Üçüncü şahıslara karşı sorumluluk teminatları',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 6.4,
    generalConditionsRef: 'ucuncu_sahis_sorumluluk_genel_sartlari',
    subBranches: [
      {
        code: 'ucuncu_sahis',
        nameTR: 'Üçüncü Şahıslara Karşı Mali Mesuliyet',
        nameEN: 'Third Party Liability',
        mandatory: false,
        generalConditionsRef: 'ucuncu_sahis_sorumluluk_genel_sartlari',
      },
      {
        code: 'isveren_sorumluluk',
        nameTR: 'İşveren Mali Sorumluluk',
        nameEN: 'Employer Liability',
        mandatory: false,
        generalConditionsRef: 'isveren_sorumluluk_genel_sartlari',
      },
      {
        code: 'urun_sorumluluk',
        nameTR: 'Ürün Sorumluluk Sigortası',
        nameEN: 'Product Liability',
        mandatory: false,
        generalConditionsRef: 'urun_sorumluluk_genel_sartlari',
      },
      {
        code: 'mesleki_sorumluluk',
        nameTR: 'Mesleki Sorumluluk',
        nameEN: 'Professional Liability',
        mandatory: false,
        generalConditionsRef: 'mesleki_sorumluluk_genel_sartlari',
      },
      {
        code: 'tibbi_kotu_uygulama',
        nameTR: 'Tıbbi Kötü Uygulamaya İlişkin Zorunlu Mali Sorumluluk',
        nameEN: 'Medical Malpractice Mandatory Liability',
        mandatory: true,
        generalConditionsRef: 'tibbi_kotu_uygulama_genel_sartlari',
      },
      {
        code: 'cevre_kirliligi',
        nameTR: 'Çevre Kirliliği Mali Sorumluluk',
        nameEN: 'Environmental Pollution Liability',
        mandatory: false,
        generalConditionsRef: 'cevre_kirliligi_genel_sartlari',
      },
      {
        code: 'asansor',
        nameTR: 'Asansör Kazalarında Üçüncü Kişilere Karşı Sorumluluk',
        nameEN: 'Elevator Accident Third Party Liability',
        mandatory: true,
        generalConditionsRef: 'asansor_sorumluluk_genel_sartlari',
      },
      {
        code: 'tehlikeli_madde',
        nameTR: 'Tehlikeli Maddeler Zorunlu Sorumluluk',
        nameEN: 'Hazardous Materials Mandatory Liability',
        mandatory: true,
        generalConditionsRef: 'tehlikeli_madde_genel_sartlari',
      },
      {
        code: 'tupgaz',
        nameTR: 'Tüpgaz Zorunlu Sorumluluk',
        nameEN: 'Bottled Gas Mandatory Liability',
        mandatory: true,
        generalConditionsRef: 'tupgaz_sorumluluk_genel_sartlari',
      },
      {
        code: 'ozel_guvenlik',
        nameTR: 'Özel Güvenlik Zorunlu Mali Sorumluluk',
        nameEN: 'Private Security Mandatory Liability',
        mandatory: true,
        generalConditionsRef: 'ozel_guvenlik_genel_sartlari',
      },
    ],
  },
  {
    code: 'kredi',
    category: 'hayat_disi',
    nameTR: 'Kredi Sigortası',
    nameEN: 'Credit Insurance',
    description: 'Protection against credit defaults and non-payment',
    descriptionTR: 'Alacak tahsil edilememesi riskine karşı koruma',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 2.1,
    subBranches: [
      {
        code: 'ticari_alacak',
        nameTR: 'Ticari Alacak (Kredi) Sigortası',
        nameEN: 'Trade Credit Insurance',
        mandatory: false,
        generalConditionsRef: 'ticari_alacak_genel_sartlari',
      },
      {
        code: 'borc_odeme',
        nameTR: 'Borç Ödeme Sigortası',
        nameEN: 'Debt Payment Insurance',
        mandatory: false,
        generalConditionsRef: 'borc_odeme_genel_sartlari',
      },
    ],
  },
  {
    code: 'finansal_kayiplar',
    category: 'hayat_disi',
    nameTR: 'Finansal Kayıplar',
    nameEN: 'Financial Losses',
    description: 'Coverage for various financial losses and income interruption',
    descriptionTR: 'Finansal kayıp ve gelir kaybı teminatları',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 1.5,
    subBranches: [
      {
        code: 'kar_kaybi',
        nameTR: 'Kar Kaybı Sigortası',
        nameEN: 'Loss of Profit Insurance',
        mandatory: false,
        generalConditionsRef: 'kar_kaybi_genel_sartlari',
      },
      {
        code: 'gelir_koruma',
        nameTR: 'Gelir Koruma Sigortası',
        nameEN: 'Income Protection Insurance',
        mandatory: false,
        generalConditionsRef: 'gelir_koruma_genel_sartlari',
      },
      {
        code: 'kefalet',
        nameTR: 'Kefalet Sigortası',
        nameEN: 'Surety/Guarantee Insurance',
        mandatory: false,
        generalConditionsRef: 'kefalet_genel_sartlari',
      },
    ],
  },
  {
    code: 'hukuksal_koruma',
    category: 'hayat_disi',
    nameTR: 'Hukuksal Koruma',
    nameEN: 'Legal Protection',
    description: 'Legal expense coverage and legal assistance',
    descriptionTR: 'Hukuki masrafların karşılanması ve hukuki yardım',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 0.8,
    generalConditionsRef: 'hukuksal_koruma_genel_sartlari',
    subBranches: [
      {
        code: 'hukuksal_koruma',
        nameTR: 'Hukuksal Koruma Sigortası',
        nameEN: 'Legal Protection Insurance',
        mandatory: false,
        generalConditionsRef: 'hukuksal_koruma_genel_sartlari',
      },
    ],
  },
  {
    code: 'destek',
    category: 'hayat_disi',
    nameTR: 'Destek',
    nameEN: 'Assistance',
    description: 'Roadside assistance and emergency support services',
    descriptionTR: 'Yol yardım ve acil destek hizmetleri',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 1.2,
    subBranches: [
      {
        code: 'yol_yardim',
        nameTR: 'Yol Yardım',
        nameEN: 'Roadside Assistance',
        mandatory: false,
      },
      {
        code: 'seyahat_destek',
        nameTR: 'Seyahat Araç Destek',
        nameEN: 'Travel Vehicle Assistance',
        mandatory: false,
        generalConditionsRef: 'seyahat_arac_destek_genel_sartlari',
      },
    ],
  },
]

// =============================================================================
// HAYAT (LIFE) INSURANCE LINES
// =============================================================================

export const LIFE_INSURANCE_LINES: InsuranceLine[] = [
  {
    code: 'hayat',
    category: 'hayat',
    nameTR: 'Hayat Sigortası',
    nameEN: 'Life Insurance',
    description: 'Life coverage with death benefits',
    descriptionTR: 'Vefat teminatı sağlayan hayat sigortası',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 8.5,
    avgPremium2024: 5000,
    generalConditionsRef: 'hayat_sigortasi_genel_sartlari',
    keyRegulations: ['Hayat Sigortası Genel Şartları'],
    subBranches: [
      {
        code: 'hayat_standart',
        nameTR: 'Standart Hayat Sigortası',
        nameEN: 'Standard Life Insurance',
        mandatory: false,
        generalConditionsRef: 'hayat_sigortasi_genel_sartlari',
      },
      {
        code: 'kredi_hayat',
        nameTR: 'Kredi Hayat Sigortası',
        nameEN: 'Credit Life Insurance',
        mandatory: false,
      },
      {
        code: 'grup_hayat',
        nameTR: 'Grup Hayat Sigortası',
        nameEN: 'Group Life Insurance',
        mandatory: false,
      },
    ],
  },
  {
    code: 'hayat_kar_paylı',
    category: 'hayat',
    nameTR: 'Kar Paylı Hayat Sigortası',
    nameEN: 'Life Insurance with Profit Sharing',
    description: 'Life coverage with investment returns sharing',
    descriptionTR: 'Birikim ve kar paylaşımlı hayat sigortası',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 3.2,
    subBranches: [
      {
        code: 'birikimli_hayat',
        nameTR: 'Birikimli Hayat',
        nameEN: 'Endowment Life',
        mandatory: false,
      },
    ],
  },
  {
    code: 'yatirim_fonlu',
    category: 'hayat',
    nameTR: 'Yatırım Fonlu Hayat',
    nameEN: 'Unit-Linked Life',
    description: 'Life insurance linked to investment funds',
    descriptionTR: 'Yatırım fonlarına bağlı hayat sigortası',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 2.1,
    subBranches: [
      {
        code: 'fonlu_hayat',
        nameTR: 'Fonlu Hayat Sigortası',
        nameEN: 'Fund-Linked Life Insurance',
        mandatory: false,
      },
    ],
  },
]

// =============================================================================
// TARIM (AGRICULTURAL) INSURANCE - Special Category
// =============================================================================

export const AGRICULTURAL_INSURANCE_LINES: InsuranceLine[] = [
  {
    code: 'rayli_araclari' as InsuranceBranchCode,
    category: 'hayat_disi',
    nameTR: 'Tarım Sigortaları',
    nameEN: 'Agricultural Insurance',
    description: 'Crop, livestock, and agricultural risk coverage',
    descriptionTR: 'Bitkisel ürün, hayvan ve tarımsal risk teminatları',
    mandatory: false,
    regulatedBy: 'TARSİM',
    marketShare2024: 4.5,
    keyRegulations: ['5363 Sayılı Tarım Sigortaları Kanunu', 'TARSİM Genel Şartları'],
    subBranches: [
      {
        code: 'bitkisel_urun',
        nameTR: 'Bitkisel Ürün Sigortası',
        nameEN: 'Crop Insurance',
        mandatory: false,
        generalConditionsRef: 'bitkisel_urun_genel_sartlari',
      },
      {
        code: 'dolu',
        nameTR: 'Dolu Sigortası',
        nameEN: 'Hail Insurance',
        mandatory: false,
        generalConditionsRef: 'dolu_genel_sartlari',
      },
      {
        code: 'buyukbas_hayvan',
        nameTR: 'Büyükbaş Hayvan Hayat Sigortası',
        nameEN: 'Large Livestock Insurance',
        mandatory: false,
        generalConditionsRef: 'buyukbas_hayvan_genel_sartlari',
      },
      {
        code: 'kucukbas_hayvan',
        nameTR: 'Küçükbaş Hayvan Hayat Sigortası',
        nameEN: 'Small Livestock Insurance',
        mandatory: false,
        generalConditionsRef: 'kucukbas_hayvan_genel_sartlari',
      },
      {
        code: 'kumes_hayvanlari',
        nameTR: 'Kümes Hayvanları Hayat Sigortası',
        nameEN: 'Poultry Insurance',
        mandatory: false,
        generalConditionsRef: 'kumes_hayvanlari_genel_sartlari',
      },
      {
        code: 'su_urunleri',
        nameTR: 'Su Ürünleri Hayat Sigortası',
        nameEN: 'Aquaculture Insurance',
        mandatory: false,
        generalConditionsRef: 'su_urunleri_genel_sartlari',
      },
      {
        code: 'sera',
        nameTR: 'Sera Sigortası',
        nameEN: 'Greenhouse Insurance',
        mandatory: false,
        generalConditionsRef: 'sera_genel_sartlari',
      },
      {
        code: 'aricilik',
        nameTR: 'Arıcılık Sigortası',
        nameEN: 'Beekeeping Insurance',
        mandatory: false,
        generalConditionsRef: 'aricilik_genel_sartlari',
      },
    ],
  },
]

// =============================================================================
// ENGINEERING INSURANCE - Special Category
// =============================================================================

export const ENGINEERING_INSURANCE_LINES: InsuranceLine[] = [
  {
    code: 'rayli_araclari' as InsuranceBranchCode,
    category: 'hayat_disi',
    nameTR: 'Mühendislik Sigortaları',
    nameEN: 'Engineering Insurance',
    description: 'Construction, installation, and machinery coverage',
    descriptionTR: 'İnşaat, montaj ve makine sigortaları',
    mandatory: false,
    regulatedBy: 'SEDDK',
    marketShare2024: 3.8,
    subBranches: [
      {
        code: 'insaat_all_risks',
        nameTR: 'İnşaat All Risks (CAR)',
        nameEN: 'Construction All Risks',
        mandatory: false,
        generalConditionsRef: 'insaat_all_risks_genel_sartlari',
      },
      {
        code: 'montaj_all_risks',
        nameTR: 'Montaj All Risks (EAR)',
        nameEN: 'Erection All Risks',
        mandatory: false,
        generalConditionsRef: 'montaj_all_risks_genel_sartlari',
      },
      {
        code: 'makine_kirilmasi',
        nameTR: 'Makine Kırılması',
        nameEN: 'Machinery Breakdown',
        mandatory: false,
        generalConditionsRef: 'makine_kirilmasi_genel_sartlari',
      },
      {
        code: 'elektronik_cihaz',
        nameTR: 'Elektronik Cihaz',
        nameEN: 'Electronic Equipment',
        mandatory: false,
        generalConditionsRef: 'elektronik_cihaz_genel_sartlari',
      },
      {
        code: 'bina_tamamlama',
        nameTR: 'Bina Tamamlama Sigortası',
        nameEN: 'Building Completion Insurance',
        mandatory: false,
        generalConditionsRef: 'bina_tamamlama_genel_sartlari',
      },
    ],
  },
]

// =============================================================================
// COMBINED EXPORTS
// =============================================================================

export const ALL_INSURANCE_LINES: InsuranceLine[] = [
  ...NON_LIFE_INSURANCE_LINES,
  ...LIFE_INSURANCE_LINES,
  ...AGRICULTURAL_INSURANCE_LINES,
  ...ENGINEERING_INSURANCE_LINES,
]

// =============================================================================
// MANDATORY INSURANCE LIST
// =============================================================================

export const MANDATORY_INSURANCES = ALL_INSURANCE_LINES.flatMap((line) =>
  line.subBranches
    .filter((sb) => sb.mandatory)
    .map((sb) => ({
      code: sb.code,
      nameTR: sb.nameTR,
      nameEN: sb.nameEN,
      parentLine: line.nameTR,
      generalConditionsRef: sb.generalConditionsRef,
    }))
)

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

export function getInsuranceLineByCode(code: InsuranceBranchCode): InsuranceLine | undefined {
  return ALL_INSURANCE_LINES.find((line) => line.code === code)
}

export function getSubBranchByCode(code: string): SubBranch | undefined {
  for (const line of ALL_INSURANCE_LINES) {
    const sub = line.subBranches.find((sb) => sb.code === code)
    if (sub) return sub
  }
  return undefined
}

export function searchInsuranceLines(query: string): InsuranceLine[] {
  const q = query.toLowerCase()
  return ALL_INSURANCE_LINES.filter(
    (line) =>
      line.nameTR.toLowerCase().includes(q) ||
      line.nameEN.toLowerCase().includes(q) ||
      line.description.toLowerCase().includes(q) ||
      line.subBranches.some(
        (sb) => sb.nameTR.toLowerCase().includes(q) || sb.nameEN.toLowerCase().includes(q)
      )
  )
}

export function getMandatoryInsurances(): typeof MANDATORY_INSURANCES {
  return MANDATORY_INSURANCES
}
