/**
 * Operational mock document texts for the broader guarded internal KASKO pilot.
 * These simulate real extractions from a running internal testing queue.
 */

// 1: Clean - Standard Passenger
export const opKas001 = `
Sigorta A.Ş. - KASKO SİGORTA POLİÇESİ
Poliçe No: OPS-001-KAS
Sigortalı: Ahmet Yılmaz
Türü: Hususi Oto (Binek)
Plaka: 34 ABC 123
Rayiç Değer: 1,500,000 TL
Teminatlar:
- Genişletilmiş Kasko: Rayiç Değer
- İhtiyari Mali Mesuliyet (İMM): 10,000,000 TL
- Ferdi Kaza: 200,000 TL
`

// 2: Clean - Standard Passenger with Condition
export const opKas002 = `
GÜVEN SİGORTA KASKO
Poliçe No: OPS-002-KAS
Sigortalı: Ayşe Karaca
Türü: Hususi Oto
Plaka: 06 XYZ 99
Rayiç Değer: 800,000 TL
Teminatlar:
- Genişletilmiş Kasko
- İMM: 2,500,000 TL
Özel Şartlar: Sadece yetkili servis tamir ve orijinal parça.
`

// 3: Moderate - Formatting noise but valid
export const opKas003 = `
-- P0L!CE N0: OPS-003-KAS --
S!G0RTAL!: FATMA DEMIR
PLAKA: 35 IZM 35
RAYIC: 2,200,000 TL
Teminat:
* Kasko: Mevcut
* IMM: 5M TL
`

// 4: Clean - Foreign Currency
export const opKas004 = `
Poliçe No: OPS-004-KAS
Türü: Hususi Oto
Plaka: 07 ANT 07
Rayiç Değer: 50,000 EUR
Teminatlar:
- Genişletilmiş Kasko: Rayiç Değer
- İMM: 2,000,000 EUR
`

// 5: Clean - Luxury Vehicle
export const opKas005 = `
Poliçe No: OPS-005-KAS
Türü: Premium Binek
Plaka: 34 VIP 01
Rayiç Değer: 8,500,000 TL
Teminatlar:
- Genişletilmiş Kasko: Rayiç Değer
- İMM: Sınırsız
Muafiyet: Araç değerinin %2'si oranında tenzili muafiyet uygulanır (25 yaş altı sürücü).
`

// 6: Moderate - Commercial Truck (Clean)
export const opKas006 = `
Poliçe No: OPS-006-COM
Türü: Kamyon / Ağır Ticari
Plaka: 41 TRK 41
Rayiç Değer: 4,000,000 TL
Teminatlar:
- Kasko
- İMM: 1,000,000 TL
`

// 7: Moderate - Standard Passenger with slight OCR glitches
export const opKas007 = `
Polize N0: 0PS-007-KAS
S1gortal1: MEHMET CAN
Türü: HUSUSI OTO
RayiçD: 900,000TL
T.M:
Kasko: Var
`

// 8: Heavy Commercial Edge-case (Needs manual review logic)
export const opKas008 = `
Poliçe No: OPS-008-HVY
Türü: Çekici / Tır
Plaka: 33 MER 33
Rayiç Değer: 6,500,000 TL
Teminatlar:
- Treyler Dahil Kasko
- İMM: 3,000,000 TL
Özel Şartlar: Tehlikeli madde taşımacılığı sürşarjı uygulanmıştır.
`

// 9: Noisy/Unusable (Missing Provider, incomplete text)
export const opKas009 = `
--- SAYFA KOPUK ---
Türü: Oto
Plaka: 34 XXX 
Kasko poliç
`

// 10: Inherently Unusable (Not a KASKO policy, just generic ID text)
export const opKas010 = `
TC KİMLİK KARTI
Adı: Ali
Soyadı: Veli
Doğum: 1990
BU BİR KİMLİK BELGESİDİR.
`
