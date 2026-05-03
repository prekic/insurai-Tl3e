import { describe, it, expect } from 'vitest'
import { classifyDocumentType } from '../../../../src/lib/policy-pipeline/stage1-extract/document-classifier'

describe('classifyDocumentType', () => {
  it('identifies kasko policies', () => {
    expect(classifyDocumentType('Genişletilmiş Kasko Sigorta Poliçesi')).toBe('kasko')
    expect(classifyDocumentType('Araç Sigortası rayiç değer garantilidir.')).toBe('kasko')
  })

  it('identifies traffic policies', () => {
    expect(classifyDocumentType('ZMSS Poliçesi')).toBe('traffic')
    expect(
      classifyDocumentType('Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası')
    ).toBe('traffic')
  })

  it('identifies dask policies', () => {
    expect(classifyDocumentType('Zorunlu Deprem Sigortası')).toBe('dask')
  })

  it('identifies home policies', () => {
    expect(classifyDocumentType('Konut Sigorta Poliçesi')).toBe('home')
  })

  it('identifies health policies', () => {
    expect(classifyDocumentType('Tamamlayıcı Sağlık Sigortası (TSS)')).toBe('health')
  })

  it('returns unknown for unrecognized text', () => {
    expect(classifyDocumentType('Hayat sigortasi')).toBe('unknown') // Not in heuristic
    expect(classifyDocumentType('')).toBe('unknown')
  })

  it('handles case insensitivity', () => {
    expect(classifyDocumentType('KASKO SİGORTA')).toBe('kasko')
  })
})
