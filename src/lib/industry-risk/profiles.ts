/**
 * Industry Risk Profiles
 * Comprehensive risk data for Turkish business sectors
 */

import type { RiskLevel } from '@/types/risk'
import type {
  IndustrySector,
  IndustryRiskProfile,
  IndustryRiskCategory,
  IndustryRiskFactor,
  IndustryCoverageRequirement,
} from '@/types/industry-risk'

// =============================================================================
// Helper Functions
// =============================================================================

function createRiskFactor(
  category: IndustryRiskCategory,
  name: string,
  nameTr: string,
  score: number,
  frequency: IndustryRiskFactor['frequency'],
  severity: IndustryRiskFactor['severity'],
  controls: string[],
  controlsTr: string[]
): IndustryRiskFactor {
  let level: RiskLevel = 'very_low'
  if (score > 75) level = 'very_high'
  else if (score > 55) level = 'high'
  else if (score > 35) level = 'moderate'
  else if (score > 20) level = 'low'

  return {
    category,
    name,
    nameTr,
    description: `${name} risk assessment`,
    descriptionTr: `${nameTr} risk değerlendirmesi`,
    baseScore: score,
    level,
    frequency,
    severity,
    controlMeasures: controls,
    controlMeasuresTr: controlsTr,
  }
}

function createCoverageRequirement(
  type: string,
  typeTr: string,
  importance: IndustryCoverageRequirement['importance'],
  minLimit: number,
  recommendedLimit: number,
  deductible: number,
  reason: string,
  reasonTr: string,
  regulatory?: string
): IndustryCoverageRequirement {
  return {
    coverageType: type,
    coverageTypeTr: typeTr,
    importance,
    minLimit,
    recommendedLimit,
    typicalDeductible: deductible,
    reason,
    reasonTr,
    regulatoryBasis: regulatory,
  }
}

// =============================================================================
// Industry Risk Profiles
// =============================================================================

/**
 * Manufacturing industry risk profile
 */
const MANUFACTURING_PROFILE: IndustryRiskProfile = {
  sector: 'manufacturing',
  name: 'Manufacturing',
  nameTr: 'İmalat',
  description: 'Production and assembly of goods including machinery, equipment, and consumer products',
  descriptionTr: 'Makine, ekipman ve tüketim ürünleri dahil mal üretimi ve montajı',

  overallRiskScore: 65,
  overallRiskLevel: 'high',

  riskFactors: [
    createRiskFactor('operational', 'Equipment Failure', 'Ekipman Arızası', 70, 'common', 'major',
      ['Regular maintenance schedules', 'Backup equipment', 'Operator training'],
      ['Düzenli bakım programları', 'Yedek ekipman', 'Operatör eğitimi']),
    createRiskFactor('employee', 'Workplace Injuries', 'İş Kazaları', 75, 'common', 'major',
      ['Safety training', 'PPE requirements', 'Safety audits'],
      ['Güvenlik eğitimi', 'KKD gereksinimleri', 'Güvenlik denetimleri']),
    createRiskFactor('property', 'Fire Hazard', 'Yangın Tehlikesi', 65, 'occasional', 'catastrophic',
      ['Fire suppression systems', 'Regular inspections', 'Emergency protocols'],
      ['Yangın söndürme sistemleri', 'Düzenli denetimler', 'Acil durum protokolleri']),
    createRiskFactor('product', 'Product Defects', 'Ürün Kusurları', 55, 'occasional', 'major',
      ['Quality control', 'Testing protocols', 'Recall procedures'],
      ['Kalite kontrol', 'Test protokolleri', 'Geri çağırma prosedürleri']),
    createRiskFactor('supply_chain', 'Supply Disruption', 'Tedarik Kesintisi', 50, 'occasional', 'moderate',
      ['Supplier diversification', 'Safety stock', 'Contract terms'],
      ['Tedarikçi çeşitlendirmesi', 'Emniyet stoğu', 'Sözleşme şartları']),
    createRiskFactor('environmental', 'Pollution Risk', 'Kirlilik Riski', 45, 'rare', 'major',
      ['Waste management', 'Emission controls', 'Environmental audits'],
      ['Atık yönetimi', 'Emisyon kontrolleri', 'Çevre denetimleri']),
  ],

  categoryScores: {
    operational: { score: 70, level: 'high', weight: 0.20 },
    property: { score: 65, level: 'high', weight: 0.15 },
    liability: { score: 55, level: 'moderate', weight: 0.12 },
    employee: { score: 75, level: 'high', weight: 0.15 },
    cyber: { score: 40, level: 'moderate', weight: 0.05 },
    environmental: { score: 45, level: 'moderate', weight: 0.08 },
    product: { score: 55, level: 'moderate', weight: 0.10 },
    business_interruption: { score: 60, level: 'high', weight: 0.08 },
    regulatory: { score: 50, level: 'moderate', weight: 0.04 },
    supply_chain: { score: 50, level: 'moderate', weight: 0.03 },
    reputation: { score: 35, level: 'low', weight: 0.00 },
    financial: { score: 40, level: 'moderate', weight: 0.00 },
  },

  premiumModifiers: {
    baseMultiplier: 1.25,
    sizeAdjustments: { micro: 0.8, small: 0.9, medium: 1.0, large: 1.15, enterprise: 1.3 },
    regionAdjustments: { marmara: 1.1, ege: 1.0, ic_anadolu: 0.95, akdeniz: 1.0, karadeniz: 0.9, dogu_anadolu: 0.85, guneydogu: 0.9 },
  },

  coverageRequirements: [
    createCoverageRequirement('Fire Insurance', 'Yangın Sigortası', 'mandatory', 1000000, 5000000, 10000,
      'Essential for protecting manufacturing facilities and equipment', 'Üretim tesisleri ve ekipmanlarını korumak için gerekli'),
    createCoverageRequirement('Business Interruption', 'İş Durması', 'highly_recommended', 500000, 2000000, 25000,
      'Covers lost revenue during production stoppages', 'Üretim duraklamaları sırasında gelir kaybını karşılar'),
    createCoverageRequirement('Machinery Breakdown', 'Makine Kırılması', 'highly_recommended', 250000, 1500000, 15000,
      'Covers repair/replacement of production equipment', 'Üretim ekipmanlarının onarım/değişimini karşılar'),
    createCoverageRequirement('Employer Liability', 'İşveren Sorumluluğu', 'mandatory', 500000, 2000000, 5000,
      'Required for worker injury claims', 'İşçi yaralanma talepleri için gerekli', 'İş Kanunu 77'),
    createCoverageRequirement('Product Liability', 'Ürün Sorumluluğu', 'highly_recommended', 250000, 1000000, 10000,
      'Protects against defective product claims', 'Kusurlu ürün taleplerine karşı korur'),
    createCoverageRequirement('Environmental Liability', 'Çevre Sorumluluk', 'recommended', 100000, 500000, 20000,
      'Covers pollution and environmental damage claims', 'Kirlilik ve çevre hasarı taleplerini karşılar'),
  ],

  regulatoryRequirements: {
    mandatory: ['Employer liability insurance', 'Fire safety certification', 'Environmental permits'],
    mandatoryTr: ['İşveren sorumluluk sigortası', 'Yangın güvenlik sertifikası', 'Çevre izinleri'],
    recommended: ['ISO 9001 certification', 'OHSAS 18001', 'Product quality testing'],
    recommendedTr: ['ISO 9001 sertifikası', 'OHSAS 18001', 'Ürün kalite testleri'],
  },

  trends: {
    riskTrend: 'stable',
    premiumTrend: 'increasing',
    emergingRisks: ['Supply chain digitalization', 'Automation safety', 'Raw material volatility'],
    emergingRisksTr: ['Tedarik zinciri dijitalleşmesi', 'Otomasyon güvenliği', 'Hammadde volatilitesi'],
  },

  benchmarks: {
    avgPremium: 4500, // Per million TRY revenue
    avgClaimsRatio: 0.58,
    avgCoverageLimit: 8500000,
    marketPenetration: 0.72,
  },
}

/**
 * Technology industry risk profile
 */
const TECHNOLOGY_PROFILE: IndustryRiskProfile = {
  sector: 'technology',
  name: 'Technology',
  nameTr: 'Teknoloji',
  description: 'Software development, IT services, and digital platforms',
  descriptionTr: 'Yazılım geliştirme, BT hizmetleri ve dijital platformlar',

  overallRiskScore: 48,
  overallRiskLevel: 'moderate',

  riskFactors: [
    createRiskFactor('cyber', 'Data Breach', 'Veri İhlali', 80, 'common', 'catastrophic',
      ['Encryption', 'Access controls', 'Security audits', 'Incident response plan'],
      ['Şifreleme', 'Erişim kontrolleri', 'Güvenlik denetimleri', 'Olay müdahale planı']),
    createRiskFactor('cyber', 'System Downtime', 'Sistem Kesintisi', 65, 'common', 'major',
      ['Redundancy', 'Backup systems', 'SLA monitoring', 'Disaster recovery'],
      ['Yedeklilik', 'Yedekleme sistemleri', 'SLA izleme', 'Felaket kurtarma']),
    createRiskFactor('liability', 'Professional Errors', 'Mesleki Hatalar', 55, 'occasional', 'major',
      ['Code review', 'Testing protocols', 'Documentation', 'Change management'],
      ['Kod inceleme', 'Test protokolleri', 'Dokümantasyon', 'Değişiklik yönetimi']),
    createRiskFactor('regulatory', 'KVKK Compliance', 'KVKK Uyumu', 60, 'common', 'major',
      ['Data mapping', 'Consent management', 'Privacy by design', 'DPO appointment'],
      ['Veri haritalama', 'Onay yönetimi', 'Tasarımda gizlilik', 'VKS atama']),
    createRiskFactor('employee', 'Key Person Risk', 'Kilit Personel Riski', 50, 'occasional', 'moderate',
      ['Documentation', 'Cross-training', 'Succession planning'],
      ['Dokümantasyon', 'Çapraz eğitim', 'Halef planlama']),
  ],

  categoryScores: {
    operational: { score: 45, level: 'moderate', weight: 0.10 },
    property: { score: 25, level: 'low', weight: 0.05 },
    liability: { score: 55, level: 'moderate', weight: 0.15 },
    employee: { score: 40, level: 'moderate', weight: 0.10 },
    cyber: { score: 80, level: 'very_high', weight: 0.25 },
    environmental: { score: 10, level: 'very_low', weight: 0.00 },
    product: { score: 45, level: 'moderate', weight: 0.10 },
    business_interruption: { score: 55, level: 'moderate', weight: 0.10 },
    regulatory: { score: 60, level: 'high', weight: 0.10 },
    supply_chain: { score: 30, level: 'low', weight: 0.03 },
    reputation: { score: 55, level: 'moderate', weight: 0.02 },
    financial: { score: 35, level: 'low', weight: 0.00 },
  },

  premiumModifiers: {
    baseMultiplier: 0.85,
    sizeAdjustments: { micro: 0.7, small: 0.85, medium: 1.0, large: 1.2, enterprise: 1.4 },
    regionAdjustments: { marmara: 1.05, ege: 1.0, ic_anadolu: 1.0, akdeniz: 0.95, karadeniz: 0.9, dogu_anadolu: 0.85, guneydogu: 0.9 },
  },

  coverageRequirements: [
    createCoverageRequirement('Cyber Insurance', 'Siber Sigorta', 'mandatory', 500000, 5000000, 25000,
      'Essential for data breach and cyber attack coverage', 'Veri ihlali ve siber saldırı kapsamı için gerekli'),
    createCoverageRequirement('Professional Indemnity', 'Mesleki Sorumluluk', 'mandatory', 250000, 2000000, 10000,
      'Covers errors and omissions in professional services', 'Profesyonel hizmetlerdeki hata ve eksiklikleri karşılar'),
    createCoverageRequirement('Technology E&O', 'Teknoloji E&O', 'highly_recommended', 250000, 1500000, 15000,
      'Covers technology-specific professional liability', 'Teknolojiye özgü mesleki sorumluluğu karşılar'),
    createCoverageRequirement('Business Interruption', 'İş Durması', 'highly_recommended', 250000, 1000000, 20000,
      'Covers revenue loss from system failures', 'Sistem arızalarından kaynaklanan gelir kaybını karşılar'),
    createCoverageRequirement('Directors & Officers', 'Yönetici Sorumluluk', 'recommended', 100000, 500000, 10000,
      'Protects leadership from management liability', 'Liderliği yönetim sorumluluğundan korur'),
  ],

  regulatoryRequirements: {
    mandatory: ['KVKK compliance', 'BTK registration (if applicable)', 'Consumer protection compliance'],
    mandatoryTr: ['KVKK uyumu', 'BTK kaydı (geçerliyse)', 'Tüketici koruma uyumu'],
    recommended: ['ISO 27001', 'SOC 2', 'GDPR compliance (for EU clients)'],
    recommendedTr: ['ISO 27001', 'SOC 2', 'GDPR uyumu (AB müşterileri için)'],
  },

  trends: {
    riskTrend: 'increasing',
    premiumTrend: 'increasing',
    emergingRisks: ['AI liability', 'Ransomware sophistication', 'Remote work security', 'API vulnerabilities'],
    emergingRisksTr: ['Yapay zeka sorumluluğu', 'Fidye yazılım gelişmişliği', 'Uzaktan çalışma güvenliği', 'API güvenlik açıkları'],
  },

  benchmarks: {
    avgPremium: 3200,
    avgClaimsRatio: 0.42,
    avgCoverageLimit: 4500000,
    marketPenetration: 0.58,
  },
}

/**
 * Healthcare industry risk profile
 */
const HEALTHCARE_PROFILE: IndustryRiskProfile = {
  sector: 'healthcare',
  name: 'Healthcare',
  nameTr: 'Sağlık',
  description: 'Hospitals, clinics, medical practices, and healthcare services',
  descriptionTr: 'Hastaneler, klinikler, tıbbi uygulamalar ve sağlık hizmetleri',

  overallRiskScore: 72,
  overallRiskLevel: 'high',

  riskFactors: [
    createRiskFactor('liability', 'Medical Malpractice', 'Tıbbi Uygulama Hatası', 85, 'common', 'catastrophic',
      ['Clinical protocols', 'Peer review', 'Consent processes', 'Documentation'],
      ['Klinik protokoller', 'Meslektaş değerlendirmesi', 'Onam süreçleri', 'Dokümantasyon']),
    createRiskFactor('regulatory', 'Regulatory Compliance', 'Mevzuat Uyumu', 75, 'frequent', 'major',
      ['Compliance officer', 'Regular audits', 'Staff training', 'Policy updates'],
      ['Uyum görevlisi', 'Düzenli denetimler', 'Personel eğitimi', 'Politika güncellemeleri']),
    createRiskFactor('cyber', 'Patient Data Breach', 'Hasta Verileri İhlali', 70, 'occasional', 'catastrophic',
      ['HIPAA-style controls', 'Encryption', 'Access logging', 'Staff training'],
      ['HIPAA tarzı kontroller', 'Şifreleme', 'Erişim kaydı', 'Personel eğitimi']),
    createRiskFactor('employee', 'Staff Burnout', 'Personel Tükenmişliği', 60, 'common', 'moderate',
      ['Workload management', 'Mental health support', 'Adequate staffing'],
      ['İş yükü yönetimi', 'Ruh sağlığı desteği', 'Yeterli personel']),
    createRiskFactor('property', 'Medical Equipment', 'Tıbbi Ekipman', 55, 'occasional', 'major',
      ['Maintenance contracts', 'Backup equipment', 'Calibration schedules'],
      ['Bakım sözleşmeleri', 'Yedek ekipman', 'Kalibrasyon programları']),
  ],

  categoryScores: {
    operational: { score: 65, level: 'high', weight: 0.12 },
    property: { score: 55, level: 'moderate', weight: 0.08 },
    liability: { score: 85, level: 'very_high', weight: 0.25 },
    employee: { score: 60, level: 'high', weight: 0.10 },
    cyber: { score: 70, level: 'high', weight: 0.12 },
    environmental: { score: 40, level: 'moderate', weight: 0.03 },
    product: { score: 45, level: 'moderate', weight: 0.05 },
    business_interruption: { score: 60, level: 'high', weight: 0.08 },
    regulatory: { score: 75, level: 'high', weight: 0.12 },
    supply_chain: { score: 45, level: 'moderate', weight: 0.03 },
    reputation: { score: 65, level: 'high', weight: 0.02 },
    financial: { score: 50, level: 'moderate', weight: 0.00 },
  },

  premiumModifiers: {
    baseMultiplier: 1.45,
    sizeAdjustments: { micro: 0.75, small: 0.9, medium: 1.0, large: 1.25, enterprise: 1.5 },
    regionAdjustments: { marmara: 1.15, ege: 1.05, ic_anadolu: 1.0, akdeniz: 1.0, karadeniz: 0.9, dogu_anadolu: 0.85, guneydogu: 0.9 },
  },

  coverageRequirements: [
    createCoverageRequirement('Medical Malpractice', 'Tıbbi Malpraktis', 'mandatory', 1000000, 10000000, 25000,
      'Essential coverage for medical professionals', 'Tıp profesyonelleri için gerekli teminat', 'Sağlık Mevzuatı'),
    createCoverageRequirement('Professional Indemnity', 'Mesleki Sorumluluk', 'mandatory', 500000, 5000000, 15000,
      'Covers professional negligence claims', 'Mesleki ihmal taleplerini karşılar'),
    createCoverageRequirement('Cyber/Data Privacy', 'Siber/Veri Gizliliği', 'highly_recommended', 500000, 3000000, 20000,
      'Covers patient data breach incidents', 'Hasta veri ihlali olaylarını karşılar'),
    createCoverageRequirement('Employer Liability', 'İşveren Sorumluluğu', 'mandatory', 500000, 2000000, 5000,
      'Covers employee injury claims', 'Çalışan yaralanma taleplerini karşılar', 'İş Kanunu 77'),
    createCoverageRequirement('Equipment Breakdown', 'Ekipman Arızası', 'highly_recommended', 250000, 2000000, 10000,
      'Covers medical equipment repair/replacement', 'Tıbbi ekipman onarım/değişimini karşılar'),
  ],

  regulatoryRequirements: {
    mandatory: ['Health Ministry licenses', 'KVKK health data compliance', 'Professional liability insurance', 'Facility certifications'],
    mandatoryTr: ['Sağlık Bakanlığı ruhsatları', 'KVKK sağlık verisi uyumu', 'Mesleki sorumluluk sigortası', 'Tesis sertifikaları'],
    recommended: ['JCI accreditation', 'ISO 15189 (labs)', 'Quality management system'],
    recommendedTr: ['JCI akreditasyonu', 'ISO 15189 (laboratuvarlar)', 'Kalite yönetim sistemi'],
  },

  trends: {
    riskTrend: 'increasing',
    premiumTrend: 'increasing',
    emergingRisks: ['Telemedicine liability', 'AI diagnostic errors', 'Mental health claims', 'Staff shortages'],
    emergingRisksTr: ['Telemedicine sorumluluğu', 'Yapay zeka tanı hataları', 'Ruh sağlığı talepleri', 'Personel eksikliği'],
  },

  benchmarks: {
    avgPremium: 6800,
    avgClaimsRatio: 0.65,
    avgCoverageLimit: 12000000,
    marketPenetration: 0.85,
  },
}

/**
 * Construction industry risk profile
 */
const CONSTRUCTION_PROFILE: IndustryRiskProfile = {
  sector: 'construction',
  name: 'Construction',
  nameTr: 'İnşaat',
  description: 'Building construction, civil engineering, and construction services',
  descriptionTr: 'Bina inşaatı, inşaat mühendisliği ve inşaat hizmetleri',

  overallRiskScore: 78,
  overallRiskLevel: 'high',

  riskFactors: [
    createRiskFactor('employee', 'Worker Injuries', 'İşçi Yaralanmaları', 90, 'frequent', 'catastrophic',
      ['Safety training', 'PPE enforcement', 'Site supervision', 'Safety audits'],
      ['Güvenlik eğitimi', 'KKD uygulaması', 'Şantiye denetimi', 'Güvenlik denetimleri']),
    createRiskFactor('property', 'Site Damage', 'Şantiye Hasarı', 75, 'common', 'major',
      ['Security', 'Weather protection', 'Equipment maintenance'],
      ['Güvenlik', 'Hava koruması', 'Ekipman bakımı']),
    createRiskFactor('liability', 'Third Party Damage', 'Üçüncü Taraf Hasarı', 70, 'occasional', 'major',
      ['Site barriers', 'Warning signs', 'Neighbor communication'],
      ['Şantiye bariyerleri', 'Uyarı işaretleri', 'Komşu iletişimi']),
    createRiskFactor('operational', 'Project Delays', 'Proje Gecikmeleri', 65, 'common', 'moderate',
      ['Project management', 'Buffer planning', 'Contractor vetting'],
      ['Proje yönetimi', 'Tampon planlama', 'Müteahhit değerlendirmesi']),
    createRiskFactor('environmental', 'Environmental Impact', 'Çevresel Etki', 55, 'occasional', 'major',
      ['Environmental assessments', 'Dust control', 'Waste management'],
      ['Çevre değerlendirmeleri', 'Toz kontrolü', 'Atık yönetimi']),
  ],

  categoryScores: {
    operational: { score: 65, level: 'high', weight: 0.12 },
    property: { score: 75, level: 'high', weight: 0.15 },
    liability: { score: 70, level: 'high', weight: 0.15 },
    employee: { score: 90, level: 'very_high', weight: 0.20 },
    cyber: { score: 25, level: 'low', weight: 0.03 },
    environmental: { score: 55, level: 'moderate', weight: 0.08 },
    product: { score: 50, level: 'moderate', weight: 0.05 },
    business_interruption: { score: 60, level: 'high', weight: 0.10 },
    regulatory: { score: 60, level: 'high', weight: 0.07 },
    supply_chain: { score: 55, level: 'moderate', weight: 0.05 },
    reputation: { score: 45, level: 'moderate', weight: 0.00 },
    financial: { score: 55, level: 'moderate', weight: 0.00 },
  },

  premiumModifiers: {
    baseMultiplier: 1.55,
    sizeAdjustments: { micro: 0.85, small: 0.95, medium: 1.0, large: 1.2, enterprise: 1.4 },
    regionAdjustments: { marmara: 1.15, ege: 1.05, ic_anadolu: 0.95, akdeniz: 1.05, karadeniz: 0.9, dogu_anadolu: 0.85, guneydogu: 0.95 },
  },

  coverageRequirements: [
    createCoverageRequirement('Contractor All Risk', 'Müteahhit Tüm Riskler', 'mandatory', 1000000, 10000000, 50000,
      'Comprehensive project insurance', 'Kapsamlı proje sigortası'),
    createCoverageRequirement('Employer Liability', 'İşveren Sorumluluğu', 'mandatory', 1000000, 5000000, 10000,
      'Essential for construction worker protection', 'İnşaat işçisi koruması için gerekli', 'İş Kanunu 77'),
    createCoverageRequirement('Third Party Liability', 'Üçüncü Taraf Sorumluluğu', 'mandatory', 500000, 3000000, 15000,
      'Covers damage to third parties during construction', 'İnşaat sırasında üçüncü taraflara verilen hasarı karşılar'),
    createCoverageRequirement('Equipment Insurance', 'Ekipman Sigortası', 'highly_recommended', 250000, 2000000, 20000,
      'Covers construction equipment and machinery', 'İnşaat ekipman ve makinelerini karşılar'),
    createCoverageRequirement('Performance Bond', 'Performans Teminatı', 'highly_recommended', 500000, 5000000, 0,
      'Guarantees project completion', 'Proje tamamlanmasını garanti eder'),
  ],

  regulatoryRequirements: {
    mandatory: ['Construction permits', 'Employer liability insurance', 'Occupational safety certificates', 'Environmental impact assessments'],
    mandatoryTr: ['İnşaat ruhsatları', 'İşveren sorumluluk sigortası', 'İş güvenliği sertifikaları', 'Çevresel etki değerlendirmeleri'],
    recommended: ['ISO 45001', 'Quality management certification', 'Environmental management system'],
    recommendedTr: ['ISO 45001', 'Kalite yönetim sertifikası', 'Çevre yönetim sistemi'],
  },

  trends: {
    riskTrend: 'stable',
    premiumTrend: 'increasing',
    emergingRisks: ['Material cost volatility', 'Skilled labor shortage', 'Sustainability requirements', 'Seismic regulations'],
    emergingRisksTr: ['Malzeme maliyet volatilitesi', 'Nitelikli işgücü eksikliği', 'Sürdürülebilirlik gereksinimleri', 'Deprem düzenlemeleri'],
  },

  benchmarks: {
    avgPremium: 7500,
    avgClaimsRatio: 0.72,
    avgCoverageLimit: 15000000,
    marketPenetration: 0.82,
  },
}

/**
 * Retail industry risk profile
 */
const RETAIL_PROFILE: IndustryRiskProfile = {
  sector: 'retail',
  name: 'Retail',
  nameTr: 'Perakende',
  description: 'Retail stores, shops, and consumer goods sales',
  descriptionTr: 'Perakende mağazaları, dükkanlar ve tüketim malları satışları',

  overallRiskScore: 45,
  overallRiskLevel: 'moderate',

  riskFactors: [
    createRiskFactor('property', 'Theft and Burglary', 'Hırsızlık', 65, 'common', 'moderate',
      ['Security systems', 'CCTV', 'Alarm systems', 'Staff training'],
      ['Güvenlik sistemleri', 'CCTV', 'Alarm sistemleri', 'Personel eğitimi']),
    createRiskFactor('property', 'Inventory Damage', 'Envanter Hasarı', 50, 'occasional', 'moderate',
      ['Proper storage', 'Fire prevention', 'Climate control'],
      ['Uygun depolama', 'Yangın önleme', 'İklim kontrolü']),
    createRiskFactor('liability', 'Customer Injuries', 'Müşteri Yaralanmaları', 45, 'occasional', 'moderate',
      ['Floor maintenance', 'Clear aisles', 'Warning signs'],
      ['Zemin bakımı', 'Temiz koridorlar', 'Uyarı işaretleri']),
    createRiskFactor('cyber', 'Payment Card Fraud', 'Ödeme Kartı Dolandırıcılığı', 55, 'common', 'moderate',
      ['PCI compliance', 'Secure POS', 'Staff training'],
      ['PCI uyumu', 'Güvenli POS', 'Personel eğitimi']),
    createRiskFactor('employee', 'Employee Dishonesty', 'Çalışan Sadakatsizliği', 40, 'occasional', 'minor',
      ['Background checks', 'Inventory controls', 'Cash handling procedures'],
      ['Geçmiş kontrolü', 'Envanter kontrolleri', 'Nakit işleme prosedürleri']),
  ],

  categoryScores: {
    operational: { score: 40, level: 'moderate', weight: 0.12 },
    property: { score: 55, level: 'moderate', weight: 0.20 },
    liability: { score: 45, level: 'moderate', weight: 0.15 },
    employee: { score: 35, level: 'low', weight: 0.10 },
    cyber: { score: 55, level: 'moderate', weight: 0.10 },
    environmental: { score: 15, level: 'very_low', weight: 0.02 },
    product: { score: 35, level: 'low', weight: 0.08 },
    business_interruption: { score: 45, level: 'moderate', weight: 0.10 },
    regulatory: { score: 30, level: 'low', weight: 0.05 },
    supply_chain: { score: 40, level: 'moderate', weight: 0.05 },
    reputation: { score: 35, level: 'low', weight: 0.03 },
    financial: { score: 40, level: 'moderate', weight: 0.00 },
  },

  premiumModifiers: {
    baseMultiplier: 0.95,
    sizeAdjustments: { micro: 0.7, small: 0.85, medium: 1.0, large: 1.1, enterprise: 1.25 },
    regionAdjustments: { marmara: 1.1, ege: 1.0, ic_anadolu: 0.95, akdeniz: 1.0, karadeniz: 0.85, dogu_anadolu: 0.8, guneydogu: 0.85 },
  },

  coverageRequirements: [
    createCoverageRequirement('Property Insurance', 'Mülk Sigortası', 'mandatory', 250000, 2000000, 5000,
      'Covers store premises and contents', 'Mağaza binası ve içeriğini karşılar'),
    createCoverageRequirement('Business Interruption', 'İş Durması', 'highly_recommended', 100000, 500000, 10000,
      'Covers lost revenue during closures', 'Kapanmalar sırasında gelir kaybını karşılar'),
    createCoverageRequirement('Public Liability', 'Kamu Sorumluluğu', 'mandatory', 100000, 500000, 2500,
      'Covers customer injury claims', 'Müşteri yaralanma taleplerini karşılar'),
    createCoverageRequirement('Theft Insurance', 'Hırsızlık Sigortası', 'highly_recommended', 50000, 250000, 2500,
      'Covers inventory theft and burglary', 'Envanter hırsızlığı ve soygun karşılar'),
    createCoverageRequirement('Cyber Insurance', 'Siber Sigorta', 'recommended', 50000, 250000, 5000,
      'Covers payment data breaches', 'Ödeme verisi ihlallerini karşılar'),
  ],

  regulatoryRequirements: {
    mandatory: ['Business license', 'Fire safety certification', 'Consumer protection compliance'],
    mandatoryTr: ['İşletme ruhsatı', 'Yangın güvenlik sertifikası', 'Tüketici koruma uyumu'],
    recommended: ['PCI-DSS compliance', 'Quality standards', 'Staff training certifications'],
    recommendedTr: ['PCI-DSS uyumu', 'Kalite standartları', 'Personel eğitim sertifikaları'],
  },

  trends: {
    riskTrend: 'stable',
    premiumTrend: 'stable',
    emergingRisks: ['E-commerce competition', 'Omnichannel risks', 'Delivery liability', 'Consumer data protection'],
    emergingRisksTr: ['E-ticaret rekabeti', 'Çok kanallı riskler', 'Teslimat sorumluluğu', 'Tüketici veri koruma'],
  },

  benchmarks: {
    avgPremium: 2800,
    avgClaimsRatio: 0.48,
    avgCoverageLimit: 3500000,
    marketPenetration: 0.55,
  },
}

// =============================================================================
// Profile Registry
// =============================================================================

/**
 * All industry risk profiles
 */
export const INDUSTRY_PROFILES: Record<IndustrySector, IndustryRiskProfile> = {
  manufacturing: MANUFACTURING_PROFILE,
  technology: TECHNOLOGY_PROFILE,
  healthcare: HEALTHCARE_PROFILE,
  construction: CONSTRUCTION_PROFILE,
  retail: RETAIL_PROFILE,
  // Add simplified profiles for remaining sectors
  wholesale: { ...RETAIL_PROFILE, sector: 'wholesale', name: 'Wholesale', nameTr: 'Toptan Ticaret', overallRiskScore: 42, premiumModifiers: { ...RETAIL_PROFILE.premiumModifiers, baseMultiplier: 0.90 } },
  transportation: { ...CONSTRUCTION_PROFILE, sector: 'transportation', name: 'Transportation', nameTr: 'Ulaştırma', overallRiskScore: 68, premiumModifiers: { ...CONSTRUCTION_PROFILE.premiumModifiers, baseMultiplier: 1.35 } },
  hospitality: { ...RETAIL_PROFILE, sector: 'hospitality', name: 'Hospitality', nameTr: 'Konaklama', overallRiskScore: 52, premiumModifiers: { ...RETAIL_PROFILE.premiumModifiers, baseMultiplier: 1.05 } },
  finance: { ...TECHNOLOGY_PROFILE, sector: 'finance', name: 'Finance', nameTr: 'Finans', overallRiskScore: 55, premiumModifiers: { ...TECHNOLOGY_PROFILE.premiumModifiers, baseMultiplier: 1.10 } },
  real_estate: { ...RETAIL_PROFILE, sector: 'real_estate', name: 'Real Estate', nameTr: 'Gayrimenkul', overallRiskScore: 40, premiumModifiers: { ...RETAIL_PROFILE.premiumModifiers, baseMultiplier: 0.85 } },
  professional_services: { ...TECHNOLOGY_PROFILE, sector: 'professional_services', name: 'Professional Services', nameTr: 'Profesyonel Hizmetler', overallRiskScore: 42, premiumModifiers: { ...TECHNOLOGY_PROFILE.premiumModifiers, baseMultiplier: 0.80 } },
  education: { ...HEALTHCARE_PROFILE, sector: 'education', name: 'Education', nameTr: 'Eğitim', overallRiskScore: 45, premiumModifiers: { ...HEALTHCARE_PROFILE.premiumModifiers, baseMultiplier: 0.75 } },
  agriculture: { ...MANUFACTURING_PROFILE, sector: 'agriculture', name: 'Agriculture', nameTr: 'Tarım', overallRiskScore: 55, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.00 } },
  mining: { ...CONSTRUCTION_PROFILE, sector: 'mining', name: 'Mining', nameTr: 'Madencilik', overallRiskScore: 85, premiumModifiers: { ...CONSTRUCTION_PROFILE.premiumModifiers, baseMultiplier: 1.80 } },
  utilities: { ...MANUFACTURING_PROFILE, sector: 'utilities', name: 'Utilities', nameTr: 'Kamu Hizmetleri', overallRiskScore: 58, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.15 } },
  food_beverage: { ...MANUFACTURING_PROFILE, sector: 'food_beverage', name: 'Food & Beverage', nameTr: 'Gıda ve İçecek', overallRiskScore: 60, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.20 } },
  textile: { ...MANUFACTURING_PROFILE, sector: 'textile', name: 'Textile', nameTr: 'Tekstil', overallRiskScore: 58, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.15 } },
  automotive: { ...MANUFACTURING_PROFILE, sector: 'automotive', name: 'Automotive', nameTr: 'Otomotiv', overallRiskScore: 68, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.35 } },
  chemical: { ...MANUFACTURING_PROFILE, sector: 'chemical', name: 'Chemical', nameTr: 'Kimya', overallRiskScore: 75, premiumModifiers: { ...MANUFACTURING_PROFILE.premiumModifiers, baseMultiplier: 1.50 } },
  logistics: { ...CONSTRUCTION_PROFILE, sector: 'logistics', name: 'Logistics', nameTr: 'Lojistik', overallRiskScore: 55, premiumModifiers: { ...CONSTRUCTION_PROFILE.premiumModifiers, baseMultiplier: 1.10 } },
}

/**
 * Get industry risk profile
 */
export function getIndustryProfile(sector: IndustrySector): IndustryRiskProfile {
  return INDUSTRY_PROFILES[sector]
}

/**
 * Get all industry sectors
 */
export function getAllIndustrySectors(): IndustrySector[] {
  return Object.keys(INDUSTRY_PROFILES) as IndustrySector[]
}

/**
 * Get industries ranked by risk
 */
export function getIndustriesByRisk(): { sector: IndustrySector; score: number; level: RiskLevel }[] {
  return Object.values(INDUSTRY_PROFILES)
    .map(p => ({ sector: p.sector, score: p.overallRiskScore, level: p.overallRiskLevel }))
    .sort((a, b) => b.score - a.score)
}
