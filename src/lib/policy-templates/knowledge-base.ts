/**
 * Insurance Knowledge Base
 * Terms, FAQs, regulations, and market insights for Turkish market
 */

import type {
  InsuranceTerm,
  FAQEntry,
  RegulatoryRequirement,
  MarketInsight,
  BestPractice,
} from '@/types/policy-template'

// =============================================================================
// Insurance Terms Dictionary
// =============================================================================

export const INSURANCE_TERMS: InsuranceTerm[] = [
  // General Terms
  {
    term: 'Premium',
    termTr: 'Prim',
    definition: 'The amount paid for an insurance policy, typically monthly or annually.',
    definitionTr: 'Sigorta poliçesi için ödenen, genellikle aylık veya yıllık tutar.',
    category: 'general',
    relatedTerms: ['Deductible', 'Coverage', 'Policy'],
    example: 'Your annual premium is 5,000 TL, payable monthly at 416.67 TL.',
    exampleTr: 'Yıllık priminiz 5.000 TL, aylık 416,67 TL olarak ödenebilir.',
  },
  {
    term: 'Deductible',
    termTr: 'Muafiyet',
    definition: 'The amount you pay out of pocket before insurance coverage kicks in.',
    definitionTr: 'Sigorta teminatı devreye girmeden önce cebinizden ödediğiniz tutar.',
    category: 'general',
    relatedTerms: ['Premium', 'Claim', 'Out-of-pocket'],
    example: 'With a 1,000 TL deductible, you pay the first 1,000 TL of any claim.',
    exampleTr: '1.000 TL muafiyetle, herhangi bir talebin ilk 1.000 TL\'sini siz ödersiniz.',
  },
  {
    term: 'Coverage Limit',
    termTr: 'Teminat Limiti',
    definition: 'The maximum amount an insurer will pay for a covered loss.',
    definitionTr: 'Sigortacının kapsanan bir kayıp için ödeyeceği maksimum tutar.',
    category: 'coverage',
    relatedTerms: ['Sub-limit', 'Aggregate limit', 'Per-occurrence limit'],
    example: 'Your fire coverage limit is 500,000 TL per incident.',
    exampleTr: 'Yangın teminat limitiniz olay başına 500.000 TL\'dir.',
  },
  {
    term: 'Exclusion',
    termTr: 'İstisna',
    definition: 'Specific conditions or circumstances not covered by the policy.',
    definitionTr: 'Poliçe tarafından kapsanmayan belirli koşullar veya durumlar.',
    category: 'coverage',
    relatedTerms: ['Inclusion', 'Coverage', 'Limitation'],
    example: 'Flood damage is an exclusion in standard home policies.',
    exampleTr: 'Sel hasarı standart konut poliçelerinde bir istinadır.',
  },
  {
    term: 'Beneficiary',
    termTr: 'Lehtar',
    definition: 'The person or entity designated to receive insurance benefits.',
    definitionTr: 'Sigorta haklarını almak üzere belirlenen kişi veya kuruluş.',
    category: 'general',
    relatedTerms: ['Policyholder', 'Insured', 'Named insured'],
    example: 'Your spouse is listed as the primary beneficiary.',
    exampleTr: 'Eşiniz birincil lehtar olarak kayıtlı.',
  },
  {
    term: 'Claim',
    termTr: 'Hasar Talebi',
    definition: 'A formal request to an insurance company for compensation.',
    definitionTr: 'Sigorta şirketine yapılan resmi tazminat talebi.',
    category: 'claims',
    relatedTerms: ['Filing', 'Settlement', 'Denial'],
    example: 'File your claim within 30 days of the incident.',
    exampleTr: 'Hasar talebinizi olaydan sonra 30 gün içinde bildirin.',
  },
  {
    term: 'Policyholder',
    termTr: 'Sigorta Ettiren',
    definition: 'The person who owns the insurance policy and pays the premium.',
    definitionTr: 'Sigorta poliçesinin sahibi olan ve primi ödeyen kişi.',
    category: 'general',
    relatedTerms: ['Insured', 'Beneficiary', 'Named insured'],
  },
  {
    term: 'Insured',
    termTr: 'Sigortalı',
    definition: 'The person whose life, health, or property is covered by insurance.',
    definitionTr: 'Hayatı, sağlığı veya mülkü sigorta kapsamında olan kişi.',
    category: 'general',
    relatedTerms: ['Policyholder', 'Beneficiary'],
  },
  {
    term: 'Underwriting',
    termTr: 'Underwriting',
    definition: 'The process insurers use to evaluate risk and set premium rates.',
    definitionTr: 'Sigortacıların riski değerlendirmek ve prim oranlarını belirlemek için kullandığı süreç.',
    category: 'general',
    relatedTerms: ['Risk assessment', 'Premium calculation'],
  },
  {
    term: 'Co-insurance',
    termTr: 'Müşterek Sigorta',
    definition: 'A percentage of costs you pay after meeting the deductible.',
    definitionTr: 'Muafiyeti karşıladıktan sonra ödediğiniz maliyet yüzdesi.',
    category: 'coverage',
    relatedTerms: ['Deductible', 'Out-of-pocket maximum'],
  },
  {
    term: 'Rider',
    termTr: 'Ek Teminat',
    definition: 'An additional benefit or modification added to a standard policy.',
    definitionTr: 'Standart poliçeye eklenen ek fayda veya değişiklik.',
    category: 'coverage',
    relatedTerms: ['Endorsement', 'Add-on', 'Floater'],
  },
  {
    term: 'Grace Period',
    termTr: 'Ek Süre',
    definition: 'Time after premium due date during which policy remains active.',
    definitionTr: 'Prim vadesinden sonra poliçenin aktif kaldığı süre.',
    category: 'general',
    relatedTerms: ['Premium', 'Lapse', 'Cancellation'],
  },
  // Turkish-specific terms
  {
    term: 'DASK',
    termTr: 'DASK',
    definition: 'Compulsory Earthquake Insurance - mandatory for buildings in Turkey.',
    definitionTr: 'Zorunlu Deprem Sigortası - Türkiye\'de binalar için zorunlu.',
    category: 'coverage',
    relatedTerms: ['Earthquake', 'Property insurance', 'Mandatory'],
    example: 'All residential buildings must have DASK coverage.',
    exampleTr: 'Tüm konut binaları DASK teminatına sahip olmalıdır.',
  },
  {
    term: 'Kasko',
    termTr: 'Kasko',
    definition: 'Comprehensive auto insurance covering own vehicle damage.',
    definitionTr: 'Kendi aracınızın hasarını karşılayan kapsamlı araç sigortası.',
    category: 'coverage',
    relatedTerms: ['Traffic insurance', 'Collision', 'Theft'],
  },
  {
    term: 'Traffic Insurance',
    termTr: 'Trafik Sigortası',
    definition: 'Mandatory third-party liability insurance for vehicles.',
    definitionTr: 'Araçlar için zorunlu üçüncü şahıs sorumluluk sigortası.',
    category: 'coverage',
    relatedTerms: ['Kasko', 'Liability', 'Mandatory'],
  },
  {
    term: 'SEDDK',
    termTr: 'SEDDK',
    definition: 'Insurance and Private Pension Regulation and Supervision Agency.',
    definitionTr: 'Sigortacılık ve Özel Emeklilik Düzenleme ve Denetleme Kurumu.',
    category: 'legal',
    relatedTerms: ['Regulator', 'Compliance'],
  },
  {
    term: 'TSB',
    termTr: 'TSB',
    definition: 'Insurance Association of Turkey - industry organization.',
    definitionTr: 'Türkiye Sigorta Birliği - sektör kuruluşu.',
    category: 'legal',
    relatedTerms: ['Industry body', 'Standards'],
  },
]

// =============================================================================
// Frequently Asked Questions
// =============================================================================

export const FAQ_ENTRIES: FAQEntry[] = [
  // General FAQs
  {
    id: 'faq-1',
    question: 'How do I file a claim?',
    questionTr: 'Hasar talebini nasıl bildiririm?',
    answer: 'Contact your insurer within 24-48 hours of the incident. Provide documentation including photos, police reports (if applicable), and receipts. Most insurers have online portals or mobile apps for filing claims.',
    answerTr: 'Olaydan sonra 24-48 saat içinde sigortacınızla iletişime geçin. Fotoğraflar, polis raporları (varsa) ve faturalar dahil belgeleri sağlayın. Çoğu sigortacı, hasar talebi için çevrimiçi portallar veya mobil uygulamalar sunar.',
    category: 'claims',
    tags: ['claims', 'process', 'documentation'],
    relatedFaqs: ['faq-2', 'faq-3'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-2',
    question: 'What documents do I need for a claim?',
    questionTr: 'Hasar talebi için hangi belgelere ihtiyacım var?',
    answer: 'Generally you need: 1) Claim form from insurer, 2) Photos/videos of damage, 3) Police report (for theft/accidents), 4) Receipts or proof of value, 5) Repair estimates. Keep originals and provide copies.',
    answerTr: 'Genellikle ihtiyacınız olan: 1) Sigortacıdan hasar formu, 2) Hasar fotoğrafları/videoları, 3) Polis raporu (hırsızlık/kaza için), 4) Faturalar veya değer kanıtı, 5) Onarım tahminleri. Orijinalleri saklayın ve kopya verin.',
    category: 'claims',
    tags: ['claims', 'documents', 'requirements'],
    relatedFaqs: ['faq-1', 'faq-3'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-3',
    question: 'How long does claim processing take?',
    questionTr: 'Hasar talebi işlemi ne kadar sürer?',
    answer: 'Simple claims can be processed in 5-10 business days. Complex claims may take 30-60 days. Insurers are legally required to respond within 30 days in Turkey. You can request a status update at any time.',
    answerTr: 'Basit talepler 5-10 iş gününde işlenebilir. Karmaşık talepler 30-60 gün sürebilir. Sigortacılar Türkiye\'de yasal olarak 30 gün içinde yanıt vermek zorundadır. İstediğiniz zaman durum güncellemesi talep edebilirsiniz.',
    category: 'claims',
    tags: ['claims', 'timeline', 'process'],
    relatedFaqs: ['faq-1', 'faq-2'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-4',
    question: 'Can I cancel my policy?',
    questionTr: 'Poliçemi iptal edebilir miyim?',
    answer: 'Yes, you can cancel most policies with written notice. You may receive a prorated refund for unused premium. Some policies have cancellation fees. Check your policy terms for specific conditions.',
    answerTr: 'Evet, çoğu poliçeyi yazılı bildirimle iptal edebilirsiniz. Kullanılmayan prim için orantılı iade alabilirsiniz. Bazı poliçelerin iptal ücreti vardır. Özel koşullar için poliçe şartlarınızı kontrol edin.',
    category: 'general',
    tags: ['cancellation', 'refund', 'policy'],
    relatedFaqs: ['faq-5'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-5',
    question: 'How do I switch insurance companies?',
    questionTr: 'Sigorta şirketini nasıl değiştiririm?',
    answer: 'Purchase new policy before canceling old one to avoid gaps. Notify old insurer in writing. Time the switch for renewal date if possible to avoid cancellation fees. Keep proof of continuous coverage.',
    answerTr: 'Boşluk oluşmaması için eski poliçeyi iptal etmeden önce yeni poliçe satın alın. Eski sigortacıyı yazılı olarak bilgilendirin. İptal ücretlerinden kaçınmak için mümkünse yenileme tarihine denk getirin. Kesintisiz teminat kanıtını saklayın.',
    category: 'renewal',
    tags: ['switching', 'renewal', 'company'],
    relatedFaqs: ['faq-4'],
    helpful: 0,
    notHelpful: 0,
  },
  // Policy-specific FAQs
  {
    id: 'faq-home-1',
    question: 'Is earthquake covered in home insurance?',
    questionTr: 'Deprem konut sigortasında kapsanıyor mu?',
    answer: 'No, earthquake is NOT covered in standard home insurance in Turkey. You need separate DASK (Compulsory Earthquake Insurance). DASK is mandatory for all registered residential buildings. You may also need supplemental earthquake coverage for full protection.',
    answerTr: 'Hayır, deprem Türkiye\'de standart konut sigortasında KAPSAMINDA DEĞİLDİR. Ayrı DASK (Zorunlu Deprem Sigortası) gerekir. DASK tüm kayıtlı konut binaları için zorunludur. Tam koruma için ek deprem teminatı da gerekebilir.',
    category: 'home',
    tags: ['earthquake', 'DASK', 'home', 'coverage'],
    relatedFaqs: ['faq-home-2'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-home-2',
    question: 'What is the difference between DASK and home insurance?',
    questionTr: 'DASK ile konut sigortası arasındaki fark nedir?',
    answer: 'DASK covers only the building structure for earthquake damage up to a government-set limit. Home insurance covers the building and contents for other perils (fire, theft, etc.) but excludes earthquake. You need BOTH for complete protection.',
    answerTr: 'DASK sadece bina yapısını devlet tarafından belirlenen limite kadar deprem hasarı için kapsar. Konut sigortası bina ve içeriği diğer tehlikeler için (yangın, hırsızlık vb.) kapsar ama deprem hariçtir. Tam koruma için HER İKİSİNE de ihtiyacınız var.',
    category: 'home',
    tags: ['DASK', 'home', 'difference', 'coverage'],
    relatedFaqs: ['faq-home-1'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-kasko-1',
    question: 'What is the difference between Kasko and Traffic insurance?',
    questionTr: 'Kasko ile Trafik sigortası arasındaki fark nedir?',
    answer: 'Traffic insurance (mandatory) covers damage you cause to OTHERS. Kasko (optional) covers damage to YOUR OWN vehicle. Traffic insurance is required by law; Kasko provides additional protection for your vehicle.',
    answerTr: 'Trafik sigortası (zorunlu) BAŞKALARINA verdiğiniz hasarı kapsar. Kasko (isteğe bağlı) KENDİ ARACINIZIN hasarını kapsar. Trafik sigortası yasayla zorunludur; Kasko aracınız için ek koruma sağlar.',
    category: 'kasko',
    tags: ['kasko', 'traffic', 'difference', 'auto'],
    relatedFaqs: [],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'faq-health-1',
    question: 'Are pre-existing conditions covered?',
    questionTr: 'Mevcut hastalıklar kapsanıyor mu?',
    answer: 'It depends on the policy. Some policies have waiting periods (typically 1-2 years) for pre-existing conditions. Others may exclude them entirely or charge higher premiums. Always disclose pre-existing conditions when applying.',
    answerTr: 'Poliçeye bağlıdır. Bazı poliçelerin mevcut hastalıklar için bekleme süreleri (genellikle 1-2 yıl) vardır. Diğerleri bunları tamamen hariç tutabilir veya daha yüksek prim talep edebilir. Başvururken mevcut hastalıkları her zaman bildirin.',
    category: 'health',
    tags: ['health', 'pre-existing', 'conditions', 'coverage'],
    relatedFaqs: [],
    helpful: 0,
    notHelpful: 0,
  },
]

// =============================================================================
// Regulatory Requirements
// =============================================================================

export const REGULATORY_REQUIREMENTS: RegulatoryRequirement[] = [
  {
    id: 'reg-dask',
    name: 'Compulsory Earthquake Insurance (DASK)',
    nameTr: 'Zorunlu Deprem Sigortası (DASK)',
    description: 'All registered residential buildings must have earthquake insurance through DASK.',
    descriptionTr: 'Tüm kayıtlı konut binaları DASK aracılığıyla deprem sigortası yaptırmak zorundadır.',
    applicableTo: ['home', 'dask'],
    mandatoryCoverages: ['earthquake'],
    minimumLimits: { 'earthquake': 640000 }, // 2024 max limit
    effectiveDate: '2000-03-27',
    source: 'Law No. 4452 and SEDDK Regulations',
    sourceTr: '4452 Sayılı Kanun ve SEDDK Yönetmelikleri',
    penalties: {
      description: 'Cannot obtain utilities, sell, or rent property without DASK.',
      descriptionTr: 'DASK olmadan hizmet alınamaz, mülk satılamaz veya kiralanamaz.',
    },
  },
  {
    id: 'reg-traffic',
    name: 'Compulsory Traffic Insurance',
    nameTr: 'Zorunlu Trafik Sigortası',
    description: 'All motor vehicles must have third-party liability insurance.',
    descriptionTr: 'Tüm motorlu taşıtlar üçüncü şahıs sorumluluk sigortası yaptırmak zorundadır.',
    applicableTo: ['traffic'],
    mandatoryCoverages: ['third_party_liability'],
    minimumLimits: {
      'bodily_injury_per_person': 900000,
      'bodily_injury_per_accident': 1800000,
      'property_damage': 44000,
    },
    effectiveDate: '2004-01-01',
    source: 'Traffic Law and Insurance Tariff',
    sourceTr: 'Trafik Kanunu ve Sigorta Tarifesi',
    penalties: {
      description: 'Traffic fine up to 3,178 TL and vehicle impoundment.',
      descriptionTr: '3.178 TL\'ye kadar trafik cezası ve araç bağlama.',
      amount: 3178,
    },
  },
  {
    id: 'reg-employer',
    name: 'Employer Liability',
    nameTr: 'İşveren Mali Sorumluluk Sigortası',
    description: 'Employers must protect against employee injury claims beyond SGK coverage.',
    descriptionTr: 'İşverenler SGK kapsamı dışındaki çalışan yaralanma taleplerine karşı koruma sağlamalıdır.',
    applicableTo: ['business'],
    mandatoryCoverages: ['employer_liability'],
    minimumLimits: { 'employer_liability': 250000 },
    effectiveDate: '2014-01-01',
    source: 'Labor Law No. 4857 and Social Security Law',
    sourceTr: '4857 Sayılı İş Kanunu ve Sosyal Güvenlik Kanunu',
  },
  {
    id: 'reg-professional',
    name: 'Professional Liability for Certain Professions',
    nameTr: 'Belirli Meslekler İçin Mesleki Sorumluluk',
    description: 'Doctors, lawyers, and certain professionals must carry professional liability insurance.',
    descriptionTr: 'Doktorlar, avukatlar ve belirli profesyoneller mesleki sorumluluk sigortası taşımak zorundadır.',
    applicableTo: ['business'],
    mandatoryCoverages: ['professional_liability'],
    minimumLimits: { 'professional_liability': 500000 },
    effectiveDate: '2010-01-01',
    source: 'Professional Association Regulations',
    sourceTr: 'Meslek Birliği Yönetmelikleri',
  },
]

// =============================================================================
// Market Insights
// =============================================================================

export const MARKET_INSIGHTS: MarketInsight[] = [
  {
    id: 'insight-1',
    title: 'Rising Cyber Insurance Demand',
    titleTr: 'Artan Siber Sigorta Talebi',
    insight: 'Cyber insurance premiums increased 25% in 2024 due to rising ransomware attacks. Businesses are increasingly seeking coverage for data breaches and business interruption.',
    insightTr: 'Artan fidye yazılımı saldırıları nedeniyle siber sigorta primleri 2024\'te %25 arttı. İşletmeler veri ihlalleri ve iş kesintisi için giderek daha fazla teminat arıyor.',
    category: 'trend',
    policyTypes: ['business'],
    date: '2024-12-01',
    source: 'TSB Industry Report',
    impact: 'high',
    actionable: true,
    recommendation: 'Review cyber coverage limits and ensure ransomware is included.',
    recommendationTr: 'Siber teminat limitlerini gözden geçirin ve fidye yazılımının dahil olduğundan emin olun.',
  },
  {
    id: 'insight-2',
    title: 'DASK Coverage Gap Concerns',
    titleTr: 'DASK Teminat Açığı Endişeleri',
    insight: 'Average home values now exceed DASK maximum coverage by 40%. Homeowners should consider supplemental earthquake coverage to bridge the gap.',
    insightTr: 'Ortalama ev değerleri artık DASK maksimum teminatını %40 aşıyor. Ev sahipleri açığı kapatmak için ek deprem teminatı düşünmeli.',
    category: 'coverage',
    policyTypes: ['home', 'dask'],
    date: '2024-11-15',
    source: 'SEDDK Analysis',
    impact: 'high',
    actionable: true,
    recommendation: 'Calculate your home value and consider supplemental earthquake coverage.',
    recommendationTr: 'Ev değerinizi hesaplayın ve ek deprem teminatı düşünün.',
  },
  {
    id: 'insight-3',
    title: 'Health Insurance Premium Trends',
    titleTr: 'Sağlık Sigortası Prim Eğilimleri',
    insight: 'Health insurance premiums increased 35% year-over-year due to medical inflation. Family plans show better value than individual policies.',
    insightTr: 'Tıbbi enflasyon nedeniyle sağlık sigortası primleri yıllık %35 arttı. Aile planları bireysel poliçelerden daha iyi değer gösteriyor.',
    category: 'pricing',
    policyTypes: ['health'],
    date: '2024-11-01',
    source: 'Insurance Industry Association',
    impact: 'medium',
    actionable: true,
    recommendation: 'Compare family plans vs individual policies for better value.',
    recommendationTr: 'Daha iyi değer için aile planlarını bireysel poliçelerle karşılaştırın.',
  },
  {
    id: 'insight-4',
    title: 'Electric Vehicle Insurance Growth',
    titleTr: 'Elektrikli Araç Sigortası Büyümesi',
    insight: 'Electric vehicle insurance policies grew 150% as EV adoption increases. Specialized coverage for battery damage and charging equipment is now available.',
    insightTr: 'Elektrikli araç benimsenmesi arttıkça elektrikli araç sigorta poliçeleri %150 büyüdü. Batarya hasarı ve şarj ekipmanı için özel teminat artık mevcut.',
    category: 'trend',
    policyTypes: ['kasko'],
    date: '2024-10-15',
    source: 'TSB Market Analysis',
    impact: 'medium',
    actionable: false,
  },
  {
    id: 'insight-5',
    title: 'Climate Risk Premium Adjustments',
    titleTr: 'İklim Riski Prim Ayarlamaları',
    insight: 'Insurers are increasing premiums in flood-prone regions. Properties in Black Sea coastal areas seeing 15-20% higher home insurance premiums.',
    insightTr: 'Sigortacılar sel riskli bölgelerde primleri artırıyor. Karadeniz kıyı bölgelerindeki mülkler %15-20 daha yüksek konut sigortası primi görüyor.',
    category: 'pricing',
    policyTypes: ['home'],
    date: '2024-10-01',
    source: 'Climate Risk Assessment Report',
    impact: 'medium',
    actionable: true,
    recommendation: 'Consider flood mitigation measures to potentially reduce premiums.',
    recommendationTr: 'Potansiyel prim indirimi için sel azaltma önlemleri düşünün.',
  },
]

// =============================================================================
// Global Best Practices
// =============================================================================

export const GLOBAL_BEST_PRACTICES: BestPractice[] = [
  {
    id: 'global-bp-1',
    title: 'Annual Policy Review',
    titleTr: 'Yıllık Poliçe Gözden Geçirmesi',
    description: 'Review all insurance policies at least once a year',
    descriptionTr: 'Tüm sigorta poliçelerini yılda en az bir kez gözden geçirin',
    category: 'coverage',
    priority: 'essential',
    guidance: [
      'Schedule annual review before renewal dates',
      'Update coverage for life changes (marriage, home purchase, etc.)',
      'Compare current coverage with market alternatives',
      'Check for new discounts or bundling opportunities',
      'Ensure beneficiary information is current',
    ],
    guidanceTr: [
      'Yenileme tarihlerinden önce yıllık gözden geçirme planlayın',
      'Yaşam değişiklikleri için teminatı güncelleyin (evlilik, ev satın alma vb.)',
      'Mevcut teminatı piyasa alternatifleriyle karşılaştırın',
      'Yeni indirimler veya paketleme fırsatlarını kontrol edin',
      'Lehtar bilgilerinin güncel olduğundan emin olun',
    ],
    pitfalls: [
      'Auto-renewing without reviewing changes',
      'Missing premium increases',
      'Outdated coverage for current needs',
    ],
    pitfallsTr: [
      'Değişiklikleri gözden geçirmeden otomatik yenileme',
      'Prim artışlarını kaçırma',
      'Mevcut ihtiyaçlar için güncel olmayan teminat',
    ],
  },
  {
    id: 'global-bp-2',
    title: 'Document Everything',
    titleTr: 'Her Şeyi Belgeleyin',
    description: 'Maintain records of all insured assets and communications',
    descriptionTr: 'Tüm sigortalı varlıkların ve iletişimlerin kayıtlarını tutun',
    category: 'claims',
    priority: 'essential',
    guidance: [
      'Keep photos/videos of all valuable items',
      'Store receipts and appraisals securely',
      'Use cloud storage for backup',
      'Update inventory after major purchases',
      'Save all communication with insurers',
    ],
    guidanceTr: [
      'Tüm değerli eşyaların fotoğraf/videolarını saklayın',
      'Faturaları ve değerlemeleri güvenli şekilde saklayın',
      'Yedekleme için bulut depolama kullanın',
      'Büyük alımlardan sonra envanteri güncelleyin',
      'Sigortacılarla tüm iletişimi kaydedin',
    ],
    pitfalls: [
      'Claiming without proof reduces payouts',
      'Lost receipts for valuable items',
      'No evidence of pre-loss condition',
    ],
    pitfallsTr: [
      'Kanıtsız talep ödemeleri azaltır',
      'Değerli eşyalar için kayıp faturalar',
      'Kayıp öncesi durum kanıtı yok',
    ],
  },
  {
    id: 'global-bp-3',
    title: 'Bundle Policies for Savings',
    titleTr: 'Tasarruf İçin Poliçeleri Paketleyin',
    description: 'Combine multiple policies with one insurer for discounts',
    descriptionTr: 'İndirim için birden fazla poliçeyi tek sigortacıda birleştirin',
    category: 'coverage',
    priority: 'recommended',
    guidance: [
      'Ask about multi-policy discounts',
      'Consider home and auto bundles',
      'Evaluate family coverage packages',
      'Compare bundled vs separate pricing',
    ],
    guidanceTr: [
      'Çoklu poliçe indirimlerini sorun',
      'Ev ve oto paketlerini değerlendirin',
      'Aile teminat paketlerini değerlendirin',
      'Paketli ve ayrı fiyatlandırmayı karşılaştırın',
    ],
    pitfalls: [
      'Loyalty without comparing prices',
      'Missing better individual deals',
      'Bundling with inferior coverage',
    ],
    pitfallsTr: [
      'Fiyat karşılaştırmadan sadakat',
      'Daha iyi bireysel fırsatları kaçırma',
      'Yetersiz teminatla paketleme',
    ],
  },
  {
    id: 'global-bp-4',
    title: 'Understand Your Deductibles',
    titleTr: 'Muafiyetlerinizi Anlayın',
    description: 'Balance deductibles with premium savings',
    descriptionTr: 'Muafiyetleri prim tasarrufuyla dengeleyin',
    category: 'deductibles',
    priority: 'recommended',
    guidance: [
      'Higher deductibles mean lower premiums',
      'Ensure you can afford the deductible',
      'Consider deductible by coverage type',
      'Keep emergency fund for deductibles',
    ],
    guidanceTr: [
      'Daha yüksek muafiyetler daha düşük prim demektir',
      'Muafiyeti karşılayabileceğinizden emin olun',
      'Teminat türüne göre muafiyeti değerlendirin',
      'Muafiyetler için acil durum fonu tutun',
    ],
    pitfalls: [
      'High deductible without savings to cover it',
      'Low deductible wasting premium money',
      'Not knowing deductible amounts',
    ],
    pitfallsTr: [
      'Karşılayacak birikim olmadan yüksek muafiyet',
      'Prim parası israf eden düşük muafiyet',
      'Muafiyet tutarlarını bilmemek',
    ],
  },
]

// =============================================================================
// Search and Lookup Functions
// =============================================================================

/**
 * Search insurance terms
 */
export function searchTerms(query: string): InsuranceTerm[] {
  const lowerQuery = query.toLowerCase()
  return INSURANCE_TERMS.filter(
    (term) =>
      term.term.toLowerCase().includes(lowerQuery) ||
      term.termTr.toLowerCase().includes(lowerQuery) ||
      term.definition.toLowerCase().includes(lowerQuery) ||
      term.definitionTr.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get term by name
 */
export function getTerm(termName: string): InsuranceTerm | null {
  const lowerName = termName.toLowerCase()
  return (
    INSURANCE_TERMS.find(
      (t) => t.term.toLowerCase() === lowerName || t.termTr.toLowerCase() === lowerName
    ) || null
  )
}

/**
 * Search FAQs
 */
export function searchFaqs(query: string): FAQEntry[] {
  const lowerQuery = query.toLowerCase()
  return FAQ_ENTRIES.filter(
    (faq) =>
      faq.question.toLowerCase().includes(lowerQuery) ||
      faq.questionTr.toLowerCase().includes(lowerQuery) ||
      faq.answer.toLowerCase().includes(lowerQuery) ||
      faq.answerTr.toLowerCase().includes(lowerQuery) ||
      faq.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Get FAQs by category
 */
export function getFaqsByCategory(category: FAQEntry['category']): FAQEntry[] {
  return FAQ_ENTRIES.filter((faq) => faq.category === category)
}

/**
 * Get regulatory requirements by policy type
 */
export function getRegulationsForPolicy(policyType: string): RegulatoryRequirement[] {
  return REGULATORY_REQUIREMENTS.filter((reg) =>
    reg.applicableTo.includes(policyType as typeof reg.applicableTo[number])
  )
}

/**
 * Get recent market insights
 */
export function getRecentInsights(count: number = 5): MarketInsight[] {
  return [...MARKET_INSIGHTS]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count)
}

/**
 * Get actionable insights
 */
export function getActionableInsights(): MarketInsight[] {
  return MARKET_INSIGHTS.filter((insight) => insight.actionable)
}
