/**
 * Sprint 3 PR-S3.4 — regression tests for generateAnadoluHizmetGloss().
 *
 * Round-4 reviewer flagged that "Anadolu Hizmet" coverage rendered as
 * "Anadolu Service: Included" with no description, telling the user
 * nothing about the actual package contents (towing, replacement
 * vehicle, medical transport, etc.). This rule populates a bilingual
 * gloss when the LLM didn't.
 */
import { describe, it, expect } from 'vitest'
import { generateAnadoluHizmetGloss } from '../policy-converter'

describe('generateAnadoluHizmetGloss (PR-S3.4)', () => {
  it('returns gloss for "Anadolu Hizmet" name when description is empty', () => {
    const result = generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', '')
    expect(result).not.toBeNull()
    expect(result).toContain('ikame araç')
    expect(result).toContain('tıbbi nakil')
    expect(result).toContain('replacement vehicle')
  })

  it('returns gloss for English "Anadolu Service" name', () => {
    const result = generateAnadoluHizmetGloss('Anadolu Service', 'Anadolu Hizmet', undefined)
    expect(result).not.toBeNull()
    expect(result).toContain('towing')
  })

  it('returns gloss for descriptive variant "Anadolu Hizmet Hususi 30/48 Otomobil Grup 2"', () => {
    const result = generateAnadoluHizmetGloss(
      'Anadolu Hizmet Hususi 30/48 Otomobil Grup 2 Pert Dahil',
      'Anadolu Hizmet Hususi 30/48 Otomobil Grup 2 Pert Dahil',
      null
    )
    expect(result).not.toBeNull()
    expect(result).toContain('Çekme/kurtarma')
  })

  it('returns null when name does NOT match Anadolu Hizmet pattern', () => {
    expect(generateAnadoluHizmetGloss('Roadside Service', 'Yol Yardım', '')).toBeNull()
    expect(generateAnadoluHizmetGloss('Allianz Mobile Plus', 'Allianz Mobile Plus', '')).toBeNull()
  })

  it('does NOT overwrite when LLM extracted a substantive description', () => {
    // 30+ chars existing description → defer to LLM
    const existingDesc =
      'Çekme/kurtarma, ikame araç ve diğer asistans hizmetleri detaylı şekilde poliçe ekinde belirtilmiştir.'
    expect(generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', existingDesc)).toBeNull()
  })

  it('overwrites a placeholder/short description (under 30 chars)', () => {
    // Short / placeholder description → still apply the gloss
    expect(
      generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', 'Included')
    ).not.toBeNull()
    expect(generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', 'Yes')).not.toBeNull()
    expect(
      generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', 'Asistans hizmeti dahil')
    ).not.toBeNull() // 22 chars
  })

  it('matches case-insensitively', () => {
    expect(generateAnadoluHizmetGloss('ANADOLU HIZMET', 'ANADOLU HIZMET', '')).not.toBeNull()
    expect(
      generateAnadoluHizmetGloss('anadolu hizmet hususi', 'anadolu hizmet hususi', '')
    ).not.toBeNull()
  })

  it('contains both Turkish and English variants for bilingual rendering', () => {
    const result = generateAnadoluHizmetGloss('Anadolu Hizmet', 'Anadolu Hizmet', '')
    expect(result).not.toBeNull()
    // Turkish variant present
    expect(result!).toMatch(/Çekme|kurtarma|ikame araç/)
    // English variant present
    expect(result!).toMatch(/towing|replacement vehicle/)
    // Separated by " / " for caller-side splitting
    expect(result!).toContain(' / ')
  })

  it('does NOT trigger on similarly-named non-Anadolu services', () => {
    // "Anadolu Hizmet" must appear adjacent (\s*) — "Anadolu Sigorta Genel Hizmet"
    // has intervening words so it does NOT match.
    expect(
      generateAnadoluHizmetGloss('Anadolu Sigorta Genel Hizmet', 'Anadolu Sigorta Genel Hizmet', '')
    ).toBeNull()
    // Unrelated "Hizmet" alone shouldn't trigger
    expect(generateAnadoluHizmetGloss('Hizmet Paketi', 'Hizmet Paketi', '')).toBeNull()
    expect(generateAnadoluHizmetGloss('Yol Yardım Hizmeti', 'Yol Yardım Hizmeti', '')).toBeNull()
  })
})
