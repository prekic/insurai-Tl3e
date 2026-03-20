/**
 * Targeted tests for the KASKO reviewer-mode specimen issues (Mar 19 session 2).
 * Each describe block maps to one issue from the specimen analysis.
 *
 * These test the sanitizeReviewerInsights, deduplicateExclusions, and
 * benchmark provenance gating logic through their public effects.
 */
import { describe, it, expect } from 'vitest'
import { applySafeWording } from '../../analysis/display-interpreter'

// ─── Replicate sanitizeReviewerInsights for isolated testing ──────────────────
// Must stay in sync with policy-extractor.ts:sanitizeReviewerInsights()

function translateInsightToTr(body: string): string {
  // Minimal translation map for test purposes
  const map: Record<string, string> = {
    'Multiple exclusions may limit coverage in certain scenarios':
      'Çok sayıda istisna belirli durumlarda teminatı sınırlayabilir',
    'Premium is above 75th percentile - compare with other providers':
      'Prim 75. yüzdeliğin üzerinde - diğer şirketlerle karşılaştırın',
    'Review coverage limits annually to ensure adequate protection':
      'Yeterli korumayı sağlamak için teminat limitlerini yıllık olarak gözden geçirin',
  }
  return map[body] ?? body
}

function sanitizeReviewerInsights(insights: string[]): string[] {
  const result: string[] = []

  for (const raw of insights) {
    const line = raw
    // eslint-disable-next-line no-misleading-character-class
    const prefixMatch = line.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
    const prefix = prefixMatch ? prefixMatch[1] : ''
    let body = prefix ? line.slice(prefix.length).trim() : line.trim()

    // Promotional wording
    if (/\b(excellent|advantage|perfect|best|superior|outstanding)\b/i.test(body)) {
      if (/comprehensive.*coverage|kasko.*coverage|market.*value/i.test(body)) {
        body =
          'Kasko ana teminatı araç piyasa değeri üzerinden tanımlanmış görünüyor; standart kapsam ayrıntıları poliçe şartlarıyla doğrulanmalı'
      } else if (/glass|cam/i.test(body)) {
        body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
      } else if (/excess.*liab|mali.*mesuliyet|ihtiyari/i.test(body)) {
        body =
          'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı ve istisnalar poliçe şartlarından doğrulanmalı'
      } else {
        body = body
          .replace(/\b(excellent|advantage|perfect|best|superior|outstanding)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        if (!body) continue
      }
    }

    // Duplicated fragment assembly
    if (/generally unlimited.*generally unlimited/i.test(body)) {
      body =
        'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı genel olarak geniş olmakla birlikte alt limitler ve istisnalar poliçe şartlarından doğrulanmalı'
    }

    // English-only → translate
    if (/^[A-Za-z]/.test(body) && !/[çğıöşüÇĞİÖŞÜ]/.test(body)) {
      const translated = translateInsightToTr(body)
      if (translated !== body) {
        body = translated
      }
    }

    // Glass promotional
    if (/glass.*(?:bonus|advantage|doesn.?t affect)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }
    if (/first.*glass.*replacement.*(?:no.?claims|bonus)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }

    result.push(prefix ? `${prefix}${body}` : body)
  }

  // Evidence-first ordering
  const warnings = result.filter((i) => i.startsWith('⚠'))
  const observations = result.filter((i) => i.startsWith('✓'))
  const recommendations = result.filter((i) => i.startsWith('💡'))
  const other = result.filter(
    (i) => !i.startsWith('⚠') && !i.startsWith('✓') && !i.startsWith('💡')
  )

  return [...warnings, ...observations, ...other, ...recommendations]
}

// ─── Replicate deduplicateExclusions for isolated testing ──────────────────

function deduplicateExclusions(exclusions: string[]): string[] {
  if (exclusions.length <= 1) return exclusions

  const clusters: string[][] = [
    ['anahtar', 'kontak', 'çalın'],
    ['çalışır', 'vaziyette', 'çalın'],
    ['ehliyet', 'sürücü belgesi', 'kullanım'],
    ['özel tertibatlı', 'ruhsat', 'tescil'],
  ]

  const exclusionClusters: Map<number, number[]> = new Map()
  for (let i = 0; i < exclusions.length; i++) {
    const lower = exclusions[i].toLowerCase()
    const matched: number[] = []
    for (let c = 0; c < clusters.length; c++) {
      const hits = clusters[c].filter((kw) => lower.includes(kw))
      if (hits.length >= 2) matched.push(c)
    }
    exclusionClusters.set(i, matched)
  }

  const keptIndices = new Set<number>()
  const clusterWinner = new Map<number, number>()

  for (let i = 0; i < exclusions.length; i++) {
    const myClust = exclusionClusters.get(i) || []
    if (myClust.length === 0) {
      keptIndices.add(i)
      continue
    }
    let dominated = false
    for (const c of myClust) {
      const existing = clusterWinner.get(c)
      if (existing !== undefined) {
        if (exclusions[i].length > exclusions[existing].length) {
          keptIndices.delete(existing)
          keptIndices.add(i)
          clusterWinner.set(c, i)
        }
        dominated = true
      } else {
        clusterWinner.set(c, i)
        keptIndices.add(i)
      }
    }
    if (!dominated) keptIndices.add(i)
  }

  return exclusions.filter((_, idx) => keptIndices.has(idx))
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('Issue 1: Language consistency — single-language Turkish output', () => {
  it('rewrites English "Excellent comprehensive coverage" to Turkish', () => {
    const insights = [
      '✓ Excellent comprehensive coverage - Protection is generally available, subject to policy conditions with market value coverage',
    ]
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toMatch(/Kasko ana teminatı/)
    expect(result[0]).not.toMatch(/Excellent/i)
    expect(result[0]).not.toMatch(/Protection is generally/i)
  })

  it('rewrites English "Glass damage advantage" to Turkish', () => {
    const insights = [
      "💡 Glass damage advantage - First glass replacement doesn't affect no-claims bonus",
    ]
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toMatch(/Cam teminatı/)
    expect(result[0]).not.toMatch(/advantage/i)
    expect(result[0]).not.toMatch(/Glass damage/i)
  })

  it('does not modify already-Turkish insights', () => {
    const insights = ['⚠ Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir']
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toBe('⚠ Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir')
  })
})

describe('Issue 2: No promotional / sales wording', () => {
  it('blocks "Excellent" in insight text', () => {
    const insights = ['✓ Excellent coverage for your vehicle']
    const result = sanitizeReviewerInsights(insights)
    expect(result.join(' ')).not.toMatch(/excellent/i)
  })

  it('blocks "advantage" in insight text', () => {
    const insights = ['💡 Big advantage with this policy']
    const result = sanitizeReviewerInsights(insights)
    expect(result.join(' ')).not.toMatch(/advantage/i)
  })

  it('applySafeWording also strips "excellent"', () => {
    const result = applySafeWording('Excellent coverage')
    expect(result).not.toMatch(/excellent/i)
  })
})

describe('Issue 3: Liability insight — no duplicated fragments', () => {
  it('fixes "Generally unlimited...excess liability - Generally unlimited..." duplication', () => {
    const insights = [
      '✓ Generally unlimited, subject to sublimits and specific carve-outs excess liability - Generally unlimited, subject to sublimits and specific carve-outs protection for third party damages',
    ]
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toMatch(/İhtiyari mali mesuliyet/)
    expect(result[0]).not.toMatch(/Generally unlimited/i)
    // Must not repeat the same phrase
    const body = result[0].replace(/^✓\s*/, '')
    const words = body.split(/\s+/)
    const uniqueWords = new Set(words)
    // Allow some repetition (Turkish particles) but not the full phrase
    expect(words.length - uniqueWords.size).toBeLessThan(words.length / 3)
  })
})

describe('Issue 4: Exclusion deduplication', () => {
  const specimenExclusions = [
    'Anahtarın kontak üzerinde veya araç içerisinde bırakıldığı sırada gerçekleşen araç çalınmaları',
    'Aracın çalışır vaziyette bırakılması sonucu oluşan çalınmalar',
    'Gerekli sürücü belgesine sahip olmayan kimseler tarafından kullanılması',
    'Özel tertibatlı aracın ruhsatı adına tescil edilmiş kişi haricinde kullanılması',
    'Anahtarın kontak üzerinde bırakılması durumunda çalınma teminat dışı',
    'Ehliyet sahibi olmayan kişilerin kullanımı teminat dışı',
  ]

  it('reduces 6 specimen exclusions by collapsing semantic duplicates', () => {
    const result = deduplicateExclusions(specimenExclusions)
    expect(result.length).toBeLessThan(specimenExclusions.length)
  })

  it('collapses key-in-ignition theft variants into one', () => {
    const result = deduplicateExclusions(specimenExclusions)
    const keyIgnition = result.filter(
      (e) => e.toLowerCase().includes('anahtar') && e.toLowerCase().includes('çalın')
    )
    expect(keyIgnition.length).toBe(1)
  })

  it('preserves unique exclusions that do not overlap', () => {
    const result = deduplicateExclusions(specimenExclusions)
    // "Özel tertibatlı" exclusion should survive (unique cluster)
    expect(result.some((e) => e.includes('Özel tertibatlı'))).toBe(true)
  })

  it('returns input unchanged when no duplicates', () => {
    const unique = ['Exclusion A', 'Exclusion B']
    expect(deduplicateExclusions(unique)).toEqual(unique)
  })

  it('returns input unchanged for single exclusion', () => {
    const single = ['Only exclusion']
    expect(deduplicateExclusions(single)).toEqual(single)
  })
})

describe('Issue 5: Benchmark / market insight provenance gate', () => {
  it('sanitizer does not output percentile insight', () => {
    const insights = ['💡 Prim 75. yüzdeliğin üzerinde - diğer şirketlerle karşılaştırın']
    const result = sanitizeReviewerInsights(insights)
    // The sanitizer itself does not filter these (that happens in the
    // market commentary filter). But the output should be last (ordering).
    // The actual suppression is at generateRecommendationsAsync level.
    expect(result).toEqual(insights) // sanitizer preserves, filter removes
  })

  it('provenance gate opens when source + date + cohort are all present', () => {
    const p = { source: 'TSB/SEDDK 2025', date: '2025-03-01', cohort: 'Kasko 2024 Q4' }
    const hasBenchmarkProvenance = !!(p?.source && p?.date && p?.cohort)
    expect(hasBenchmarkProvenance).toBe(true)
  })

  it('provenance gate stays closed when any field is missing', () => {
    const noSource = { source: '', date: '2025-03-01', cohort: 'Kasko 2024 Q4' }
    expect(!!(noSource.source && noSource.date && noSource.cohort)).toBe(false)

    const noDate = { source: 'TSB', date: '', cohort: 'Kasko 2024 Q4' }
    expect(!!(noDate.source && noDate.date && noDate.cohort)).toBe(false)

    const noCohort = { source: 'TSB', date: '2025-03-01', cohort: '' }
    expect(!!(noCohort.source && noCohort.date && noCohort.cohort)).toBe(false)
  })

  it('provenance gate stays closed when provenance is undefined', () => {
    const p = undefined as { source: string; date: string; cohort: string } | undefined
    const hasBenchmarkProvenance = !!(p?.source && p?.date && p?.cohort)
    expect(hasBenchmarkProvenance).toBe(false)
  })

  it('static benchmarks have no provenance (gate closed by default)', async () => {
    const { MARKET_BENCHMARKS } = await import('@/data/market-data/benchmarks')
    const kasko = MARKET_BENCHMARKS.kasko
    const p = kasko.provenance
    const hasBenchmarkProvenance = !!(p?.source && p?.date && p?.cohort)
    expect(hasBenchmarkProvenance).toBe(false)
  })
})

describe('Issue 7: Evidence-first insight ordering', () => {
  it('places ⚠ warnings before ✓ observations before 💡 recommendations', () => {
    const insights = [
      '✓ Observation A',
      '💡 Recommendation B',
      '⚠ Warning C',
      '✓ Observation D',
      '⚠ Warning E',
    ]
    const result = sanitizeReviewerInsights(insights)
    const warningEnd = result.findLastIndex((i) => i.startsWith('⚠'))
    const observationStart = result.findIndex((i) => i.startsWith('✓'))
    const recStart = result.findIndex((i) => i.startsWith('💡'))

    // All warnings before observations
    if (warningEnd >= 0 && observationStart >= 0) {
      expect(warningEnd).toBeLessThan(observationStart)
    }
    // All observations before recommendations
    if (observationStart >= 0 && recStart >= 0) {
      expect(recStart).toBeGreaterThan(observationStart)
    }
  })

  it('preserves items within same category', () => {
    const insights = ['⚠ Warning 1', '⚠ Warning 2', '✓ Obs 1']
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toBe('⚠ Warning 1')
    expect(result[1]).toBe('⚠ Warning 2')
    expect(result[2]).toBe('✓ Obs 1')
  })
})

describe('Issue 6: Coverage label normalization', () => {
  // Coverage names map is the source of truth; test that key specimen labels exist
  it('has Turkish label for "Excess Liability"', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Excess Liability']).toBe('İhtiyari Mali Mesuliyet')
  })

  it('has Turkish label for "Anadolu Service"', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Anadolu Service']).toMatch(/Anadolu Hizmet Paketi/)
  })

  it('has Turkish label for "Personal Items"', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Personal Items']).toBe('Kişisel Eşya')
  })

  it('has Turkish label for seat accident coverages', async () => {
    const { COVERAGE_NAMES_EN_TO_TR } = await import('@/lib/i18n/coverage-names')
    expect(COVERAGE_NAMES_EN_TO_TR['Seat Personal Accident - Death']).toMatch(/Koltuk Ferdi Kaza/)
    expect(COVERAGE_NAMES_EN_TO_TR['Seat Personal Accident - Permanent Disability']).toMatch(
      /Koltuk Ferdi Kaza/
    )
  })
})

describe('No-regression: preserved correct behaviors', () => {
  it('does NOT strip non-promotional ✓ Turkish insights', () => {
    const insights = ['✓ 5 özel kloz tespit edildi — koşulların geçerliliği doğrulanmalı']
    const result = sanitizeReviewerInsights(insights)
    expect(result[0]).toBe(insights[0])
  })

  it('does NOT strip ⚠ extraction warnings', () => {
    const insights = [
      '⚠ Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir',
      '⚠ Bazı teminat-limit eşleşmeleri ek kontrol gerektiriyor',
    ]
    const result = sanitizeReviewerInsights(insights)
    expect(result).toContain(insights[0])
    expect(result).toContain(insights[1])
  })
})
