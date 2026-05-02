/**
 * Sprint 2 PR-S2.5 — regression tests for recategorizeIfGlassRepair().
 *
 * Round-4 reviewer flagged Anadolu's "Yerinde Sınırsız Cam Onarımı/
 * Değişimi" rendering under Assistance Services. It's a glass-coverage
 * benefit (feature of the AS+ Yetkili Servis Ağı glass program), not a
 * roadside-assistance service. Should appear under Supplementary near
 * the existing "Glass Damage Protection" line.
 */
import { describe, it, expect } from 'vitest'
import { recategorizeIfGlassRepair } from '../policy-converter'

describe('recategorizeIfGlassRepair (PR-S2.5)', () => {
  it('recategorizes Turkish glass-repair name from assistance to supplementary', () => {
    expect(
      recategorizeIfGlassRepair('Yerinde Sınırsız Cam Onarımı', 'Yerinde Sınırsız Cam Onarımı', 'assistance')
    ).toBe('supplementary')
  })

  it('recategorizes "Cam Değişim" variant', () => {
    expect(
      recategorizeIfGlassRepair('Cam Değişimi', 'Cam Değişimi', 'assistance')
    ).toBe('supplementary')
  })

  it('recategorizes English "Glass Repair" name', () => {
    expect(
      recategorizeIfGlassRepair('Glass Repair Service', 'Cam Onarım Servisi', 'assistance')
    ).toBe('supplementary')
  })

  it('recategorizes English "Windshield Repair" variant', () => {
    expect(
      recategorizeIfGlassRepair('Windshield Repair', 'Ön Cam Onarımı', 'assistance')
    ).toBe('supplementary')
  })

  it('does NOT touch a glass-repair name that was already correctly categorized as supplementary', () => {
    expect(
      recategorizeIfGlassRepair('Cam Onarımı', 'Cam Onarımı', 'supplementary')
    ).toBe('supplementary')
  })

  it('does NOT touch a glass-repair name that was correctly categorized as main', () => {
    expect(recategorizeIfGlassRepair('Cam Onarımı', 'Cam Onarımı', 'main')).toBe('main')
  })

  it('does NOT recategorize roadside-assistance services that are not glass-related', () => {
    expect(
      recategorizeIfGlassRepair('Çekme Kurtarma', 'Çekme Kurtarma', 'assistance')
    ).toBe('assistance')
    expect(recategorizeIfGlassRepair('Yol Yardım', 'Yol Yardım', 'assistance')).toBe('assistance')
    expect(
      recategorizeIfGlassRepair('İkame Araç Hizmeti', 'İkame Araç Hizmeti', 'assistance')
    ).toBe('assistance')
  })

  it('matches case-insensitively', () => {
    expect(recategorizeIfGlassRepair('CAM ONARIMI', 'CAM ONARIMI', 'assistance')).toBe('supplementary')
    expect(
      recategorizeIfGlassRepair('cam onarımı yerinde', 'cam onarımı yerinde', 'assistance')
    ).toBe('supplementary')
  })

  it('does NOT match unrelated coverages that contain "cam" as substring', () => {
    // "camlı kapı sistemi" (glass door system) is not a glass-repair coverage
    // — it doesn't contain "onarım"/"değişim" stems
    expect(
      recategorizeIfGlassRepair('Camlı Kapı Sistemi', 'Camlı Kapı Sistemi', 'assistance')
    ).toBe('assistance')
  })

  it('preserves "other" / "legal" / "liability" categories regardless', () => {
    // The recategorizer only intercepts assistance — anything else passes through
    expect(
      recategorizeIfGlassRepair('Cam Onarımı', 'Cam Onarımı', 'other')
    ).toBe('other')
    expect(
      recategorizeIfGlassRepair('Cam Onarımı', 'Cam Onarımı', 'legal')
    ).toBe('legal')
  })
})
