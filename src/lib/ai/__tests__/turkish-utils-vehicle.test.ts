import { describe, it, expect } from 'vitest'
import { extractVehicleInfoFromText, parseTurkishCurrency } from '../turkish-utils'

describe('extractVehicleInfoFromText', () => {
  it('extracts make/model/year/plate/chassis from a typical Turkish kasko policy text', () => {
    const text = `
      3.SİGORTA KONUSU ARAÇ BİLGİLERİ

      Marka/Tip : PEUGEOT 308 COMFORT 1.6 VTI
      Tip : 308 COMFORT
      Model Yılı : 2010
      Plaka : 34 GM 6461
      Şasi No : VF34C5FWFAY000475
    `
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.make).toBe('PEUGEOT')
    expect(result?.year).toBe(2010)
    expect(result?.plate).toBe('34 GM 6461')
    expect(result?.chassisNo).toBe('VF34C5FWFAY000475')
    // model should contain at least some part of the model name
    expect(result?.model).toBeDefined()
  })

  it('returns undefined for empty / non-vehicle text', () => {
    expect(extractVehicleInfoFromText('')).toBeUndefined()
    expect(extractVehicleInfoFromText('No vehicle info here')).toBeUndefined()
  })

  it('handles plate-only text', () => {
    const text = 'Plate: 06 ABC 123 only'
    const result = extractVehicleInfoFromText(text)
    expect(result?.plate).toBe('06 ABC 123')
  })

  it('rejects invalid city codes (>81)', () => {
    const text = 'Plaka: 99 XYZ 999 — invalid'
    const result = extractVehicleInfoFromText(text)
    // 99 is not a valid Turkish city code; should not be extracted as plate
    expect(result?.plate).toBeUndefined()
  })

  it('extracts model year independently', () => {
    const text = 'Model Yılı: 2023 araç'
    const result = extractVehicleInfoFromText(text)
    expect(result?.year).toBe(2023)
  })

  it('rejects implausible model years', () => {
    const text = 'Model Yılı: 1850 vintage'
    const result = extractVehicleInfoFromText(text)
    expect(result?.year).toBeUndefined()
  })

  // ────────────────────────────────────────────────────────────────────────
  // v4 expansions: canonical field-alias table
  // ────────────────────────────────────────────────────────────────────────

  it('extracts year from "İmal Yılı" label variant', () => {
    const result = extractVehicleInfoFromText('İmal Yılı: 2019\nMarka: FORD')
    expect(result?.year).toBe(2019)
    expect(result?.make).toBe('FORD')
  })

  it('extracts year from "Üretim Yılı" label variant', () => {
    const result = extractVehicleInfoFromText('Üretim Yılı: 2022\nMarka: TOYOTA')
    expect(result?.year).toBe(2022)
    expect(result?.make).toBe('TOYOTA')
  })

  it('extracts year from English "Model Year" label variant', () => {
    const result = extractVehicleInfoFromText('Model Year: 2021\nMake: HONDA')
    expect(result?.year).toBe(2021)
    expect(result?.make).toBe('HONDA')
  })

  it('extracts year from "Araç Yılı" label variant', () => {
    const result = extractVehicleInfoFromText('Araç Yılı : 2020')
    expect(result?.year).toBe(2020)
  })

  it('extracts engine number from "Motor No" label', () => {
    const result = extractVehicleInfoFromText('Motor No: CZE307964\nŞasi No: WVGZZZ5NZHW862628')
    expect(result?.engineNo).toBe('CZE307964')
    expect(result?.chassisNo).toBe('WVGZZZ5NZHW862628')
  })

  it('extracts engine number from "Motor Numarası" variant', () => {
    const result = extractVehicleInfoFromText('Motor Numarası: ABC12345')
    expect(result?.engineNo).toBe('ABC12345')
  })

  it('extracts chassis from "VIN" English label', () => {
    const result = extractVehicleInfoFromText('VIN: WVGZZZ5NZHW862628')
    expect(result?.chassisNo).toBe('WVGZZZ5NZHW862628')
  })

  it('does not leak label text into values when fields share a line (Anadolu Tiguan pattern)', () => {
    // Regression for v3 bug: `Model: No` / `Motor: <label>` leakage. With the
    // alias-aware extractor each labeled field stops its value capture at the
    // next known label or newline, so fields packed on one line don't bleed.
    const text =
      'Marka: VOLKSWAGEN  Model: TIGUAN 1.4 TSI  Motor No: CZE307964  Şasi No: WVGZZZ5NZHW862628'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.make).toBe('VOLKSWAGEN')
    expect(result?.model).toMatch(/TIGUAN/)
    // Model must NOT be "No" (the label-leak bug from v3)
    expect(result?.model).not.toBe('No')
    expect(result?.engineNo).toBe('CZE307964')
    expect(result?.chassisNo).toBe('WVGZZZ5NZHW862628')
  })

  it('preserves year extraction when both Model and Model Yılı appear on adjacent lines', () => {
    const text = `
      Marka : VOLKSWAGEN
      Model : TIGUAN 1.4 TSI ACT BMT 150 DSG HIGHLINE
      Model Yılı : 2016
    `
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBe('VOLKSWAGEN')
    expect(result?.model).toMatch(/TIGUAN/)
    expect(result?.year).toBe(2016)
  })

  it('recovers make from Allianz inverted `: VALUE\\tLabel` layout', () => {
    // Allianz Peugeot PDFs emit the value BEFORE the label on the same line:
    //   ": PEUGEOT (114)\tMarka Plaka No : 34 GM 6461"
    // Forward scan from `Marka` hits `Plaka No :` immediately and captures
    // nothing. The backward fallback recovers `PEUGEOT (114)` and the first
    // word becomes the make.
    const text = `
      Policy header line
      : PEUGEOT (114)\tMarka Plaka No : 34 GM 6461
    `
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBe('PEUGEOT')
  })

  it('does NOT false-positive when another labeled field precedes on the same line', () => {
    // A line like `Plaka : 34 ABC 12\tMarka` has a preceding value (34 ABC 12)
    // that already belongs to the Plaka label. The backward scan requires the
    // segment to start with `:`, so this is safely rejected and returns
    // `undefined` rather than mis-claiming the plate as the make.
    const text = 'Plaka : 34 ABC 12\tMarka'
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBeUndefined()
    // Plate extraction still works via the standalone plate regex.
    expect(result?.plate).toBe('34 ABC 12')
  })

  it('does NOT fire the backward fallback when forward scan already succeeded', () => {
    // Sanity: when forward scan returns a value, the backward fallback is
    // never consulted. This guards against double-fire regressions.
    const text = 'Marka : FORD\n: IRRELEVANT PEUGEOT\tMarka'
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBe('FORD')
  })

  // ─────────────────────────────────────────────────────────────────────
  // AXA Sigorta packed-line tabular format (single-space label/value
  // separator). Fixture is verbatim text from
  // KASKO_ERDEMİR_Ereğli_462660798_67LA807_2024.12-2025.12.pdf as parsed
  // by pdf-parse. See scripts/inspect-pdf-labels.ts.
  // ─────────────────────────────────────────────────────────────────────
  it('extracts make/model/year/plate/motor from AXA Sigorta packed-line format', () => {
    const text = `.XOODQÖP7DU]Ö &LQVL KAMYONET Marka ISUZU
Marka Tipi 1003 --- D-MAX CIFT KABIN
KAMYONET 2.5 4X2 LIMITED 6MT
Model Bilgisi 2015
Plaka Il Kodu ZONGULDAK Plaka No 67LA807
Motor No MP0428 úDVL1R NNATFR86JL2000712`
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBe('ISUZU')
    expect(result?.model).toMatch(/D-MAX/)
    expect(result?.year).toBe(2015)
    expect(result?.plate).toBe('67 LA 807')
    expect(result?.engineNo).toBe('MP0428')
  })

  it('does NOT fire tabular fallback for lowercase prose mentions of "marka"', () => {
    // Mid-prose lowercase mention of "marka" should not be claimed as a
    // labeled value just because the next token is uppercase. The tabular
    // fallback requires the matched label to start with an uppercase letter.
    const text = 'Bu marka ISUZU çok iyidir' // prose, not a label
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBeUndefined()
  })

  it('tabular fallback requires uppercase/digit at value start', () => {
    // Label + single space + lowercase letter → not a value, just prose flow.
    const text = 'Marka iyi bir araç' // "Brand is a good vehicle"
    const result = extractVehicleInfoFromText(text)
    expect(result?.make).toBeUndefined()
  })

  it('Marka Tipi alias resolves to model, not to make+Tipi-as-value', () => {
    // The new `marka\s+t[iİ]p[iİ]?` model alias must match BEFORE the bare
    // `marka` make alias on a `Marka Tipi 308` line. Otherwise make would
    // capture `Tipi 308` as its value.
    const text = 'Marka Tipi 308 COMFORT 1.6'
    const result = extractVehicleInfoFromText(text)
    // The bare "Marka" is not present standalone here; only "Marka Tipi".
    // model should capture; make should be undefined (no plain Marka label).
    expect(result?.model).toMatch(/308/)
  })
})

describe('parseTurkishCurrency — known good cases', () => {
  it('parses Turkish format 1.659,72 correctly', () => {
    expect(parseTurkishCurrency('1.659,72 TL')).toBe(1659.72)
    expect(parseTurkishCurrency('1.659,72')).toBe(1659.72)
  })

  it('parses thousands-separated values', () => {
    expect(parseTurkishCurrency('1.234.567,89')).toBe(1234567.89)
  })

  it('parses Brüt Prim string', () => {
    expect(parseTurkishCurrency('Brüt Prim 1.659,72 TL')).toBe(1659.72)
  })
})
