/**
 * Sample Document Fixtures for OCR Decision Engine Regression Tests
 *
 * These fixtures simulate real-world policy documents for testing
 * language detection, policy classification, and OCR decisions.
 */

/**
 * Clean digital Turkish Kasko policy document
 * Simulates a well-extracted PDF with proper Turkish text
 * IMPORTANT: Must include detection terms: kasko, araç sigortası, oto sigorta, motorlu kara taşıtları, kasko sigortası
 * Expected: Turkish language, motor_kasko classification, skip_ocr decision
 */
export const TURKISH_KASKO_CLEAN_DIGITAL = `
BİRLEŞİK KASKO SİGORTA POLİÇESİ
KASKO SIGORTASI - OTO SİGORTA - ARAÇ SİGORTASI
MOTORLU KARA TAŞITLARI KASKO POLİÇESİ

Poliçe No: KSK-2024-001234567
Acente: 12345 - ABC SİGORTA ARACILIK HİZMETLERİ A.Ş.
Düzenleme Tarihi: 15.01.2024

SİGORTA ETTİREN / SİGORTALI BİLGİLERİ
Sigorta Ettiren: ERİŞ AMBALAJ SANAYİ VE TİCARET A.Ş.
Adres: Organize Sanayi Bölgesi 15. Cadde No:42 Gebze/KOCAELİ
Telefon: 0262 555 1234
Vergi No: 1234567890

SİGORTALI ARAÇ BİLGİLERİ
Plaka: 34 ERİ 2024
Marka/Model: MERCEDES-BENZ / ACTROS 1845
Araç Tipi: Çekici (TIR)
Model Yılı: 2023
Şasi No: WDB96340310123456
Motor No: 457936C0123456
Renk: Beyaz
Kullanım Tarzı: Ticari (Nakliyat)

Bu kasko sigortası poliçesi kapsamında araç sigortası teminatı verilmektedir.
Motorlu kara taşıtları için oto sigorta kapsamı geçerlidir.
Kasko teminatı tam hasar ve kısmi hasar durumlarında geçerlidir.

TEMİNAT KAPSAMI

Ana Teminatlar:
- Kasko (Tam Kasko): Araç Rayiç Değeri
- Çarpışma/Çarpma: Dahil
- Devrilme: Dahil
- Hırsızlık (Tam): Dahil
- Yangın: Dahil
- Doğal Afetler: Dahil
- Sel ve Su Baskını: Dahil
- Deprem: Dahil
- Terör: Dahil

Ek Teminatlar:
- Ferdi Kaza (Sürücü): 200.000 TL
- Hukuki Koruma: 25.000 TL
- Cam Kırılması: Sınırsız
- Yardım Paketleri: 7/24 Yol Yardım
- İkame Araç: 15 Gün
- Yabancı Ülkelerde Geçerlilik: Yeşil Kart Ülkeleri

PRİM BİLGİLERİ
Net Prim: 45.000,00 TL
Gider Vergisi: 2.250,00 TL
Yangın Sigorta Vergisi: 450,00 TL
Garanti Fonu: 45,00 TL
Toplam Prim: 47.745,00 TL

MUAFİYET
Hasar Başına Muafiyet: %5 (minimum 2.500 TL)

SİGORTA DÖNEMİ
Başlangıç Tarihi: 15.01.2024 Saat: 12:00
Bitiş Tarihi: 15.01.2025 Saat: 12:00

HASAR İHBAR HATTI: 0850 222 3344
7/24 Yol Yardım: 0850 333 4455

Bu poliçe Türkiye Sigorta Birliği Kasko Sigortası Genel Şartları'na tabidir.
Sigortacı: XYZ SİGORTA A.Ş.
Merkez: Levent, Büyükdere Cad. No:185 Şişli/İSTANBUL

İmza ve Kaşe
`.repeat(3)  // Repeat to simulate multi-page document (~4000 chars/page)

/**
 * Turkish Traffic (ZMSS) policy document
 * IMPORTANT: Must include detection terms: trafik sigortası, zorunlu mali sorumluluk, zmss, zmms, trafik poliçesi, karayolu motorlu
 * Expected: Turkish language, motor_traffic classification
 */
export const TURKISH_TRAFFIC_ZMSS = `
ZORUNLU MALİ SORUMLULUK SİGORTASI POLİÇESİ
TRAFİK SİGORTASI - ZMSS - TRAFİK POLİÇESİ

Poliçe No: TRF-2024-00987654
Acente Kodu: 54321

Bu trafik sigortası poliçesi zorunlu mali sorumluluk kapsamında düzenlenmiştir.
ZMSS ve ZMMS kapsamında trafik poliçesi teminatları aşağıda belirtilmiştir.
Karayolu motorlu araçlar zorunlu mali sorumluluk sigortası genel şartlarına tabidir.

SİGORTA ETTİREN BİLGİLERİ
Sigorta Ettiren: MEHMET YILMAZ
TC Kimlik No: 12345678901
Adres: Atatürk Cad. No:123 Kadıköy/İSTANBUL
Telefon: 0532 555 1234

ARAÇ BİLGİLERİ
Plaka: 34 ABC 123
Marka: TOYOTA
Model: COROLLA
Model Yılı: 2022
Şasi No: JTDBU4EE1A1234567
Motor No: 1ZR1234567

TRAFİK SİGORTASI TEMİNATLARI
(2024 Yılı Tarife ve Talimatları)

Maddi Hasarlar:
- Araç Başına: 300.000 TL
- Kaza Başına: 600.000 TL

Bedeni Hasarlar:
- Kişi Başına: 2.700.000 TL
- Kaza Başına: 13.500.000 TL

Bu teminat limitleri Hazine ve Maliye Bakanlığı tarafından belirlenen
zorunlu asgari limitlerdir.

PRİM BİLGİLERİ
Net Prim: 2.500,00 TL
Trafik Hizmetleri Gelir Fonu: 50,00 TL
Güvence Hesabı Katkı Payı: 25,00 TL
Toplam Prim: 2.575,00 TL

SİGORTA DÖNEMİ
Başlangıç: 01.02.2024 Saat: 00:00
Bitiş: 01.02.2025 Saat: 00:00

Bu poliçe Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası
Genel Şartlarına tabidir.

ZMMS - ZMSS kapsamında düzenlenmiştir.
Zorunlu trafik sigortası belge numarası: TRF-2024-00987654
`.repeat(2)

/**
 * Turkish Health policy document
 * Expected: Turkish language, health_individual classification
 */
export const TURKISH_HEALTH_POLICY = `
TAMAMLAYICI SAĞLIK SİGORTASI POLİÇESİ

Poliçe No: TSS-2024-001234
Sigortalı: AYŞE DEMIR
TC Kimlik No: 98765432109

SAĞLIK SİGORTASI TEMİNATLARI

Yatarak Tedavi:
- Yıllık Limit: 500.000 TL
- Ameliyat: Dahil
- Yoğun Bakım: Dahil
- Özel Oda: Dahil

Ayakta Tedavi:
- Yıllık Limit: 50.000 TL
- Doktor Muayenesi: Dahil
- Tetkik ve Tahlil: Dahil
- İlaç: %80 Karşılanır

Ek Teminatlar:
- Diş Tedavisi: 5.000 TL
- Gözlük/Lens: 2.000 TL
- Check-up: Yılda 1 Kez

Anlaşmalı Hastaneler:
Özel sağlık sigortası kapsamında tüm anlaşmalı
özel hastanelerde geçerlidir.

PRİM BİLGİLERİ
Aylık Prim: 750 TL
Yıllık Toplam: 9.000 TL

Sağlık poliçesi tedavi giderleri teminatı içermektedir.
TSS kapsamında düzenlenmiştir.
`.repeat(2)

/**
 * English comprehensive auto insurance document
 * Expected: English language, motor_kasko classification
 */
export const ENGLISH_AUTO_INSURANCE = `
COMPREHENSIVE AUTO INSURANCE POLICY

Policy Number: AUTO-2024-00123456
Policyholder: JOHN SMITH
Address: 123 Main Street, New York, NY 10001

VEHICLE INFORMATION
Make: BMW
Model: X5
Year: 2023
VIN: WBAJB9C51KB123456

COVERAGE DETAILS

Comprehensive Coverage:
- Vehicle Damage: Full Market Value
- Collision: Included
- Theft: Included
- Fire: Included
- Natural Disasters: Included

Liability Coverage:
- Bodily Injury: $250,000 per person
- Property Damage: $100,000 per accident

Additional Coverage:
- Roadside Assistance: 24/7
- Rental Car: Up to 30 days
- Personal Injury Protection

PREMIUM INFORMATION
Annual Premium: $1,500.00
Deductible: $500.00

POLICY PERIOD
Effective Date: January 1, 2024
Expiration Date: December 31, 2024

This motor vehicle insurance policy provides own damage
and comprehensive auto insurance coverage.
`.repeat(3)

/**
 * Poor quality document with encoding issues
 * Expected: Low confidence, encoding issues detected
 */
export const POOR_QUALITY_DOCUMENT = `
SİGORTA P\ufffd\ufffdLİÇESİ

Pol\ufffd\ufffdce No: ???-2024-\ufffd\ufffd\ufffd\ufffd\ufffd
Sigorta\ufffd\ufffd: [OKUNAMADI]

T\ufffd\ufffd\ufffdM\ufffd\ufffdNAT KAPSAMI:
- Yar\ufffd\ufffd\ufffdm\ufffd: D\ufffd\ufffd\ufffdh\ufffd\ufffdl
- Çarp\ufffd\ufffd\ufffdma: D\ufffd\ufffd\ufffdh\ufffd\ufffdl

PR\ufffd\ufffdM B\ufffd\ufffdLG\ufffd\ufffdLER\ufffd\ufffd:
Net Pr\ufffd\ufffdm: ?.??? TL

####@@@!!!%%%***
Random garbage text
\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd
`

/**
 * Low density document (scanned/image-based)
 * Expected: full_ocr decision due to low character density
 */
export const LOW_DENSITY_SCANNED = `
SIGORTA POLICESI

Police No: XYZ

---

[IMAGE PLACEHOLDER]

---

End
`

/**
 * German insurance document
 * Expected: German language detection
 */
export const GERMAN_INSURANCE = `
KFZVERSICHERUNG POLICE

Versicherungsnehmer: MAX MUSTERMANN
Versicherungsschein Nr: KFZ-2024-001234

FAHRZEUGDATEN
Kennzeichen: M-AB 1234
Marke: VOLKSWAGEN
Modell: GOLF
Baujahr: 2023
Fahrgestellnummer: WVWZZZ1KZXW123456

VERSICHERUNGSUMFANG

Haftpflichtversicherung:
- Personenschäden: Unbegrenzt
- Sachschäden: 100 Millionen EUR

Kaskoversicherung:
- Teilkasko: Inklusive
- Vollkasko: Inklusive
- Selbstbeteiligung: 500 EUR

Zusatzleistungen:
- Schutzbrief: 24h Pannenhilfe
- Mietwagen: Bis 14 Tage

PRÄMIE
Jahresprämie: 1.200,00 EUR
Zahlweise: Jährlich

VERSICHERUNGSZEITRAUM
Beginn: 01.01.2024
Ende: 31.12.2024

Diese Police unterliegt den Allgemeinen Versicherungsbedingungen
für die Kraftfahrtversicherung (AKB).
`.repeat(2)

/**
 * Multi-page document with varying density per page
 * Used for testing page-level analysis and selective OCR
 */
export const MULTI_PAGE_VARYING_DENSITY = {
  page1: TURKISH_KASKO_CLEAN_DIGITAL.slice(0, 2000),  // High density
  page2: 'Sayfa 2 - Az içerik',  // Low density
  page3: TURKISH_KASKO_CLEAN_DIGITAL.slice(2000, 4000),  // High density
  page4: '[ BOŞ SAYFA ]',  // Very low density
}
