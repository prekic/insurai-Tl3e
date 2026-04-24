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
