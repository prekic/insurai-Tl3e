-- Migration 008: Seed Kasko Benchmark Pack
-- Purpose: Insert curated benchmark data for Kasko policy analysis

-- Insert Kasko Benchmark Pack
INSERT INTO public.benchmark_packs (
  id,
  policy_type,
  version,
  name,
  description,
  entries,
  source_documents,
  is_active,
  is_default,
  effective_date,
  expires_date
) VALUES (
  'benchmark-kasko-2026-01',
  'kasko',
  '2026-01',
  'Kasko Benchmark Pack Q1 2026',
  'SEDDK düzenlemeleri ve piyasa uygulamalarına dayalı Kasko sigorta karşılaştırma kriterleri',
  '[
    {
      "entryId": "kasko-min-tpl",
      "title": "Minimum Traffic Liability",
      "titleTr": "Minimum Trafik Sorumluluk Limiti",
      "text": "2026 yılı için SEDDK tarafından belirlenen minimum trafik sigortası limitleri: Kişi başı bedensel zarar 2.700.000 TL, kaza başı bedensel zarar 13.500.000 TL, kişi başı maddi zarar 300.000 TL, kaza başı maddi zarar 600.000 TL.",
      "sourceType": "SEDDK",
      "sourceDocument": "SEDDK 2026 Trafik Sigortası Genel Şartları",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["trafik", "zorunlu", "limit", "sorumluluk"],
      "numericValue": 13500000,
      "unit": "TRY"
    },
    {
      "entryId": "kasko-iml-market",
      "title": "Typical IML Coverage",
      "titleTr": "Tipik Artan Mali Sorumluluk (İMM) Teminatı",
      "text": "Piyasa uygulamasında İMM teminatı genellikle kişi başı 3.000.000-5.000.000 TL, kaza başı 10.000.000-15.000.000 TL aralığında sunulmaktadır. %80 poliçede İMM dahildir.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["imm", "sorumluluk", "artırım", "limit"],
      "numericValue": 5000000,
      "unit": "TRY"
    },
    {
      "entryId": "kasko-theft-standard",
      "title": "Theft Coverage Standard",
      "titleTr": "Hırsızlık Teminatı Standardı",
      "text": "Kasko poliçelerinde hırsızlık teminatı standart olarak dahildir. Tam hırsızlık teminatı araç rayiç değerini kapsar. %5-10 muafiyet uygulanabilir.",
      "sourceType": "GenelSart",
      "sourceDocument": "Kasko Sigortası Genel Şartları Madde A.1",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["hırsızlık", "teminat", "muafiyet"],
      "numericValue": null,
      "unit": null
    },
    {
      "entryId": "kasko-glass-typical",
      "title": "Glass Coverage Typical Limit",
      "titleTr": "Tipik Cam Teminat Limiti",
      "text": "Cam kırılması teminatı tipik olarak 25.000-50.000 TL arasında sağlanmaktadır. Ön cam için muafiyet genellikle %15-25 veya 1.500-3.000 TL sabit tutar olarak uygulanır.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["cam", "teminat", "muafiyet", "limit"],
      "numericValue": 35000,
      "unit": "TRY"
    },
    {
      "entryId": "kasko-replacement-car",
      "title": "Replacement Vehicle Standard",
      "titleTr": "İkame Araç Standardı",
      "text": "Piyasa uygulamasında ikame araç teminatı %65 oranında poliçelerde bulunmaktadır. Tipik süre 7-15 gün, günlük limit 300-500 TL arasındadır.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["ikame", "araç", "gün", "limit"],
      "numericValue": 15,
      "unit": "days"
    },
    {
      "entryId": "kasko-deductible-market",
      "title": "Market Average Deductible",
      "titleTr": "Piyasa Ortalama Muafiyet",
      "text": "Kasko poliçelerinde tipik muafiyet oranı %2-5 veya 3.000-10.000 TL sabit tutardır. Genç sürücü (26 yaş altı) için ek %5-10 muafiyet uygulanabilir.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "deductible",
      "tags": ["muafiyet", "oran", "genç sürücü"],
      "numericValue": 5000,
      "unit": "TRY"
    },
    {
      "entryId": "kasko-natural-disaster",
      "title": "Natural Disaster Coverage",
      "titleTr": "Doğal Afet Teminatı",
      "text": "Deprem, sel, fırtına, dolu hasarları standart Kasko teminatına dahildir. SEDDK düzenlemesine göre doğal afet teminatı poliçeden çıkarılamaz.",
      "sourceType": "GenelSart",
      "sourceDocument": "Kasko Sigortası Genel Şartları Madde A.3",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["deprem", "sel", "dolu", "fırtına", "doğal afet"],
      "numericValue": null,
      "unit": null
    },
    {
      "entryId": "kasko-personal-accident",
      "title": "Personal Accident Coverage",
      "titleTr": "Ferdi Kaza Teminatı",
      "text": "Ferdi kaza teminatı sürücü ve yolcular için ayrı limitlerle sunulmaktadır. Tipik sürücü limiti 100.000-250.000 TL, yolcu limiti kişi başı 50.000-100.000 TL arasındadır.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["ferdi kaza", "sürücü", "yolcu", "tazminat"],
      "numericValue": 100000,
      "unit": "TRY"
    },
    {
      "entryId": "kasko-roadside-assistance",
      "title": "Roadside Assistance Standard",
      "titleTr": "Yol Yardım Standardı",
      "text": "Kasko poliçelerinin %90ından fazlasında 7/24 yol yardım hizmeti dahildir. Standart hizmetler: çekici, yerinde tamir, yakıt ikmali, lastik değişimi.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "coverage_limit",
      "tags": ["yol yardım", "asistans", "çekici"],
      "numericValue": null,
      "unit": null
    },
    {
      "entryId": "kasko-terrorism-exclusion",
      "title": "Terrorism Exclusion Standard",
      "titleTr": "Terör İstisnası",
      "text": "Terör eylemleri sonucu oluşan hasarlar standart Kasko teminatı dışındadır. SEDDK düzenlemesine göre terör teminatı isteğe bağlı ek kloz ile satın alınabilir.",
      "sourceType": "GenelSart",
      "sourceDocument": "Kasko Sigortası Genel Şartları Madde B.4",
      "dateEffective": "2026-01-01",
      "category": "exclusion",
      "tags": ["terör", "istisna", "kloz"],
      "numericValue": null,
      "unit": null
    },
    {
      "entryId": "kasko-drunk-driving-exclusion",
      "title": "Drunk Driving Exclusion",
      "titleTr": "Alkollü Araç Kullanma İstisnası",
      "text": "Yasal sınırın üzerinde alkollü araç kullanımı sırasında meydana gelen hasarlar teminat dışıdır. Promil sınırı: Özel araç 0.50, ticari araç 0.00.",
      "sourceType": "GenelSart",
      "sourceDocument": "Kasko Sigortası Genel Şartları Madde B.1",
      "dateEffective": "2026-01-01",
      "category": "exclusion",
      "tags": ["alkol", "istisna", "promil"],
      "numericValue": 0.5,
      "unit": "promil"
    },
    {
      "entryId": "kasko-unauthorized-driver",
      "title": "Unauthorized Driver Exclusion",
      "titleTr": "Ehliyetsiz Sürücü İstisnası",
      "text": "Sürücü belgesi olmayan veya uygun sınıf ehliyeti bulunmayan kişilerin kullanımı sırasında meydana gelen hasarlar teminat dışıdır.",
      "sourceType": "GenelSart",
      "sourceDocument": "Kasko Sigortası Genel Şartları Madde B.2",
      "dateEffective": "2026-01-01",
      "category": "exclusion",
      "tags": ["ehliyet", "sürücü", "istisna"],
      "numericValue": null,
      "unit": null
    },
    {
      "entryId": "kasko-premium-benchmark-sedan",
      "title": "Premium Benchmark - Sedan",
      "titleTr": "Prim Karşılaştırma - Sedan",
      "text": "2026 yılı için orta segment sedan araç (100.000-300.000 TL değer) Kasko primi tipik olarak araç değerinin %3-5i arasındadır. İstanbul için %15-20 ek bölge faktörü uygulanır.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "premium",
      "tags": ["prim", "sedan", "bölge", "faktör"],
      "numericValue": 4,
      "unit": "percent"
    },
    {
      "entryId": "kasko-premium-benchmark-suv",
      "title": "Premium Benchmark - SUV",
      "titleTr": "Prim Karşılaştırma - SUV",
      "text": "SUV ve arazi araçları için Kasko primi sedan araçlara göre %10-20 daha yüksektir. Lüks SUV araçları için ek risk faktörü uygulanabilir.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "premium",
      "tags": ["prim", "suv", "faktör"],
      "numericValue": 5,
      "unit": "percent"
    },
    {
      "entryId": "kasko-waiting-period",
      "title": "Coverage Waiting Period",
      "titleTr": "Teminat Bekleme Süresi",
      "text": "Kasko poliçelerinde standart bekleme süresi yoktur, teminat poliçe başlangıç tarihinden itibaren geçerlidir. Hırsızlık için bazı şirketler 15-30 gün bekleme süresi uygulayabilir.",
      "sourceType": "MarketPractice",
      "dateEffective": "2026-01-01",
      "category": "general",
      "tags": ["bekleme", "süre", "hırsızlık"],
      "numericValue": 0,
      "unit": "days"
    },
    {
      "entryId": "kasko-value-depreciation",
      "title": "Vehicle Value Depreciation",
      "titleTr": "Araç Değer Kaybı",
      "text": "Kasko sigortasında araç bedeli rayiç değer üzerinden belirlenir. Onarım sonrası değer kaybı teminatı isteğe bağlıdır ve tipik olarak araç değerinin %10-15i ile sınırlıdır.",
      "sourceType": "GenelSart",
      "dateEffective": "2026-01-01",
      "category": "general",
      "tags": ["rayiç değer", "değer kaybı", "onarım"],
      "numericValue": 15,
      "unit": "percent"
    }
  ]'::jsonb,
  '[
    {"name": "SEDDK Kasko Genel Şartları 2026", "date": "2026-01-01"},
    {"name": "TSB Kasko İstatistikleri Q4 2025", "date": "2025-12-15"},
    {"name": "Piyasa Araştırması - Kasko Primleri 2026", "date": "2026-01-10"}
  ]'::jsonb,
  true,
  true,
  '2026-01-01',
  '2026-12-31'
) ON CONFLICT (id) DO UPDATE SET
  entries = EXCLUDED.entries,
  source_documents = EXCLUDED.source_documents,
  updated_at = NOW();

-- Create index for benchmark entry search
CREATE INDEX IF NOT EXISTS idx_benchmark_entries_gin
  ON public.benchmark_packs USING GIN (entries);
