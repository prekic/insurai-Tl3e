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
