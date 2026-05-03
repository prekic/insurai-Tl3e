import { describe, expect, it } from 'vitest'
import { normalizeCoverageLabel } from '../../../../src/lib/policy-pipeline/stage2-validate/normalize-text'

describe('normalizeCoverageLabel', () => {
  it('handles basic English labels', () => {
    expect(normalizeCoverageLabel('Personal Belongings')).toBe('personal belongings')
    expect(normalizeCoverageLabel('Personal  Belongings')).toBe('personal belongings')
  })

  it('handles Turkish characters correctly', () => {
    expect(normalizeCoverageLabel('HUKUKSAL KORUMA')).toBe('hukuksal koruma')
    expect(normalizeCoverageLabel('KİŞİSEL EŞYA')).toBe('kişisel eşya')
    expect(normalizeCoverageLabel('Genişletilmiş Kasko')).toBe('genişletilmiş kasko')
  })

  it('preserves punctuation', () => {
    expect(normalizeCoverageLabel('Grev L.H.H. Ve Terör')).toBe('grev l.h.h. ve terör')
    expect(normalizeCoverageLabel('Deprem, Heyelan, Fırtına, Dolu, Yıldırım')).toBe(
      'deprem, heyelan, fırtına, dolu, yıldırım'
    )
  })

  it('handles null/undefined gracefully', () => {
    expect(normalizeCoverageLabel(null)).toBe('')
    expect(normalizeCoverageLabel(undefined)).toBe('')
    expect(normalizeCoverageLabel('')).toBe('')
  })
})
