/**
 * Synthetic document fixtures for the second part of the internal KASKO pilot.
 * These strictly correspond to the plan in docs/KASKO_PILOT_BATCH_2_PLAN.md
 */

// Doc 6: Standard Passenger (Clean)
export const rdKas006 = `
Sigorta A.Ş. - KASKO SİGORTA POLİÇESİ
Poliçe No: KSK-006-STD
Sigortalı: Veli Yılmaz

Türü: Hususi Oto (Binek)
Plaka: 34 V 1234
Rayiç Değer: 1,200,000 TL

Teminatlar ve Limitler:
- Genişletilmiş Kasko: Rayiç Değer
- İhtiyari Mali Mesuliyet (İMM): 5,000,000 TL
- Ferdi Kaza: 100,000 TL
- İkame Araç: 15 Gün (Yılda 2 kez)
- Cam Kırılması: Yılda 1 kez muafiyetsiz, orijinal cam.

Muafiyet: 
Yoktur.

Özel Şartlar:
Yetkili servis bakımı zorunludur.
`

// Doc 7: Standard Passenger (Moderate Noise)
export const rdKas007 = `
-- S1GORTA . A . S -- KA$KO S1G0RTA P0L!CES1 --
Po!ice N0: KSK-007-NOY
Sigortali: . \n/ Ayse Demir

Türü: H\nususi 0to
P!aka: 06 AYS 99
Rayic\nDeger: 950,000 TL

T3minatlar:
* Genisletilmi$ Kasko: Rayiç Değer
* 1htiyari Mali Mesuliyet: 2,500,000 TL
* F.Kaza: 50,000 Tl
`

// Doc 8: Standard Passenger (Missing Non-Critical Page)
// Coverages exist, but general condition pages dropped.
export const rdKas008 = `
KASKO POLİÇESİ - SAYFA 1/3 (SAYFA 2 ve 3 YÖK)
Sigorta A.Ş.
Poliçe No: KSK-008-MIS
Plaka: 35 IZM 35

Teminat Tablosu:
Kasko: Rayiç bedel
İMM: 1.000.000 TL
Koltuk Ferdi Kaza Kaza Başına: 25.000 TL
`

// Doc 9: Standard Passenger (Long Document)
// 1000 lines of boilerplate omitted for payload size, simulating with lots of padding
export const rdKas009 = `
Sigorta A.Ş. KASKO P: KSK-009-LNG
Plaka: 07 ANT 07
Kasko: Rayiç Değer
İMM: 3.000.000 TL
${'Genel Şartlar '.repeat(400)}
${'Sorumluluklar '.repeat(400)}
`

// Doc 10: Standard Passenger (Foreign Currency)
export const rdKas010 = `
Sigorta A.Ş. KASKO P: KSK-010-EUR
Plaka: 34 EUR 99
Kasko: Rayiç Değer
İMM: 100,000 EUR
Ferdi Kaza: 10,000 EUR
Prim: 1,200 EUR
`

// Doc 11: Commercial Heavy (Kamyon/Truck)
export const rdKas011 = `
Sigorta A.Ş. TİCARİ KASKO P: KSK-011-TRK
Türü: Kamyon (Ağır Vasıta)
Plaka: 41 TRK 41
Kasko: Rayiç
İMM (Bedeni+Maddi): 10,000,000 TL
Muafiyet: %2
`

// Doc 12: Commercial Heavy (High Deductible)
export const rdKas012 = `
Sigorta A.Ş. TİCARİ KASKO P: KSK-012-DED
Türü: Çekici
Plaka: 33 CEK 33
Kasko: Rayiç
İMM: 15,000,000 TL

MUAFİYET ŞARTLARI:
Her bir hasarda hasar bedelinin %5'i, minimum 50,000 TL muafiyet uygulanır.
`

// Doc 13: Commercial Heavy (Moderate Noise)
export const rdKas013 = `
$!G0RTA AS - T1CAR1 KAS\\KO KSK-013-NDED
Turu: Kamyon
Plk: 55 SAM 55
Kask0: RYC
1MM: 5,000,000 TL
MUAFIYET: Hasar!in %4u min 25000 tl
`

// Doc 14: Luxury/High-Value Vehicle
export const rdKas014 = `
Sigorta A.Ş. VIP KASKO P: KSK-014-LUX
Türü: Hususi Oto
Plaka: 34 P 001
Rayiç: 15,000,000 TL
İMM: Sınırsız
İkame Araç: E Segment Sınırsız

ÖZEL ŞARTLAR:
1. Hasar onarımları sadece yetkili distribütör servislerinde yapılacaktır.
2. Orijinal parça garantisi.
`

// Doc 15: Specialty (Electric Vehicle)
export const rdKas015 = `
Sigorta A.Ş. EV-KASKO P: KSK-015-ELEC
Türü: Hususi Oto (%100 Elektrikli)
Plaka: 34 EV 34
Kasko: Rayiç  
İMM: 2,000,000 TL

EK TEMİNATLAR:
Batarya Çalınması: Poliçe limitine dahil
Şarj Kablosu Hırsızlık: 50,000 TL
Çekme Kurtarma: Sadece ahtapot çekici ile.
`

// Doc 16: Extreme Noise / Garbled
export const rdKas016 = `
!!@#(!*(#@)*$)@#*$)@#(*$#@!)
aksdmaslkdmlaskdmlkasmdlas
12301923091230129301293
sdfsdfsdf
`

// Doc 17: Implicit KASKO (Generic Document)
export const rdKas017 = `
SÖZLEŞME VE GENEL ŞARTLAR
Madde 1: Taraflar anlaşmıştır.
Madde 2: Ödemeler zamanında yapılacaktır.
(Herhangi bir sigorta şirketi veya poliçe numarası yoktur)
`

// Doc 18: Missing First Page (No Provider/Policy Number)
export const rdKas018 = `
... devamı.
İMM: 1.000.000 TL
İkame Araç: 15 Gün
Ferdi Kaza: 20.000 TL
Cam: orijinal
`

// Doc 19: Multi-Vehicle Fleet (2 Vehicles)
export const rdKas019 = `
Sigorta A.Ş. FİLO KASKO P: KSK-019-FLT
Türü: Hususi / Binek Filo
Araç Listesi:
1. 34 A 01 (Rayiç 1M TL)
2. 34 B 02 (Rayiç 1.2M TL)

ORTAK TEMİNATLAR:
Kasko: Rayiç
İMM: Araç başı 2.000.000 TL
`

// Doc 20: Multi-Vehicle Fleet (5+ Vehicles)
export const rdKas020 = `
Sigorta A.Ş. BÜYÜK FİLO KASKO P: KSK-020-VFLT
Araç Listesi (Ek 1'e bakınız):
Toplam 15 adet çekici ve dorse.

TOPLAM LİMİTLER:
İMM: Olay Başı 50,000,000 TL / Yıllık Agrega 100,000,000 TL
Kasko: Her bir araç için rayiç bedel 
`
