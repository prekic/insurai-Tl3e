/**
 * Turkish Insurance Regulations Knowledge Database
 *
 * Comprehensive database of insurance regulations, general conditions (genel şartlar),
 * clauses (klozlar), and circulars (genelgeler)
 *
 * Source: SEDDK, TSB, Resmi Gazete
 * Last Updated: January 2026
 *
 * IMPORTANT: Newer regulations override older ones. Check effectiveDate and
 * supersededBy fields for current validity.
 */

// =============================================================================
// TYPES
// =============================================================================

export type RegulationType =
  | 'law' // Kanun
  | 'regulation' // Yönetmelik
  | 'general_condition' // Genel Şartlar
  | 'clause' // Kloz
  | 'tariff' // Tarife
  | 'circular' // Genelge
  | 'communique' // Tebliğ
  | 'guideline' // Rehber

export type InsuranceCategoryRef =
  | 'all'
  | 'non_life'
  | 'life'
  | 'traffic'
  | 'kasko'
  | 'fire'
  | 'dask'
  | 'health'
  | 'liability'
  | 'marine'
  | 'agricultural'
  | 'engineering'
  | 'credit'
  | 'accident'

export interface Regulation {
  id: string
  type: RegulationType
  category: InsuranceCategoryRef[]
  nameTR: string
  nameEN: string
  description: string
  descriptionTR: string
  publishDate: string // ISO date
  effectiveDate: string // ISO date
  expiryDate?: string // ISO date
  supersededBy?: string // ID of newer regulation
  supersedes?: string[] // IDs of older regulations
  source: string
  sourceUrl?: string
  officialGazette?: {
    date: string
    number: string
  }
  keyProvisions?: KeyProvision[]
  relatedRegulations?: string[]
  version: string
  isActive: boolean
}

export interface KeyProvision {
  article?: string
  title: string
  titleTR: string
  summary: string
  summaryTR: string
}

export interface GeneralCondition extends Regulation {
  type: 'general_condition'
  mandatoryCoverages?: string[]
  optionalCoverages?: string[]
  standardExclusions?: string[]
  standardDeductibles?: StandardDeductible[]
  claimsProcess?: ClaimsProcess
}

export interface StandardDeductible {
  type: string
  typeTR: string
  amount?: number
  percentage?: number
  description: string
  descriptionTR: string
}

export interface ClaimsProcess {
  notificationPeriodDays: number
  requiredDocuments: string[]
  requiredDocumentsTR: string[]
  paymentPeriodDays: number
}

export interface Clause {
  id: string
  type: 'clause'
  category: InsuranceCategoryRef[]
  code: string // Kloz kodu
  nameTR: string
  nameEN: string
  description: string
  descriptionTR: string
  effectiveDate: string
  isActive: boolean
  applicableTo: string[] // General condition IDs
  premium?: {
    type: 'percentage' | 'fixed' | 'variable'
    rate?: number
  }
}

// =============================================================================
// PRIMARY LAWS (KANUNLAR)
// =============================================================================

export const PRIMARY_LAWS: Regulation[] = [
  {
    id: 'law_5684',
    type: 'law',
    category: ['all'],
    nameTR: '5684 Sayılı Sigortacılık Kanunu',
    nameEN: 'Insurance Law No. 5684',
    description: 'Primary insurance law governing the Turkish insurance industry',
    descriptionTR: 'Türk sigorta sektörünü düzenleyen temel kanun',
    publishDate: '2007-06-14',
    effectiveDate: '2007-06-14',
    source: 'Resmi Gazete',
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5684.pdf',
    officialGazette: {
      date: '2007-06-14',
      number: '26552',
    },
    version: '1.0',
    isActive: true,
    keyProvisions: [
      {
        article: '1-10',
        title: 'General Provisions',
        titleTR: 'Genel Hükümler',
        summary: 'Scope, definitions, and general principles',
        summaryTR: 'Kapsam, tanımlar ve genel ilkeler',
      },
      {
        article: '11-24',
        title: 'Insurance Companies',
        titleTR: 'Sigorta Şirketleri',
        summary: 'Establishment, licensing, and operations',
        summaryTR: 'Kuruluş, ruhsatlandırma ve faaliyetler',
      },
      {
        article: '25-35',
        title: 'Intermediaries',
        titleTR: 'Aracılar',
        summary: 'Agents, brokers, and bancassurance',
        summaryTR: 'Acenteler, brokerler ve bankasürans',
      },
    ],
  },
  {
    id: 'law_2918',
    type: 'law',
    category: ['traffic', 'kasko'],
    nameTR: '2918 Sayılı Karayolları Trafik Kanunu',
    nameEN: 'Highway Traffic Law No. 2918',
    description: 'Traffic law including mandatory motor insurance provisions',
    descriptionTR: 'Zorunlu motorlu taşıt sigortası hükümlerini içeren trafik kanunu',
    publishDate: '1983-10-18',
    effectiveDate: '1983-10-18',
    source: 'Resmi Gazete',
    officialGazette: {
      date: '1983-10-18',
      number: '18195',
    },
    version: '1.0',
    isActive: true,
    keyProvisions: [
      {
        article: '91',
        title: 'Mandatory Liability Insurance',
        titleTR: 'Zorunlu Mali Sorumluluk Sigortası',
        summary: 'Vehicle owners must have mandatory third-party liability insurance',
        summaryTR: 'Araç sahipleri zorunlu mali sorumluluk sigortası yaptırmak zorundadır',
      },
    ],
  },
  {
    id: 'law_6305',
    type: 'law',
    category: ['dask'],
    nameTR: '6305 Sayılı Afet Sigortaları Kanunu',
    nameEN: 'Disaster Insurance Law No. 6305',
    description: 'Law establishing DASK (mandatory earthquake insurance)',
    descriptionTR: 'DASK (Zorunlu deprem sigortası) kurulmasını düzenleyen kanun',
    publishDate: '2012-05-18',
    effectiveDate: '2012-05-18',
    source: 'Resmi Gazete',
    officialGazette: {
      date: '2012-05-18',
      number: '28296',
    },
    version: '1.0',
    isActive: true,
  },
  {
    id: 'law_5363',
    type: 'law',
    category: ['agricultural'],
    nameTR: '5363 Sayılı Tarım Sigortaları Kanunu',
    nameEN: 'Agricultural Insurance Law No. 5363',
    description: 'Law governing agricultural insurance and TARSİM',
    descriptionTR: 'Tarım sigortaları ve TARSİM\'i düzenleyen kanun',
    publishDate: '2005-06-21',
    effectiveDate: '2005-06-21',
    source: 'Resmi Gazete',
    officialGazette: {
      date: '2005-06-21',
      number: '25852',
    },
    version: '1.0',
    isActive: true,
  },
]

// =============================================================================
// GENERAL CONDITIONS (GENEL ŞARTLAR)
// =============================================================================

export const GENERAL_CONDITIONS: GeneralCondition[] = [
  // TRAFFIC INSURANCE
  {
    id: 'gs_zmss',
    type: 'general_condition',
    category: ['traffic'],
    nameTR: 'Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası Genel Şartları',
    nameEN: 'Motor Vehicle Mandatory Third Party Liability Insurance General Conditions',
    description:
      'Standard terms and conditions for mandatory traffic insurance (MTPL)',
    descriptionTR: 'Zorunlu trafik sigortası (ZMMS) standart hüküm ve koşulları',
    publishDate: '2020-01-01',
    effectiveDate: '2020-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2020.1',
    isActive: true,
    mandatoryCoverages: [
      'Maddi Hasar (Material Damage)',
      'Bedensel Hasar (Bodily Injury)',
      'Ölüm Tazminatı (Death Benefit)',
      'Sürekli Sakatlık (Permanent Disability)',
      'Tedavi Giderleri (Medical Expenses)',
    ],
    standardExclusions: [
      'Sigortalının kendisine verdiği zararlar',
      'Sigortalının eş ve yakınlarına verdiği zararlar',
      'Alkol/uyuşturucu etkisi altında sürüş',
      'Ehliyetsiz sürüş',
      'Kasıtlı kazalar',
      'Yarış ve ralli faaliyetleri',
    ],
    claimsProcess: {
      notificationPeriodDays: 5,
      requiredDocuments: [
        'Accident report (Kaza tutanağı)',
        'Driver license copy',
        'Vehicle registration copy',
        'Photos of damage',
        'Police report if applicable',
      ],
      requiredDocumentsTR: [
        'Kaza tutanağı',
        'Ehliyet fotokopisi',
        'Ruhsat fotokopisi',
        'Hasar fotoğrafları',
        'Varsa polis raporu',
      ],
      paymentPeriodDays: 8,
    },
    keyProvisions: [
      {
        article: 'A.1',
        title: 'Scope of Coverage',
        titleTR: 'Teminat Kapsamı',
        summary:
          'Covers third party bodily injury and material damage from motor vehicle accidents',
        summaryTR:
          'Motorlu taşıt kazalarından kaynaklanan üçüncü şahıs bedensel ve maddi hasarları kapsar',
      },
      {
        article: 'A.5',
        title: 'Coverage Limits',
        titleTR: 'Teminat Limitleri',
        summary: 'Minimum limits set annually by SEDDK',
        summaryTR: 'Asgari limitler SEDDK tarafından yıllık belirlenir',
      },
    ],
  },

  // KASKO
  {
    id: 'gs_kasko',
    type: 'general_condition',
    category: ['kasko'],
    nameTR: 'Kara Araçları Kasko Sigortası Genel Şartları',
    nameEN: 'Motor Vehicle Comprehensive Insurance General Conditions',
    description: 'Standard terms for comprehensive motor vehicle insurance',
    descriptionTR: 'Kapsamlı motorlu taşıt sigortası standart hükümleri',
    publishDate: '2020-01-01',
    effectiveDate: '2020-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2020.1',
    isActive: true,
    mandatoryCoverages: [
      'Çarpma, Çarpışma (Collision)',
      'Devrilme (Overturning)',
      'Yangın (Fire)',
      'Yıldırım (Lightning)',
      'İnfilak (Explosion)',
    ],
    optionalCoverages: [
      'Hırsızlık (Theft)',
      'Deprem, Sel (Earthquake, Flood)',
      'Grev, Lokavt (Strike, Lockout)',
      'Cam Kırılması (Glass Breakage)',
      'Ferdi Kaza (Personal Accident)',
      'İhtiyari Mali Sorumluluk',
      'Yol Yardım (Roadside Assistance)',
    ],
    standardExclusions: [
      'Normal kullanımdan kaynaklanan aşınma',
      'Mekanik arızalar',
      'Lastik hasarları (kaza harici)',
      'Alkol/uyuşturucu etkisi altında sürüş',
      'Ehliyetsiz sürüş',
      'Aracın amacı dışında kullanımı',
      'Yarış ve ralli faaliyetleri',
    ],
    standardDeductibles: [
      {
        type: 'standard',
        typeTR: 'Standart Muafiyet',
        percentage: 0,
        description: 'No deductible for standard policies',
        descriptionTR: 'Standart poliçelerde muafiyet yok',
      },
      {
        type: 'theft',
        typeTR: 'Hırsızlık Muafiyeti',
        percentage: 10,
        description: '10% deductible on theft claims',
        descriptionTR: 'Hırsızlık hasarlarında %10 muafiyet',
      },
      {
        type: 'natural_disaster',
        typeTR: 'Doğal Afet Muafiyeti',
        percentage: 2,
        description: '2% deductible for natural disaster claims',
        descriptionTR: 'Doğal afet hasarlarında %2 muafiyet',
      },
    ],
    claimsProcess: {
      notificationPeriodDays: 5,
      requiredDocuments: [
        'Claim form',
        'Photos of damage',
        'Police report for theft/total loss',
        'Repair estimate',
      ],
      requiredDocumentsTR: [
        'Hasar ihbar formu',
        'Hasar fotoğrafları',
        'Hırsızlık/tam ziya için polis raporu',
        'Onarım teklifi',
      ],
      paymentPeriodDays: 15,
    },
  },

  // FIRE INSURANCE
  {
    id: 'gs_yangin',
    type: 'general_condition',
    category: ['fire'],
    nameTR: 'Yangın Sigortası Genel Şartları',
    nameEN: 'Fire Insurance General Conditions',
    description: 'Standard terms for fire and property insurance',
    descriptionTR: 'Yangın ve mal sigortası standart hükümleri',
    publishDate: '2019-01-01',
    effectiveDate: '2019-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2019.1',
    isActive: true,
    mandatoryCoverages: ['Yangın (Fire)', 'Yıldırım (Lightning)', 'İnfilak (Explosion)'],
    optionalCoverages: [
      'Sel ve Su Baskını (Flood)',
      'Fırtına (Storm)',
      'Kar Ağırlığı (Snow Load)',
      'Duman (Smoke)',
      'Araç Çarpması (Vehicle Impact)',
      'Hava Taşıtları (Aircraft)',
      'Grev, Lokavt, Kargaşalık',
      'Terör',
      'Dahili Su',
    ],
    standardExclusions: [
      'Kasıtlı yangın',
      'Savaş, iç savaş',
      'Nükleer riskler',
      'Normal aşınma ve yıpranma',
    ],
    standardDeductibles: [
      {
        type: 'fire',
        typeTR: 'Yangın Muafiyeti',
        percentage: 0,
        description: 'Typically no deductible for main fire coverage',
        descriptionTR: 'Ana yangın teminatında genellikle muafiyet yok',
      },
      {
        type: 'flood',
        typeTR: 'Sel Muafiyeti',
        percentage: 2,
        description: '2% deductible for flood claims',
        descriptionTR: 'Sel hasarlarında %2 muafiyet',
      },
    ],
    claimsProcess: {
      notificationPeriodDays: 5,
      requiredDocuments: [
        'Fire brigade report',
        'Photos and video of damage',
        'List of damaged items with values',
        'Repair/replacement estimates',
      ],
      requiredDocumentsTR: [
        'İtfaiye raporu',
        'Hasar fotoğraf ve videoları',
        'Hasarlı eşya listesi ve değerleri',
        'Onarım/yenileme teklifleri',
      ],
      paymentPeriodDays: 30,
    },
  },

  // DASK
  {
    id: 'gs_dask',
    type: 'general_condition',
    category: ['dask'],
    nameTR: 'Zorunlu Deprem Sigortası Genel Şartları',
    nameEN: 'Mandatory Earthquake Insurance General Conditions',
    description: 'Standard terms for mandatory earthquake insurance (DASK)',
    descriptionTR: 'Zorunlu deprem sigortası (DASK) standart hükümleri',
    publishDate: '2012-01-01',
    effectiveDate: '2012-01-01',
    source: 'DASK',
    sourceUrl: 'https://dask.gov.tr',
    version: '2012.1',
    isActive: true,
    mandatoryCoverages: [
      'Deprem (Earthquake)',
      'Depreme bağlı yangın (Earthquake-related fire)',
      'Depreme bağlı patlama (Earthquake-related explosion)',
      'Depreme bağlı tsunami',
    ],
    standardExclusions: [
      'Taşınır mallar (Contents)',
      'Ticari ve sınai kullanım alanları',
      'Kamu binaları',
      'Köy evleri (belediye sınırı dışı)',
      'İkinci meskenler (ticari nitelikteki)',
    ],
    standardDeductibles: [
      {
        type: 'earthquake',
        typeTR: 'Deprem Muafiyeti',
        percentage: 2,
        description:
          '2% of insured value as mandatory deductible per claim',
        descriptionTR:
          'Her hasarda sigorta bedelinin %2\'si oranında zorunlu muafiyet',
      },
    ],
    claimsProcess: {
      notificationPeriodDays: 15,
      requiredDocuments: [
        'DASK policy',
        'Damage assessment report',
        'Title deed or occupancy certificate',
        'ID/Tax number',
      ],
      requiredDocumentsTR: [
        'DASK poliçesi',
        'Hasar tespit raporu',
        'Tapu veya yapı kullanma izin belgesi',
        'TC Kimlik No/Vergi No',
      ],
      paymentPeriodDays: 30,
    },
  },

  // HEALTH INSURANCE
  {
    id: 'gs_saglik',
    type: 'general_condition',
    category: ['health'],
    nameTR: 'Sağlık Sigortası Genel Şartları',
    nameEN: 'Health Insurance General Conditions',
    description: 'Standard terms for private health insurance',
    descriptionTR: 'Özel sağlık sigortası standart hükümleri',
    publishDate: '2021-01-01',
    effectiveDate: '2021-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2021.1',
    isActive: true,
    mandatoryCoverages: [],
    optionalCoverages: [
      'Yatarak Tedavi (Inpatient)',
      'Ayakta Tedavi (Outpatient)',
      'Acil Müdahale (Emergency)',
      'Ameliyat Teminatı (Surgery)',
      'Yoğun Bakım (ICU)',
      'İlaç Giderleri (Medication)',
      'Doğum (Maternity)',
      'Dental',
      'Check-up',
    ],
    standardExclusions: [
      'Mevcut hastalıklar (Pre-existing conditions)',
      'Estetik amaçlı müdahaleler',
      'Infertilite tedavileri',
      'Bekleme süresindeki hastalıklar',
      'Savaş, terör',
      'Nükleer riskler',
      'Alkol/uyuşturucu bağımlılığı',
    ],
    keyProvisions: [
      {
        article: 'A.1',
        title: 'Waiting Periods',
        titleTR: 'Bekleme Süreleri',
        summary: 'Coverage begins after waiting period for specific conditions',
        summaryTR: 'Bazı hastalıklar için bekleme süresi sonrası teminat başlar',
      },
      {
        article: 'A.5',
        title: 'Network Restrictions',
        titleTR: 'Anlaşmalı Kurum Kısıtlamaları',
        summary: 'Coverage may be limited to network providers',
        summaryTR: 'Teminat anlaşmalı kurumlarla sınırlı olabilir',
      },
    ],
    claimsProcess: {
      notificationPeriodDays: 3,
      requiredDocuments: [
        'Medical reports',
        'Receipts and invoices',
        'Prescription copies',
        'Lab results',
      ],
      requiredDocumentsTR: [
        'Tıbbi raporlar',
        'Fatura ve makbuzlar',
        'Reçete fotokopileri',
        'Laboratuvar sonuçları',
      ],
      paymentPeriodDays: 15,
    },
  },

  // LIFE INSURANCE
  {
    id: 'gs_hayat',
    type: 'general_condition',
    category: ['life'],
    nameTR: 'Hayat Sigortası Genel Şartları',
    nameEN: 'Life Insurance General Conditions',
    description: 'Standard terms for life insurance',
    descriptionTR: 'Hayat sigortası standart hükümleri',
    publishDate: '2020-01-01',
    effectiveDate: '2020-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2020.1',
    isActive: true,
    mandatoryCoverages: ['Vefat Teminatı (Death Benefit)'],
    optionalCoverages: [
      'Sürekli Sakatlık (Permanent Disability)',
      'Kritik Hastalık (Critical Illness)',
      'İşsizlik Teminatı (Unemployment)',
      'Birikim (Savings)',
      'Ferdi Kaza Eklentisi',
    ],
    standardExclusions: [
      'İntihar (ilk 2 yıl)',
      'Savaş, isyan',
      'Nükleer riskler',
      'Kasıtlı suç işleme sırasında ölüm',
      'Alkol/uyuşturucu etkisi altında kaza',
    ],
    claimsProcess: {
      notificationPeriodDays: 30,
      requiredDocuments: [
        'Death certificate',
        'Police policy',
        'Beneficiary ID documents',
        'Medical reports (if applicable)',
      ],
      requiredDocumentsTR: [
        'Ölüm belgesi',
        'Sigorta poliçesi',
        'Lehdar kimlik belgeleri',
        'Tıbbi raporlar (gerekirse)',
      ],
      paymentPeriodDays: 30,
    },
  },

  // PERSONAL ACCIDENT
  {
    id: 'gs_ferdi_kaza',
    type: 'general_condition',
    category: ['accident'],
    nameTR: 'Ferdi Kaza Sigortası Genel Şartları',
    nameEN: 'Personal Accident Insurance General Conditions',
    description: 'Standard terms for personal accident insurance',
    descriptionTR: 'Ferdi kaza sigortası standart hükümleri',
    publishDate: '2019-01-01',
    effectiveDate: '2019-01-01',
    source: 'SEDDK',
    sourceUrl: 'https://www.seddk.gov.tr/tr/mevzuat/sigortacilik/genel-sartlar',
    version: '2019.1',
    isActive: true,
    mandatoryCoverages: [],
    optionalCoverages: [
      'Kaza Sonucu Ölüm (Accidental Death)',
      'Kaza Sonucu Sürekli Sakatlık (Permanent Disability)',
      'Kaza Sonucu Tedavi Giderleri (Treatment Expenses)',
      'Gündelik Tazminat (Daily Allowance)',
    ],
    standardExclusions: [
      'İntihar veya intihar teşebbüsü',
      'Kasıtlı suç işleme',
      'Profesyonel spor faaliyetleri',
      'Savaş, isyan',
      'Nükleer riskler',
    ],
    claimsProcess: {
      notificationPeriodDays: 5,
      requiredDocuments: [
        'Accident report',
        'Medical reports',
        'Hospital discharge summary',
        'Disability assessment (if applicable)',
      ],
      requiredDocumentsTR: [
        'Kaza raporu',
        'Tıbbi raporlar',
        'Hastane epikriz raporu',
        'Maluliyet raporu (gerekirse)',
      ],
      paymentPeriodDays: 15,
    },
  },

  // EMPLOYER LIABILITY
  {
    id: 'gs_isveren_sorumluluk',
    type: 'general_condition',
    category: ['liability'],
    nameTR: 'İşveren Mali Sorumluluk Sigortası Genel Şartları',
    nameEN: 'Employer Liability Insurance General Conditions',
    description: 'Standard terms for employer liability insurance',
    descriptionTR: 'İşveren mali sorumluluk sigortası standart hükümleri',
    publishDate: '2018-01-01',
    effectiveDate: '2018-01-01',
    source: 'SEDDK',
    version: '2018.1',
    isActive: true,
    mandatoryCoverages: [],
    optionalCoverages: [
      'İş Kazası Teminatı (Workplace Accident)',
      'Meslek Hastalığı (Occupational Disease)',
      'Rücu Teminatı (Recourse)',
    ],
    standardExclusions: [
      'Kasıtlı ihlaller',
      'Yasal yükümlülük dışı ödemeler',
      'Hukuki masraflar (eklenti ile teminat altına alınabilir)',
    ],
    claimsProcess: {
      notificationPeriodDays: 5,
      requiredDocuments: [
        'Workplace accident report',
        'SGK notification',
        'Medical reports',
        'Employee records',
      ],
      requiredDocumentsTR: [
        'İş kazası raporu',
        'SGK bildirimi',
        'Tıbbi raporlar',
        'Çalışan kayıtları',
      ],
      paymentPeriodDays: 30,
    },
  },
]

// =============================================================================
// RECENT CIRCULARS (GENELGELER) - 2024-2026
// =============================================================================

export const RECENT_CIRCULARS: Regulation[] = [
  {
    id: 'genelge_2025_33',
    type: 'circular',
    category: ['all'],
    nameTR: 'Sigortacılık Sektöründe Enflasyon Muhasebesi Uygulaması Hakkında Genelge',
    nameEN: 'Circular on Inflation Accounting in Insurance Sector',
    description:
      'Guidelines for implementing inflation accounting in insurance sector financial statements',
    descriptionTR:
      'Sigorta sektörü mali tablolarında enflasyon muhasebesi uygulaması rehberi',
    publishDate: '2025-01-15',
    effectiveDate: '2025-01-01',
    source: 'SEDDK',
    version: '2025/33',
    isActive: true,
    keyProvisions: [
      {
        title: 'TFRS 17 Compliance',
        titleTR: 'TFRS 17 Uyumu',
        summary: 'Insurance companies must comply with TFRS 17 from January 1, 2025',
        summaryTR:
          'Sigorta şirketleri 1 Ocak 2025\'ten itibaren TFRS 17\'ye uyum sağlamalıdır',
      },
    ],
  },
  {
    id: 'genelge_2025_28',
    type: 'circular',
    category: ['health'],
    nameTR: 'Özel Sağlık Sigortaları Yönetmeliğinin Uygulama Esaslarına İlişkin Genelge',
    nameEN: 'Circular on Implementation of Private Health Insurance Regulation',
    description: 'Implementation guidelines for private health insurance regulation',
    descriptionTR: 'Özel sağlık sigortaları yönetmeliği uygulama esasları',
    publishDate: '2025-01-10',
    effectiveDate: '2025-01-01',
    source: 'SEDDK',
    version: '2025/28',
    isActive: true,
    supersedes: ['genelge_2024_15'],
    keyProvisions: [
      {
        title: 'Network Requirements',
        titleTR: 'Anlaşmalı Kurum Gereksinimleri',
        summary: 'Updated requirements for provider network adequacy',
        summaryTR: 'Anlaşmalı kurum ağı yeterliliği için güncellenmiş gereksinimler',
      },
    ],
  },
  {
    id: 'genelge_2024_zmss_tarife',
    type: 'tariff',
    category: ['traffic'],
    nameTR:
      'Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortasında Tarife Uygulama Esasları',
    nameEN: 'Motor Vehicle MTPL Tariff Implementation Guidelines',
    description: 'Updated tariff guidelines for mandatory traffic insurance',
    descriptionTR: 'Zorunlu trafik sigortası güncellenmiş tarife esasları',
    publishDate: '2024-12-15',
    effectiveDate: '2025-01-01',
    source: 'SEDDK',
    version: '2024.12',
    isActive: true,
    keyProvisions: [
      {
        title: 'Premium Adjustments',
        titleTR: 'Prim Düzenlemeleri',
        summary: 'SEDDK authorized up to 2% monthly premium increases for 2025',
        summaryTR: 'SEDDK 2025 için aylık %2\'ye kadar prim artışına yetki verdi',
      },
    ],
  },
]

// =============================================================================
// CLAUSES (KLOZLAR)
// =============================================================================

export const STANDARD_CLAUSES: Clause[] = [
  // Fire Insurance Clauses
  {
    id: 'kloz_deprem',
    type: 'clause',
    category: ['fire'],
    code: 'DEP',
    nameTR: 'Deprem Klozu',
    nameEN: 'Earthquake Clause',
    description: 'Extends fire insurance to cover earthquake damage',
    descriptionTR: 'Yangın sigortasını deprem hasarlarını kapsayacak şekilde genişletir',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'variable',
      rate: 0.002, // 0.2% - varies by zone
    },
  },
  {
    id: 'kloz_sel',
    type: 'clause',
    category: ['fire'],
    code: 'SEL',
    nameTR: 'Sel ve Su Baskını Klozu',
    nameEN: 'Flood and Water Damage Clause',
    description: 'Coverage for flood and water damage',
    descriptionTR: 'Sel ve su baskını hasarları teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'variable',
      rate: 0.0015,
    },
  },
  {
    id: 'kloz_firtina',
    type: 'clause',
    category: ['fire'],
    code: 'FIR',
    nameTR: 'Fırtına Klozu',
    nameEN: 'Storm Clause',
    description: 'Coverage for storm damage',
    descriptionTR: 'Fırtına hasarları teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'percentage',
      rate: 0.001,
    },
  },
  {
    id: 'kloz_hirsizlik',
    type: 'clause',
    category: ['fire'],
    code: 'HIR',
    nameTR: 'Hırsızlık Klozu',
    nameEN: 'Theft Clause',
    description: 'Coverage for theft and burglary',
    descriptionTR: 'Hırsızlık ve soygun teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'variable',
      rate: 0.002,
    },
  },
  {
    id: 'kloz_dahili_su',
    type: 'clause',
    category: ['fire'],
    code: 'DSU',
    nameTR: 'Dahili Su Klozu',
    nameEN: 'Internal Water Damage Clause',
    description: 'Coverage for internal water damage (pipes, appliances)',
    descriptionTR:
      'Dahili su hasarları (boru patlaması, cihaz arızası) teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'percentage',
      rate: 0.0008,
    },
  },
  {
    id: 'kloz_teror',
    type: 'clause',
    category: ['fire'],
    code: 'TER',
    nameTR: 'Terör Klozu',
    nameEN: 'Terrorism Clause',
    description: 'Coverage for terrorism-related damage',
    descriptionTR: 'Terör kaynaklı hasarlar teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_yangin'],
    premium: {
      type: 'variable',
      rate: 0.0005,
    },
  },

  // Kasko Clauses
  {
    id: 'kloz_ferdi_kaza_kasko',
    type: 'clause',
    category: ['kasko'],
    code: 'FKK',
    nameTR: 'Kasko Ferdi Kaza Klozu',
    nameEN: 'Kasko Personal Accident Clause',
    description: 'Adds personal accident coverage to kasko policy',
    descriptionTR: 'Kasko poliçesine ferdi kaza teminatı ekler',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_kasko'],
    premium: {
      type: 'fixed',
    },
  },
  {
    id: 'kloz_ihtiyari_mali',
    type: 'clause',
    category: ['kasko'],
    code: 'IMM',
    nameTR: 'İhtiyari Mali Mesuliyet Klozu',
    nameEN: 'Voluntary Third Party Liability Clause',
    description: 'Increases liability coverage beyond mandatory limits',
    descriptionTR: 'Zorunlu limitlerin üzerinde sorumluluk teminatı sağlar',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_kasko'],
    premium: {
      type: 'variable',
    },
  },
  {
    id: 'kloz_yol_yardim',
    type: 'clause',
    category: ['kasko'],
    code: 'YYK',
    nameTR: 'Yol Yardım Klozu',
    nameEN: 'Roadside Assistance Clause',
    description: '24/7 roadside assistance coverage',
    descriptionTR: '7/24 yol yardım hizmeti teminatı',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_kasko'],
    premium: {
      type: 'fixed',
    },
  },
  {
    id: 'kloz_ikame_arac',
    type: 'clause',
    category: ['kasko'],
    code: 'IKA',
    nameTR: 'İkame Araç Klozu',
    nameEN: 'Replacement Vehicle Clause',
    description: 'Provides replacement vehicle during repairs',
    descriptionTR: 'Onarım süresince ikame araç sağlar',
    effectiveDate: '2020-01-01',
    isActive: true,
    applicableTo: ['gs_kasko'],
    premium: {
      type: 'fixed',
    },
  },
]

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

export function getRegulationById(id: string): Regulation | GeneralCondition | undefined {
  return [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS].find(
    (r) => r.id === id
  )
}

export function getGeneralConditionByCategory(
  category: InsuranceCategoryRef
): GeneralCondition | undefined {
  return GENERAL_CONDITIONS.find((gc) => gc.category.includes(category))
}

export function getActiveRegulations(category?: InsuranceCategoryRef): Regulation[] {
  const all = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]

  return all.filter((r) => {
    if (!r.isActive) return false
    if (category && !r.category.includes(category) && !r.category.includes('all')) {
      return false
    }
    return true
  })
}

export function getClausesByCategory(category: InsuranceCategoryRef): Clause[] {
  return STANDARD_CLAUSES.filter((c) => c.category.includes(category) && c.isActive)
}

export function searchRegulations(query: string): Regulation[] {
  const q = query.toLowerCase()
  const all = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]

  return all.filter(
    (r) =>
      r.nameTR.toLowerCase().includes(q) ||
      r.nameEN.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.descriptionTR.toLowerCase().includes(q)
  )
}

// =============================================================================
// VERSION TRACKING - Get Latest Superseding Regulation
// =============================================================================

export function getLatestVersion(regulationId: string): Regulation | undefined {
  const regulation = getRegulationById(regulationId)
  if (!regulation) return undefined

  // If this regulation is superseded, find the newer one
  if (regulation.supersededBy) {
    return getLatestVersion(regulation.supersededBy)
  }

  return regulation
}

export function getRegulationHistory(regulationId: string): Regulation[] {
  const history: Regulation[] = []
  const regulation = getRegulationById(regulationId)

  if (!regulation) return history

  // Get older versions
  if (regulation.supersedes) {
    for (const oldId of regulation.supersedes) {
      const oldReg = getRegulationById(oldId)
      if (oldReg) {
        history.push(oldReg)
        history.push(...getRegulationHistory(oldId))
      }
    }
  }

  // Add current
  history.unshift(regulation)

  // Get newer versions if any
  const allRegs = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
  const newerRegs = allRegs.filter((r) => r.supersedes?.includes(regulationId))
  for (const newer of newerRegs) {
    history.push(newer)
    history.push(...getRegulationHistory(newer.id).slice(1))
  }

  return history
}

// =============================================================================
// ALL EXPORTS
// =============================================================================

export const ALL_REGULATIONS = [...PRIMARY_LAWS, ...GENERAL_CONDITIONS, ...RECENT_CIRCULARS]
export const ALL_CLAUSES = STANDARD_CLAUSES
