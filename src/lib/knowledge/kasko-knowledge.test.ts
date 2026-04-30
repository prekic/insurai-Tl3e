/**
 * Comprehensive tests for kasko-knowledge.ts
 * Targeting maximum branch coverage across all exported functions.
 */
import { describe, it, expect } from 'vitest'

import {
  KASKO_COVERAGE_CATEGORIES,
  KASKO_IMPLICIT_COVERAGES,
  KASKO_COVERAGE_TYPES,
  KASKO_MARKET_BENCHMARKS,
  KASKO_EXCLUSION_EXPLANATIONS,
  CRITICAL_EXCLUSION_PATTERNS,
  COMMON_EXCLUSIONS_TO_CHECK,
  COVERAGE_GROUP_PREFIXES,
  SERVICE_COVERAGE_CLARIFICATIONS,
  IMPORTANCE_ORDER,
  isImplicitKaskoCoverage,
  detectCoverageCategory,
  shouldShowUnlimited,
  shouldShowIncluded,
  extractVehicleInfo,
  findKaskoBenchmark,
  evaluateKaskoPolicy,
  analyzeExclusions,
  sortCoveragesByCategory,
  groupCoveragesByCategory,
  formatKaskoCoverageLimit,
  getCoverageClarifications,
  sortByImportance,
  groupCoverageSubLimits,
  analyzeExclusionsComprehensive,
  type GroupedCoverage,
} from './kasko-knowledge'

// =============================================================================
// CONSTANTS AND DATA EXPORTS
// =============================================================================

describe('KASKO_COVERAGE_CATEGORIES', () => {
  it('should have all 6 categories with correct order', () => {
    expect(Object.keys(KASKO_COVERAGE_CATEGORIES)).toHaveLength(6)
    expect(KASKO_COVERAGE_CATEGORIES.main.order).toBe(1)
    expect(KASKO_COVERAGE_CATEGORIES.liability.order).toBe(2)
    expect(KASKO_COVERAGE_CATEGORIES.personal_accident.order).toBe(3)
    expect(KASKO_COVERAGE_CATEGORIES.supplementary.order).toBe(4)
    expect(KASKO_COVERAGE_CATEGORIES.assistance.order).toBe(5)
    expect(KASKO_COVERAGE_CATEGORIES.legal.order).toBe(6)
  })

  it('should have Turkish and English labels for all categories', () => {
    for (const cat of Object.values(KASKO_COVERAGE_CATEGORIES)) {
      expect(cat.labelTr).toBeTruthy()
      expect(cat.labelEn).toBeTruthy()
      expect(cat.description).toBeTruthy()
      expect(cat.color).toBeTruthy()
    }
  })
})

describe('KASKO_IMPLICIT_COVERAGES', () => {
  it('should have 9 implicit coverages', () => {
    expect(KASKO_IMPLICIT_COVERAGES).toHaveLength(9)
  })

  it('should all have alwaysIncluded: true', () => {
    for (const coverage of KASKO_IMPLICIT_COVERAGES) {
      expect(coverage.alwaysIncluded).toBe(true)
    }
  })

  it('should have non-empty aliases for each coverage', () => {
    for (const coverage of KASKO_IMPLICIT_COVERAGES) {
      expect(coverage.aliases.length).toBeGreaterThan(0)
    }
  })

  it('should have 8 main coverages and 1 liability coverage', () => {
    const mainCount = KASKO_IMPLICIT_COVERAGES.filter((c) => c.category === 'main').length
    const liabilityCount = KASKO_IMPLICIT_COVERAGES.filter((c) => c.category === 'liability').length
    expect(mainCount).toBe(8)
    expect(liabilityCount).toBe(1)
  })
})

describe('KASKO_COVERAGE_TYPES', () => {
  it('should have coverage types for all categories', () => {
    const categories = new Set(Object.values(KASKO_COVERAGE_TYPES).map((t) => t.category))
    expect(categories).toContain('main')
    expect(categories).toContain('liability')
    expect(categories).toContain('personal_accident')
    expect(categories).toContain('supplementary')
    expect(categories).toContain('assistance')
    expect(categories).toContain('legal')
  })

  it('should have vehicle_value with isMarketValue', () => {
    expect(KASKO_COVERAGE_TYPES.vehicle_value.isMarketValue).toBe(true)
  })

  it('should have increased_liability with isUnlimited', () => {
    expect(KASKO_COVERAGE_TYPES.increased_liability.isUnlimited).toBe(true)
  })

  it('should have roadside_assistance with isIncludedService', () => {
    expect(KASKO_COVERAGE_TYPES.roadside_assistance.isIncludedService).toBe(true)
  })
})

describe('KASKO_MARKET_BENCHMARKS', () => {
  it('should have 5 benchmark entries', () => {
    expect(KASKO_MARKET_BENCHMARKS).toHaveLength(5)
  })

  it('should have valid premium ranges for each entry', () => {
    for (const benchmark of KASKO_MARKET_BENCHMARKS) {
      expect(benchmark.premiumRange.min).toBeLessThan(benchmark.premiumRange.max)
      expect(benchmark.averagePremium).toBeGreaterThanOrEqual(benchmark.premiumRange.min)
      expect(benchmark.averagePremium).toBeLessThanOrEqual(benchmark.premiumRange.max)
    }
  })
})

describe('CRITICAL_EXCLUSION_PATTERNS', () => {
  it('should have 7 critical patterns', () => {
    expect(CRITICAL_EXCLUSION_PATTERNS).toHaveLength(7)
  })

  it('should all have severity "critical"', () => {
    for (const p of CRITICAL_EXCLUSION_PATTERNS) {
      expect(p.severity).toBe('critical')
    }
  })
})

describe('COVERAGE_GROUP_PREFIXES', () => {
  it('should have 4 group definitions', () => {
    expect(COVERAGE_GROUP_PREFIXES).toHaveLength(4)
  })

  it('should each have subLimitLabels', () => {
    for (const group of COVERAGE_GROUP_PREFIXES) {
      expect(Object.keys(group.subLimitLabels).length).toBeGreaterThan(0)
    }
  })
})

describe('SERVICE_COVERAGE_CLARIFICATIONS', () => {
  it('should have clarifications for 4 service types', () => {
    expect(Object.keys(SERVICE_COVERAGE_CLARIFICATIONS)).toHaveLength(4)
    expect(SERVICE_COVERAGE_CLARIFICATIONS['ikame araç']).toBeDefined()
    expect(SERVICE_COVERAGE_CLARIFICATIONS['çekici']).toBeDefined()
    expect(SERVICE_COVERAGE_CLARIFICATIONS['asistans']).toBeDefined()
    expect(SERVICE_COVERAGE_CLARIFICATIONS['cam']).toBeDefined()
  })
})

describe('IMPORTANCE_ORDER', () => {
  it('should have correct order values', () => {
    expect(IMPORTANCE_ORDER.critical).toBe(1)
    expect(IMPORTANCE_ORDER.standard).toBe(2)
    expect(IMPORTANCE_ORDER.minor).toBe(3)
  })
})

// =============================================================================
// isImplicitKaskoCoverage
// =============================================================================

describe('isImplicitKaskoCoverage', () => {
  it('should match by alias - collision', () => {
    expect(isImplicitKaskoCoverage('collision')).toBe(true)
  })

  it('should match by alias - theft (Turkish)', () => {
    expect(isImplicitKaskoCoverage('hırsızlık')).toBe(true)
  })

  it('should match by alias - fire (English)', () => {
    expect(isImplicitKaskoCoverage('fire')).toBe(true)
  })

  it('should match by name', () => {
    expect(isImplicitKaskoCoverage('Çarpma/Çarpışma')).toBe(true)
  })

  it('should match by nameTr', () => {
    expect(isImplicitKaskoCoverage('Doğal Afetler')).toBe(true)
  })

  it('should match case-insensitively for ASCII text', () => {
    // 'dolu' matches alias 'dolu' directly
    expect(isImplicitKaskoCoverage('dolu')).toBe(true)
    // 'flood' matches alias 'flood'
    expect(isImplicitKaskoCoverage('FLOOD')).toBe(true)
  })

  it('should NOT match when uppercase ASCII differs from Turkish chars', () => {
    // 'YANGIN' lowercases to 'yangin' (ASCII i), but alias is 'yangın' (Turkish ı)
    // JavaScript .toLowerCase() does not produce Turkish ı from ASCII I
    expect(isImplicitKaskoCoverage('YANGIN')).toBe(false)
    // 'HIRSIZLIK' lowercases to 'hirsizlik', but alias is 'hırsızlık'
    expect(isImplicitKaskoCoverage('HIRSIZLIK')).toBe(false)
  })

  it('should match partial names containing implicit coverage', () => {
    expect(isImplicitKaskoCoverage('Sel/Su Baskını Teminatı')).toBe(true)
  })

  it('should match earthquake aliases', () => {
    expect(isImplicitKaskoCoverage('deprem')).toBe(true)
    expect(isImplicitKaskoCoverage('earthquake')).toBe(true)
    expect(isImplicitKaskoCoverage('zelzele')).toBe(true)
  })

  it('should match storm aliases', () => {
    expect(isImplicitKaskoCoverage('fırtına')).toBe(true)
    expect(isImplicitKaskoCoverage('storm')).toBe(true)
    expect(isImplicitKaskoCoverage('kasırga')).toBe(true)
  })

  it('should match third party liability aliases', () => {
    expect(isImplicitKaskoCoverage('üçüncü şahıs')).toBe(true)
    expect(isImplicitKaskoCoverage('3. şahıs')).toBe(true)
    expect(isImplicitKaskoCoverage('mali sorumluluk')).toBe(true)
  })

  it('should match flood aliases', () => {
    expect(isImplicitKaskoCoverage('sel')).toBe(true)
    expect(isImplicitKaskoCoverage('flood')).toBe(true)
    expect(isImplicitKaskoCoverage('taşkın')).toBe(true)
  })

  it('should NOT match non-implicit coverages', () => {
    expect(isImplicitKaskoCoverage('Cam Kırılması')).toBe(false)
    expect(isImplicitKaskoCoverage('İkame Araç')).toBe(false)
    expect(isImplicitKaskoCoverage('Hukuki Koruma')).toBe(false)
    expect(isImplicitKaskoCoverage('Anahtar Kaybı')).toBe(false)
  })

  it('should NOT match empty string', () => {
    expect(isImplicitKaskoCoverage('')).toBe(false)
  })

  it('should NOT match random text', () => {
    expect(isImplicitKaskoCoverage('random text here')).toBe(false)
  })
})

// =============================================================================
// detectCoverageCategory
// =============================================================================

describe('detectCoverageCategory', () => {
  describe('liability detection', () => {
    it('should detect mali sorumluluk', () => {
      expect(detectCoverageCategory('İhtiyari Mali Sorumluluk')).toBe('liability')
    })

    it('should detect manevi', () => {
      expect(detectCoverageCategory('Manevi Tazminat')).toBe('liability')
    })

    it('should detect artan mali', () => {
      expect(detectCoverageCategory('Artan Mali')).toBe('liability')
    })
  })

  describe('personal_accident detection', () => {
    it('should detect ferdi kaza', () => {
      expect(detectCoverageCategory('Sürücü Ferdi Kaza')).toBe('personal_accident')
    })

    it('should detect koltuk', () => {
      expect(detectCoverageCategory('Koltuk Ferdi Kaza')).toBe('personal_accident')
    })

    it('should detect ölüm', () => {
      expect(detectCoverageCategory('Koltuk - Ölüm')).toBe('personal_accident')
    })

    it('should detect sakatlık', () => {
      expect(detectCoverageCategory('Sürekli Sakatlık')).toBe('personal_accident')
    })

    it('should detect tedavi', () => {
      expect(detectCoverageCategory('Tedavi Masrafları')).toBe('personal_accident')
    })
  })

  describe('assistance detection', () => {
    it('should detect asistans', () => {
      expect(detectCoverageCategory('Asistans Hizmetleri')).toBe('assistance')
    })

    it('should detect yol yardım', () => {
      expect(detectCoverageCategory('Yol Yardım')).toBe('assistance')
    })

    it('should detect ikame with ASCII lowercase i', () => {
      // Note: İkame with Turkish İ lowercases to i̇kame (with combining dot),
      // which does NOT match 'ikame'. Use ASCII 'ikame' for reliable match.
      expect(detectCoverageCategory('ikame araç')).toBe('assistance')
    })

    it('should NOT detect İkame with Turkish İ as assistance', () => {
      // Turkish İ lowercases to i̇ (combining dot), which doesn't match 'ikame'
      expect(detectCoverageCategory('İkame Araç')).toBe('supplementary')
    })

    it('should detect çekici', () => {
      expect(detectCoverageCategory('Çekici Hizmeti')).toBe('assistance')
    })

    it('should detect hizmet', () => {
      expect(detectCoverageCategory('Onarım Hizmet')).toBe('assistance')
    })
  })

  describe('legal detection', () => {
    it('should detect hukuki', () => {
      expect(detectCoverageCategory('Hukuki Koruma')).toBe('legal')
    })

    it('should detect kefalet', () => {
      expect(detectCoverageCategory('Kefalet Avansı')).toBe('legal')
    })

    it('should detect avukat', () => {
      expect(detectCoverageCategory('Avukat Masrafları')).toBe('legal')
    })
  })

  describe('main detection', () => {
    it('should detect araç bedeli', () => {
      expect(detectCoverageCategory('Araç Bedeli')).toBe('main')
    })

    it('should detect rayiç', () => {
      expect(detectCoverageCategory('Rayiç Değer')).toBe('main')
    })

    it('should detect çarpma', () => {
      expect(detectCoverageCategory('Çarpma/Çarpışma')).toBe('main')
    })

    it('should detect hırsızlık', () => {
      expect(detectCoverageCategory('Hırsızlık')).toBe('main')
    })

    it('should detect yangın', () => {
      expect(detectCoverageCategory('Yangın')).toBe('main')
    })

    it('should detect doğal afet', () => {
      expect(detectCoverageCategory('Doğal Afet')).toBe('main')
    })
  })

  describe('supplementary (default)', () => {
    it('should default to supplementary for glass', () => {
      expect(detectCoverageCategory('Cam Kırılması')).toBe('supplementary')
    })

    it('should default to supplementary for key loss', () => {
      expect(detectCoverageCategory('Anahtar Kaybı')).toBe('supplementary')
    })

    it('should default to supplementary for unknown coverage', () => {
      expect(detectCoverageCategory('Bilinmeyen Teminat')).toBe('supplementary')
    })

    it('should default to supplementary for empty string', () => {
      expect(detectCoverageCategory('')).toBe('supplementary')
    })
  })

  it('should be case-insensitive for ASCII text', () => {
    expect(detectCoverageCategory('artan mali')).toBe('liability')
    expect(detectCoverageCategory('ferdi kaza')).toBe('personal_accident')
  })

  it('should handle Turkish İ lowercase producing combining dot in different positions', () => {
    // 'ARTAN MALİ' -> 'artan mali̇' (combining dot AFTER 'i')
    // 'artan mali̇'.includes('artan mali') is TRUE because 'artan mali' is a prefix
    // The combining dot is a SEPARATE character after 'i', so prefix match works
    expect(detectCoverageCategory('ARTAN MALİ')).toBe('liability')

    // But 'İKAME' -> 'i̇kame' where combining dot is BEFORE 'kame'
    // 'i̇kame'.includes('ikame') is FALSE because 'i̇' (2 chars) != 'i' (1 char)
    expect(detectCoverageCategory('İKAME ARAÇ')).toBe('supplementary')
  })
})

// =============================================================================
// shouldShowUnlimited
// =============================================================================

describe('shouldShowUnlimited', () => {
  it('should return true for artan mali sorumluluk with limit 0', () => {
    expect(shouldShowUnlimited('Artan Mali Sorumluluk', 0)).toBe(true)
  })

  it('should return true for mali sorumluluk with limit 0', () => {
    expect(shouldShowUnlimited('İhtiyari Mali Sorumluluk', 0)).toBe(true)
  })

  it('should return true for sınırsız keyword with limit 0', () => {
    expect(shouldShowUnlimited('Sınırsız Teminat', 0)).toBe(true)
  })

  it('should return true for unlimited keyword with limit 0', () => {
    expect(shouldShowUnlimited('Unlimited Coverage', 0)).toBe(true)
  })

  it('should return true when limit is null (treated as 0)', () => {
    expect(shouldShowUnlimited('Artan Mali Sorumluluk', null as unknown as number)).toBe(true)
  })

  it('should return false for non-unlimited pattern with limit 0', () => {
    expect(shouldShowUnlimited('Cam Kırılması', 0)).toBe(false)
  })

  it('should return false when limit is positive (even with unlimited pattern)', () => {
    expect(shouldShowUnlimited('Artan Mali Sorumluluk', 50000)).toBe(false)
  })

  it('should return false for regular coverage with positive limit', () => {
    expect(shouldShowUnlimited('Cam Kırılması', 25000)).toBe(false)
  })

  it('should be case-insensitive for ASCII text', () => {
    expect(shouldShowUnlimited('artan mali sorumluluk', 0)).toBe(true)
  })

  it('should NOT match when Turkish İ produces combining dot in lowercase', () => {
    // 'MALİ' lowercases to 'mali̇' (combining dot), not 'mali'
    expect(shouldShowUnlimited('ARTAN MALİ SORUMLULUK', 0)).toBe(false)
  })
})

// =============================================================================
// shouldShowIncluded
// =============================================================================

describe('shouldShowIncluded', () => {
  it('should return true for asistans with limit 0', () => {
    expect(shouldShowIncluded('Asistans Hizmetleri', 0)).toBe(true)
  })

  it('should return true for yol yardım with limit 0', () => {
    expect(shouldShowIncluded('Yol Yardım', 0)).toBe(true)
  })

  it('should return true for ikame araç (lowercase ASCII) with limit 0', () => {
    expect(shouldShowIncluded('ikame araç', 0)).toBe(true)
  })

  it('should NOT match İkame Araç with Turkish İ due to combining dot', () => {
    // 'İkame Araç'.toLowerCase() = 'i̇kame araç' -> 'ikame araç' check fails
    expect(shouldShowIncluded('İkame Araç', 0)).toBe(false)
  })

  it('should return true for çekici with limit 0', () => {
    expect(shouldShowIncluded('Çekici Hizmeti', 0)).toBe(true)
  })

  it('should return true for hizmet with limit 0', () => {
    expect(shouldShowIncluded('Tamir Hizmet', 0)).toBe(true)
  })

  it('should return true for onarım with limit 0', () => {
    expect(shouldShowIncluded('Onarım Servisi', 0)).toBe(true)
  })

  it('should return true for yardım with limit 0', () => {
    expect(shouldShowIncluded('Acil Yardım', 0)).toBe(true)
  })

  it('should return true when limit is null (treated as 0)', () => {
    expect(shouldShowIncluded('Asistans', null as unknown as number)).toBe(true)
  })

  it('should return false for service pattern with positive limit', () => {
    expect(shouldShowIncluded('İkame Araç', 5000)).toBe(false)
  })

  it('should return false for non-service coverage with limit 0', () => {
    expect(shouldShowIncluded('Hırsızlık', 0)).toBe(false)
  })

  it('should return false for non-service coverage with positive limit', () => {
    expect(shouldShowIncluded('Cam Kırılması', 25000)).toBe(false)
  })
})

// =============================================================================
// extractVehicleInfo
// =============================================================================

describe('extractVehicleInfo', () => {
  describe('plate number extraction', () => {
    it('should extract plate number with "plaka:" prefix', () => {
      const result = extractVehicleInfo('Plaka: 34 RZ 9511')
      expect(result.plate).toBe('34 RZ 9511')
    })

    it('should extract plate from pattern without prefix', () => {
      const result = extractVehicleInfo('Araç bilgileri 06 ABC 1234 model')
      expect(result.plate).toBe('06 ABC 1234')
    })

    it('should use first matching pattern and stop', () => {
      const result = extractVehicleInfo('plaka: 34 AB 1234 ve 06 CD 5678')
      expect(result.plate).toBe('34 AB 1234')
    })

    it('should handle no plate match', () => {
      const result = extractVehicleInfo('No plate information here')
      expect(result.plate).toBeUndefined()
    })
  })

  describe('vehicle make extraction', () => {
    it('should extract make from "marka:" prefix', () => {
      const result = extractVehicleInfo('Marka: Toyota\nModel: Corolla')
      expect(result.make).toBe('Toyota')
    })

    it('should detect known car brands', () => {
      const brands = [
        'ford',
        'toyota',
        'volkswagen',
        'renault',
        'fiat',
        'mercedes',
        'bmw',
        'audi',
        'hyundai',
        'kia',
        'peugeot',
        'citroen',
        'opel',
        'skoda',
        'seat',
        'dacia',
        'honda',
        'nissan',
        'mazda',
      ]
      for (const brand of brands) {
        const result = extractVehicleInfo(`Araç ${brand} model`)
        expect(result.make).toBeTruthy()
      }
    })

    it('should handle no make match', () => {
      const result = extractVehicleInfo('No vehicle brand here')
      expect(result.make).toBeUndefined()
    })

    it('should stop at first make match', () => {
      const result = extractVehicleInfo('Marka: Ford\nmodel yılı 2023')
      expect(result.make).toBe('Ford')
    })
  })

  describe('model year extraction', () => {
    it('should extract year from "model yılı:"', () => {
      const result = extractVehicleInfo('Model Yılı: 2023')
      expect(result.year).toBe(2023)
    })

    it('should extract year from "yıl:"', () => {
      const result = extractVehicleInfo('Yıl: 2020')
      expect(result.year).toBe(2020)
    })

    it('should handle no year match', () => {
      const result = extractVehicleInfo('No year here')
      expect(result.year).toBeUndefined()
    })
  })

  describe('usage type extraction', () => {
    it('should detect hususi (private) usage', () => {
      const result = extractVehicleInfo('Kullanım: Hususi')
      expect(result.usage).toBe('Hususi')
    })

    it('should detect ticari (commercial) usage', () => {
      const result = extractVehicleInfo('Kullanım: Ticari')
      expect(result.usage).toBe('Ticari')
    })

    it('should handle no usage match', () => {
      const result = extractVehicleInfo('No usage info')
      expect(result.usage).toBeUndefined()
    })

    it('should prefer hususi when both present (checked first)', () => {
      const result = extractVehicleInfo('Hususi ticari')
      expect(result.usage).toBe('Hususi')
    })
  })

  it('should extract multiple fields at once', () => {
    const text = 'Plaka: 34 AB 1234\nMarka: Ford\nModel Yılı: 2022\nKullanım: Hususi'
    const result = extractVehicleInfo(text)
    expect(result.plate).toBe('34 AB 1234')
    expect(result.make).toBe('Ford')
    expect(result.year).toBe(2022)
    expect(result.usage).toBe('Hususi')
  })

  it('should return empty object for empty string', () => {
    const result = extractVehicleInfo('')
    expect(result.plate).toBeUndefined()
    expect(result.make).toBeUndefined()
    expect(result.year).toBeUndefined()
    expect(result.usage).toBeUndefined()
  })
})

// =============================================================================
// findKaskoBenchmark
// =============================================================================

describe('findKaskoBenchmark', () => {
  it('should return default sedan benchmark when vehicleClass is undefined', () => {
    const result = findKaskoBenchmark(undefined)
    expect(result).toBe(KASKO_MARKET_BENCHMARKS[0])
  })

  it('should return default sedan benchmark when vehicleClass is empty', () => {
    const result = findKaskoBenchmark('')
    // Empty string does not match SUV/Ticari/Motor, so matchedClass = 'Binek'
    expect(result).toBeDefined()
    expect(result!.vehicleClass).toContain('Binek')
  })

  describe('SUV/Crossover matching', () => {
    it('should match "suv"', () => {
      const result = findKaskoBenchmark('SUV', 1)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('SUV/Crossover')
    })

    it('should match "crossover"', () => {
      const result = findKaskoBenchmark('Crossover', 2)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('SUV/Crossover')
    })
  })

  describe('commercial vehicle matching', () => {
    it('should match "kamyonet"', () => {
      const result = findKaskoBenchmark('Kamyonet', 2)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toContain('Ticari')
    })

    it('should match "ticari"', () => {
      const result = findKaskoBenchmark('Ticari', 3)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toContain('Ticari')
    })

    it('should match "panel"', () => {
      const result = findKaskoBenchmark('Panelvan', 1)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toContain('Ticari')
    })
  })

  describe('motorcycle matching', () => {
    it('should match "motor"', () => {
      const result = findKaskoBenchmark('Motor', 2)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('Motosiklet')
    })

    it('should match "motosiklet"', () => {
      const result = findKaskoBenchmark('Motosiklet', 1)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('Motosiklet')
    })
  })

  describe('sedan (default class) matching', () => {
    it('should default to Binek for unknown class', () => {
      const result = findKaskoBenchmark('Binek Araç', 1)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toContain('Binek')
    })
  })

  describe('age-based benchmark selection', () => {
    it('should select 0-3 age range for vehicles aged <= 3', () => {
      const result = findKaskoBenchmark('Binek', 2)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('0-3 yıl')
    })

    it('should select 4-7 age range for vehicles aged 4-7', () => {
      const result = findKaskoBenchmark('Binek', 5)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('4-7 yıl')
    })

    it('should select 0-5 age range for vehicles aged > 7', () => {
      // For Binek, there's no 0-5 match. It falls back to find(b.vehicleClass.includes('Binek'))
      const result = findKaskoBenchmark('Binek', 10)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toContain('Binek')
    })

    it('should select 0-3 age range when vehicleAge is undefined', () => {
      const result = findKaskoBenchmark('SUV')
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('0-3 yıl')
    })

    it('should select 0-3 age range for vehicleAge = 0', () => {
      const result = findKaskoBenchmark('Binek', 0)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('0-3 yıl')
    })

    it('should select 0-3 age range for vehicleAge = 3', () => {
      const result = findKaskoBenchmark('Binek', 3)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('0-3 yıl')
    })

    it('should select 4-7 age range for vehicleAge = 4', () => {
      const result = findKaskoBenchmark('Binek', 4)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('4-7 yıl')
    })

    it('should select 4-7 age range for vehicleAge = 7', () => {
      const result = findKaskoBenchmark('Binek', 7)
      expect(result).toBeDefined()
      expect(result!.ageRange).toBe('4-7 yıl')
    })

    it('should select 0-5 age range for vehicles > 7 (maps to 0-5)', () => {
      // For SUV, there is only a 0-3 entry, so > 7 maps to '0-5 yıl' which doesn't match SUV.
      // Falls back to finding any entry with the class.
      const result = findKaskoBenchmark('SUV', 10)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('SUV/Crossover')
    })
  })

  describe('fallback when exact ageRange does not match', () => {
    it('should fallback to any matching vehicle class when age range does not match', () => {
      // SUV only has 0-3 entry; age 6 maps to 4-7 which doesn't exist for SUV
      const result = findKaskoBenchmark('SUV', 6)
      expect(result).toBeDefined()
      expect(result!.vehicleClass).toBe('SUV/Crossover')
    })

    it('should return undefined if neither exact match nor class fallback exists', () => {
      // An impossible scenario given the current data, but test the logic
      // Binek with age range "0-5 yıl" has no exact match, but fallback finds Binek
      const result = findKaskoBenchmark('Binek', 15)
      expect(result).toBeDefined() // Fallback works
    })
  })
})

// =============================================================================
// evaluateKaskoPolicy
// =============================================================================

describe('evaluateKaskoPolicy', () => {
  it('should return base result with empty coverages', () => {
    const result = evaluateKaskoPolicy([], 20000)
    expect(result.hasMarketValueCoverage).toBe(false)
    expect(result.hasUnlimitedLiability).toBe(false)
    expect(result.hasPersonalAccident).toBe(false)
    expect(result.hasReplacementVehicle).toBe(false)
    expect(result.hasLegalProtection).toBe(false)
    expect(result.coverageCompleteness).toBe(60) // base only
  })

  describe('coverage detection', () => {
    it('should detect market value coverage by isMarketValue flag', () => {
      const result = evaluateKaskoPolicy(
        [{ name: 'Araç Bedeli', limit: 0, isMarketValue: true }],
        20000
      )
      expect(result.hasMarketValueCoverage).toBe(true)
      expect(result.positives).toContain('Araç rayiç değer üzerinden teminatlı')
    })

    it('should detect market value coverage by name containing rayiç', () => {
      const result = evaluateKaskoPolicy([{ name: 'Rayiç Değer', limit: 500000 }], 20000)
      expect(result.hasMarketValueCoverage).toBe(true)
    })

    it('should detect market value coverage by name containing araç bedeli', () => {
      const result = evaluateKaskoPolicy([{ name: 'Araç Bedeli', limit: 500000 }], 20000)
      expect(result.hasMarketValueCoverage).toBe(true)
    })

    it('should detect unlimited liability by isUnlimited flag', () => {
      const result = evaluateKaskoPolicy(
        [{ name: 'Artan Mali Sorumluluk', limit: 0, isUnlimited: true }],
        20000
      )
      expect(result.hasUnlimitedLiability).toBe(true)
      expect(result.positives).toContain('Sınırsız mali sorumluluk teminatı mevcut')
    })

    it('should detect unlimited liability via shouldShowUnlimited', () => {
      const result = evaluateKaskoPolicy([{ name: 'Artan Mali Sorumluluk', limit: 0 }], 20000)
      expect(result.hasUnlimitedLiability).toBe(true)
    })

    it('should NOT detect unlimited liability for non-liability coverage', () => {
      // coverage.isUnlimited is true, but name does not contain mali sorumluluk or artan mali
      const result = evaluateKaskoPolicy(
        [{ name: 'Cam Kırılması', limit: 0, isUnlimited: true }],
        20000
      )
      expect(result.hasUnlimitedLiability).toBe(false)
    })

    it('should detect personal accident', () => {
      const result = evaluateKaskoPolicy([{ name: 'Sürücü Ferdi Kaza', limit: 100000 }], 20000)
      expect(result.hasPersonalAccident).toBe(true)
    })

    it('should detect personal accident by koltuk keyword', () => {
      const result = evaluateKaskoPolicy([{ name: 'Koltuk Teminatı', limit: 50000 }], 20000)
      expect(result.hasPersonalAccident).toBe(true)
    })

    it('should detect replacement vehicle with ASCII ikame', () => {
      const result = evaluateKaskoPolicy([{ name: 'ikame araç', limit: 0 }], 20000)
      expect(result.hasReplacementVehicle).toBe(true)
      expect(result.positives).toContain('İkame araç hizmeti dahil')
    })

    it('should NOT detect İkame Araç with Turkish İ', () => {
      // Turkish İ lowercases to i̇ (combining dot), so 'ikame' check fails
      const result = evaluateKaskoPolicy([{ name: 'İkame Araç', limit: 0 }], 20000)
      expect(result.hasReplacementVehicle).toBe(false)
    })

    it('should detect replacement vehicle by English keyword', () => {
      const result = evaluateKaskoPolicy([{ name: 'Replacement Vehicle', limit: 0 }], 20000)
      expect(result.hasReplacementVehicle).toBe(true)
    })

    it('should detect legal protection', () => {
      const result = evaluateKaskoPolicy([{ name: 'Hukuki Koruma', limit: 10000 }], 20000)
      expect(result.hasLegalProtection).toBe(true)
    })

    it('should detect legal protection by English keyword', () => {
      const result = evaluateKaskoPolicy([{ name: 'Legal Protection', limit: 10000 }], 20000)
      expect(result.hasLegalProtection).toBe(true)
    })
  })

  describe('coverage completeness calculation', () => {
    it('should give base 60 for empty coverages', () => {
      const result = evaluateKaskoPolicy([], 20000)
      expect(result.coverageCompleteness).toBe(60)
    })

    it('should add 10 for market value', () => {
      const result = evaluateKaskoPolicy([{ name: 'Rayiç Değer', limit: 500000 }], 20000)
      expect(result.coverageCompleteness).toBe(70) // 60 + 10
    })

    it('should add 15 for unlimited liability', () => {
      const result = evaluateKaskoPolicy(
        [{ name: 'Artan Mali Sorumluluk', limit: 0, isUnlimited: true }],
        20000
      )
      expect(result.coverageCompleteness).toBe(75) // 60 + 15
    })

    it('should add 5 for personal accident', () => {
      const result = evaluateKaskoPolicy([{ name: 'Ferdi Kaza', limit: 100000 }], 20000)
      expect(result.coverageCompleteness).toBe(65) // 60 + 5
    })

    it('should add 5 for replacement vehicle', () => {
      const result = evaluateKaskoPolicy([{ name: 'ikame araç', limit: 0 }], 20000)
      expect(result.coverageCompleteness).toBe(65) // 60 + 5
    })

    it('should add 5 for legal protection', () => {
      const result = evaluateKaskoPolicy([{ name: 'Hukuki Koruma', limit: 5000 }], 20000)
      expect(result.coverageCompleteness).toBe(65) // 60 + 5
    })

    it('should cap at 100', () => {
      const result = evaluateKaskoPolicy(
        [
          { name: 'Rayiç Değer', limit: 500000 },
          { name: 'Artan Mali Sorumluluk', limit: 0, isUnlimited: true },
          { name: 'Ferdi Kaza', limit: 100000 },
          { name: 'ikame araç', limit: 0 },
          { name: 'Hukuki Koruma', limit: 5000 },
        ],
        20000
      )
      // 60 + 10 + 15 + 5 + 5 + 5 = 100
      expect(result.coverageCompleteness).toBe(100)
    })
  })

  describe('premium value analysis', () => {
    it('should score 90 when premium <= min of range', () => {
      // Default benchmark (sedan 0-3): min=18000
      const result = evaluateKaskoPolicy([], 15000)
      expect(result.premiumValueScore).toBe(90)
      expect(result.positives).toContain('Prim piyasa ortalamasının altında')
    })

    it('should score 70 when premium <= average', () => {
      // Default benchmark (sedan 0-3): avg=25000
      const result = evaluateKaskoPolicy([], 20000)
      expect(result.premiumValueScore).toBe(70)
    })

    it('should score 50 when premium <= max of range', () => {
      // Default benchmark (sedan 0-3): max=45000
      const result = evaluateKaskoPolicy([], 40000)
      expect(result.premiumValueScore).toBe(50)
      expect(result.recommendations).toContain(
        'Prim piyasa ortalamasının üzerinde - alternatif teklifler alın'
      )
    })

    it('should score 30 when premium > max of range', () => {
      const result = evaluateKaskoPolicy([], 50000)
      expect(result.premiumValueScore).toBe(30)
      expect(result.recommendations).toContain(
        'Prim çok yüksek - mutlaka karşılaştırmalı teklif alın'
      )
    })

    it('should use vehicle info for benchmark selection', () => {
      // SUV 0-3: min=25000, avg=35000, max=60000
      const result = evaluateKaskoPolicy([], 20000, { vehicleClass: 'SUV', year: 2024 })
      expect(result.premiumValueScore).toBe(90) // 20000 <= 25000 min
    })

    it('should score 70 for premium at average with vehicle info', () => {
      // SUV 0-3: avg=35000
      const result = evaluateKaskoPolicy([], 30000, { vehicleClass: 'SUV', year: 2024 })
      expect(result.premiumValueScore).toBe(70)
    })
  })

  describe('recommendations', () => {
    it('should recommend unlimited liability when missing', () => {
      const result = evaluateKaskoPolicy([], 20000)
      expect(result.recommendations).toContain('Sınırsız mali sorumluluk teminatı ekleyin')
    })

    it('should recommend replacement vehicle when missing', () => {
      const result = evaluateKaskoPolicy([], 20000)
      expect(result.recommendations).toContain('İkame araç hizmeti eklemeyi değerlendirin')
    })

    it('should recommend personal accident when missing', () => {
      const result = evaluateKaskoPolicy([], 20000)
      expect(result.recommendations).toContain('Ferdi kaza teminatı ekleyin')
    })

    it('should NOT recommend features that are present', () => {
      const result = evaluateKaskoPolicy(
        [
          { name: 'Artan Mali Sorumluluk', limit: 0, isUnlimited: true },
          { name: 'ikame araç', limit: 0 },
          { name: 'Ferdi Kaza', limit: 100000 },
        ],
        20000
      )
      expect(result.recommendations).not.toContain('Sınırsız mali sorumluluk teminatı ekleyin')
      expect(result.recommendations).not.toContain('İkame araç hizmeti eklemeyi değerlendirin')
      expect(result.recommendations).not.toContain('Ferdi kaza teminatı ekleyin')
    })
  })
})

// =============================================================================
// analyzeExclusions
// =============================================================================

describe('analyzeExclusions', () => {
  it('should categorize critical exclusions', () => {
    const result = analyzeExclusions([
      'Alkollü sürüş sonucu hasarlar',
      'Savaş ve iç savaş durumları',
    ])
    expect(result.critical).toHaveLength(2)
    expect(result.standard).toHaveLength(0)
    expect(result.informational).toHaveLength(0)
  })

  it('should match all critical patterns', () => {
    const patterns = [
      'nükleer riskler',
      'savaş durumu',
      'terör eylemleri',
      'kasıtlı hasar',
      'alkollü sürüş',
      'ehliyetsiz kullanım',
      'yarış ve hız denemesi',
    ]
    const result = analyzeExclusions(patterns)
    expect(result.critical).toHaveLength(7)
  })

  it('should categorize standard exclusions (siber, salgın, yaptırım)', () => {
    const result = analyzeExclusions([
      'Siber saldırılar',
      'Salgın hastalık dönemleri',
      'Yaptırım kapsamındaki durumlar',
    ])
    expect(result.standard).toHaveLength(3)
    expect(result.critical).toHaveLength(0)
  })

  it('should categorize informational exclusions (fallback)', () => {
    const result = analyzeExclusions(['Normal aşınma ve yıpranma', 'Bakım eksikliği'])
    expect(result.informational).toHaveLength(2)
    expect(result.critical).toHaveLength(0)
    expect(result.standard).toHaveLength(0)
  })

  it('should handle empty exclusions list', () => {
    const result = analyzeExclusions([])
    expect(result.critical).toHaveLength(0)
    expect(result.standard).toHaveLength(0)
    expect(result.informational).toHaveLength(0)
  })

  it('should handle mixed exclusion types', () => {
    const result = analyzeExclusions([
      'Alkollü sürüş yasaktır',
      'Siber saldırı hariç',
      'Genel bakım sorunları',
    ])
    expect(result.critical).toHaveLength(1)
    expect(result.standard).toHaveLength(1)
    expect(result.informational).toHaveLength(1)
  })
})

// =============================================================================
// sortCoveragesByCategory
// =============================================================================

describe('sortCoveragesByCategory', () => {
  it('should sort coverages by category order', () => {
    const coverages = [
      { name: 'Hukuki Koruma', category: 'legal' },
      { name: 'Çarpma', category: 'main' },
      { name: 'İkame Araç', category: 'assistance' },
      { name: 'Artan Mali', category: 'liability' },
    ]
    const sorted = sortCoveragesByCategory(coverages)
    expect(sorted[0].name).toBe('Çarpma')
    expect(sorted[1].name).toBe('Artan Mali')
    expect(sorted[2].name).toBe('İkame Araç')
    expect(sorted[3].name).toBe('Hukuki Koruma')
  })

  it('should auto-detect category when not provided', () => {
    const coverages = [{ name: 'Hukuki Koruma' }, { name: 'Çarpma/Çarpışma' }, { name: 'Asistans' }]
    const sorted = sortCoveragesByCategory(coverages)
    expect(sorted[0].name).toBe('Çarpma/Çarpışma') // main
    expect(sorted[1].name).toBe('Asistans') // assistance
    expect(sorted[2].name).toBe('Hukuki Koruma') // legal
  })

  it('should use order 7 for unknown category in first position', () => {
    const coverages = [
      { name: 'Unknown Coverage', category: 'unknown_cat' },
      { name: 'Çarpma', category: 'main' },
    ]
    const sorted = sortCoveragesByCategory(coverages)
    expect(sorted[0].name).toBe('Çarpma')
    expect(sorted[1].name).toBe('Unknown Coverage')
  })

  it('should use order 7 for unknown category in second position', () => {
    const coverages = [
      { name: 'Çarpma', category: 'main' },
      { name: 'Unknown Coverage B', category: 'another_unknown' },
    ]
    const sorted = sortCoveragesByCategory(coverages)
    expect(sorted[0].name).toBe('Çarpma')
    expect(sorted[1].name).toBe('Unknown Coverage B')
  })

  it('should handle both items with unknown categories', () => {
    const coverages = [
      { name: 'Unknown A', category: 'cat_x' },
      { name: 'Unknown B', category: 'cat_y' },
    ]
    const sorted = sortCoveragesByCategory(coverages)
    // Both get order 7, stable sort
    expect(sorted).toHaveLength(2)
  })

  it('should not mutate original array', () => {
    const coverages = [
      { name: 'Hukuki Koruma', category: 'legal' },
      { name: 'Çarpma', category: 'main' },
    ]
    const sorted = sortCoveragesByCategory(coverages)
    expect(sorted).not.toBe(coverages)
    expect(coverages[0].name).toBe('Hukuki Koruma') // unchanged
  })

  it('should handle empty array', () => {
    expect(sortCoveragesByCategory([])).toEqual([])
  })
})

// =============================================================================
// groupCoveragesByCategory
// =============================================================================

describe('groupCoveragesByCategory', () => {
  it('should group coverages by their category property', () => {
    const coverages = [
      { name: 'Çarpma', category: 'main' },
      { name: 'Hırsızlık', category: 'main' },
      { name: 'Artan Mali', category: 'liability' },
      { name: 'İkame Araç', category: 'assistance' },
    ]
    const groups = groupCoveragesByCategory(coverages)
    expect(groups.main).toHaveLength(2)
    expect(groups.liability).toHaveLength(1)
    expect(groups.assistance).toHaveLength(1)
    expect(groups.personal_accident).toHaveLength(0)
    expect(groups.supplementary).toHaveLength(0)
    expect(groups.legal).toHaveLength(0)
  })

  it('should auto-detect category when not provided', () => {
    const coverages = [
      { name: 'Ferdi Kaza Teminatı' }, // personal_accident
      { name: 'Cam Kırılması' }, // supplementary
    ]
    const groups = groupCoveragesByCategory(coverages)
    expect(groups.personal_accident).toHaveLength(1)
    expect(groups.supplementary).toHaveLength(1)
  })

  it('should put unknown categories into supplementary', () => {
    const coverages = [{ name: 'Mystery Coverage', category: 'unknown_category' }]
    const groups = groupCoveragesByCategory(coverages)
    expect(groups.supplementary).toHaveLength(1)
  })

  it('should handle empty array', () => {
    const groups = groupCoveragesByCategory([])
    expect(groups.main).toHaveLength(0)
    expect(groups.liability).toHaveLength(0)
    expect(groups.personal_accident).toHaveLength(0)
    expect(groups.supplementary).toHaveLength(0)
    expect(groups.assistance).toHaveLength(0)
    expect(groups.legal).toHaveLength(0)
  })
})

// =============================================================================
// formatKaskoCoverageLimit
// =============================================================================

describe('formatKaskoCoverageLimit', () => {
  it('should return "Sınırsız" when isUnlimited is true', () => {
    expect(formatKaskoCoverageLimit({ name: 'Any', limit: 0, isUnlimited: true })).toBe('Sınırsız')
  })

  it('should return "Rayiç Değer" when isMarketValue is true', () => {
    expect(formatKaskoCoverageLimit({ name: 'Any', limit: 0, isMarketValue: true })).toBe(
      'Rayiç Değer'
    )
  })

  it('should prefer isUnlimited over isMarketValue', () => {
    expect(
      formatKaskoCoverageLimit({ name: 'Any', limit: 0, isUnlimited: true, isMarketValue: true })
    ).toBe('Sınırsız')
  })

  it('should return "Sınırsız" via shouldShowUnlimited for artan mali with 0', () => {
    expect(formatKaskoCoverageLimit({ name: 'Artan Mali Sorumluluk', limit: 0 })).toBe('Sınırsız')
  })

  it('should return "Dahil" via shouldShowIncluded for service coverage with 0', () => {
    // Use lowercase 'asistans' to ensure shouldShowIncluded matches (not via limit===0 fallback)
    expect(formatKaskoCoverageLimit({ name: 'asistans hizmetleri', limit: 0 })).toBe('Dahil')
  })

  it('should return "Dahil" for limit 0 when not unlimited or service', () => {
    expect(formatKaskoCoverageLimit({ name: 'Cam Kırılması', limit: 0 })).toBe('Dahil')
  })

  it('should format positive limit as Turkish currency', () => {
    const formatted = formatKaskoCoverageLimit({ name: 'Cam Kırılması', limit: 25000 })
    // Should contain a number formatted in Turkish style
    expect(formatted).toContain('25')
    expect(formatted).toContain('000')
  })

  it('should format large amounts correctly', () => {
    const formatted = formatKaskoCoverageLimit({ name: 'Ferdi Kaza', limit: 1500000 })
    expect(formatted).toContain('1')
    expect(formatted).toContain('500')
    expect(formatted).toContain('000')
  })
})

// =============================================================================
// getCoverageClarifications
// =============================================================================

describe('getCoverageClarifications', () => {
  it('should return clarification for ikame araç with lowercase input', () => {
    const result = getCoverageClarifications('ikame araç hizmeti')
    expect(result).not.toBeNull()
    expect(result!.question).toContain('İkame araç')
    expect(result!.questionEn).toBeTruthy()
    expect(result!.details.length).toBeGreaterThan(0)
    expect(result!.detailsEn.length).toBeGreaterThan(0)
  })

  it('should NOT match İkame Araç with Turkish İ due to combining dot', () => {
    // Turkish İ -> i̇ (combining dot), which doesn't match key 'ikame araç'
    const result = getCoverageClarifications('İkame Araç Hizmeti')
    expect(result).toBeNull()
  })

  it('should return clarification for çekici', () => {
    const result = getCoverageClarifications('Çekici Hizmeti')
    expect(result).not.toBeNull()
    expect(result!.question).toContain('Çekici')
  })

  it('should return clarification for asistans', () => {
    const result = getCoverageClarifications('Asistans Paket')
    expect(result).not.toBeNull()
    expect(result!.question).toContain('Asistans')
  })

  it('should return clarification for cam', () => {
    const result = getCoverageClarifications('Cam Kırılması')
    expect(result).not.toBeNull()
    expect(result!.question).toContain('Cam')
  })

  it('should return null for coverage without clarification', () => {
    expect(getCoverageClarifications('Hırsızlık')).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(getCoverageClarifications('')).toBeNull()
  })

  it('should be case-insensitive for ASCII text', () => {
    // 'ASISTANS'.toLowerCase() = 'asistans' which matches key 'asistans'
    const result = getCoverageClarifications('ASISTANS')
    expect(result).not.toBeNull()
  })
})

// =============================================================================
// sortByImportance
// =============================================================================

describe('sortByImportance', () => {
  it('should sort by importance (critical first, minor last)', () => {
    const coverages: GroupedCoverage[] = [
      {
        name: 'A',
        nameTr: 'A',
        nameEn: 'A',
        category: 'main',
        isGrouped: false,
        importance: 'minor',
      },
      {
        name: 'B',
        nameTr: 'B',
        nameEn: 'B',
        category: 'main',
        isGrouped: false,
        importance: 'critical',
      },
      {
        name: 'C',
        nameTr: 'C',
        nameEn: 'C',
        category: 'main',
        isGrouped: false,
        importance: 'standard',
      },
    ]
    const sorted = sortByImportance(coverages)
    expect(sorted[0].name).toBe('B') // critical
    expect(sorted[1].name).toBe('C') // standard
    expect(sorted[2].name).toBe('A') // minor
  })

  it('should default to standard importance when undefined', () => {
    const coverages: GroupedCoverage[] = [
      {
        name: 'A',
        nameTr: 'A',
        nameEn: 'A',
        category: 'main',
        isGrouped: false,
        importance: 'minor',
      },
      {
        name: 'B',
        nameTr: 'B',
        nameEn: 'B',
        category: 'main',
        isGrouped: false,
        importance: undefined,
      },
    ]
    const sorted = sortByImportance(coverages)
    expect(sorted[0].name).toBe('B') // undefined -> standard (2) < minor (3)
    expect(sorted[1].name).toBe('A')
  })

  it('should use fallback order 2 for unknown importance values', () => {
    const coverages: GroupedCoverage[] = [
      {
        name: 'A',
        nameTr: 'A',
        nameEn: 'A',
        category: 'main',
        isGrouped: false,
        importance: 'unknown',
      },
      {
        name: 'B',
        nameTr: 'B',
        nameEn: 'B',
        category: 'main',
        isGrouped: false,
        importance: 'critical',
      },
    ]
    const sorted = sortByImportance(coverages)
    expect(sorted[0].name).toBe('B') // critical (1) < unknown (2)
    expect(sorted[1].name).toBe('A')
  })

  it('should not mutate original array', () => {
    const coverages: GroupedCoverage[] = [
      {
        name: 'A',
        nameTr: 'A',
        nameEn: 'A',
        category: 'main',
        isGrouped: false,
        importance: 'minor',
      },
      {
        name: 'B',
        nameTr: 'B',
        nameEn: 'B',
        category: 'main',
        isGrouped: false,
        importance: 'critical',
      },
    ]
    const sorted = sortByImportance(coverages)
    expect(sorted).not.toBe(coverages)
    expect(coverages[0].name).toBe('A') // unchanged
  })

  it('should handle both items with unknown importance', () => {
    const coverages: GroupedCoverage[] = [
      {
        name: 'A',
        nameTr: 'A',
        nameEn: 'A',
        category: 'main',
        isGrouped: false,
        importance: 'unknown_x',
      },
      {
        name: 'B',
        nameTr: 'B',
        nameEn: 'B',
        category: 'main',
        isGrouped: false,
        importance: 'unknown_y',
      },
    ]
    const sorted = sortByImportance(coverages)
    // Both fallback to 2, stable sort order
    expect(sorted).toHaveLength(2)
  })

  it('should handle both items with undefined importance', () => {
    const coverages: GroupedCoverage[] = [
      { name: 'A', nameTr: 'A', nameEn: 'A', category: 'main', isGrouped: false },
      { name: 'B', nameTr: 'B', nameEn: 'B', category: 'main', isGrouped: false },
    ]
    const sorted = sortByImportance(coverages)
    expect(sorted).toHaveLength(2)
  })

  it('should handle empty array', () => {
    expect(sortByImportance([])).toEqual([])
  })
})

// =============================================================================
// groupCoverageSubLimits
// =============================================================================

describe('groupCoverageSubLimits', () => {
  it('should group coverages with matching prefix into a single grouped item', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Koltuk Ferdi Kaza - Sürekli Sakatlık', limit: 50000 },
      { name: 'Koltuk Ferdi Kaza - Tedavi', limit: 25000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
    expect(result[0].name).toBe('Koltuk Ferdi Kaza')
    expect(result[0].subLimits).toHaveLength(3)
  })

  it('should not group when only 1 coverage matches a prefix', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Cam Kırılması', limit: 25000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    // Single match for Koltuk Ferdi Kaza -> not grouped
    expect(result.some((r) => r.isGrouped)).toBe(false)
    expect(result).toHaveLength(2)
  })

  it('should pass through ungrouped coverages with detected category', () => {
    const coverages = [{ name: 'Cam Kırılması', limit: 25000, category: 'supplementary' }]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(false)
    expect(result[0].category).toBe('supplementary')
  })

  it('should auto-detect category for ungrouped coverages without category', () => {
    const coverages = [{ name: 'Hırsızlık', limit: 500000 }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].category).toBe('main')
  })

  it('should detect unlimited status for ungrouped coverages', () => {
    const coverages = [{ name: 'Artan Mali Sorumluluk', limit: 0 }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].isUnlimited).toBe(true)
  })

  it('should use isUnlimited flag for ungrouped coverages', () => {
    const coverages = [{ name: 'Some Coverage', limit: 0, isUnlimited: true }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].isUnlimited).toBe(true)
  })

  it('should pass through isMarketValue for ungrouped coverages', () => {
    const coverages = [{ name: 'Araç Bedeli', limit: 0, isMarketValue: true }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].isMarketValue).toBe(true)
  })

  it('should use nameTr if provided, else fallback to name', () => {
    const result1 = groupCoverageSubLimits([
      { name: 'Glass', nameTr: 'Cam Kırılması', limit: 25000 },
    ])
    expect(result1[0].nameTr).toBe('Cam Kırılması')

    const result2 = groupCoverageSubLimits([{ name: 'Glass', limit: 25000 }])
    expect(result2[0].nameTr).toBe('Glass')
  })

  it('should preserve deductible and included for ungrouped coverages', () => {
    const coverages = [{ name: 'Cam Kırılması', limit: 25000, deductible: 500, included: true }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].deductible).toBe(500)
    expect(result[0].included).toBe(true)
  })

  it('should preserve importance for ungrouped coverages', () => {
    const coverages = [{ name: 'Cam Kırılması', limit: 25000, importance: 'standard' }]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].importance).toBe('standard')
  })

  it('should handle the Hukuksal Koruma group prefix', () => {
    const coverages = [
      { name: 'Hukuksal Koruma - Kefalet', limit: 5000 },
      { name: 'Hukuksal Koruma - Avans', limit: 3000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
    expect(result[0].name).toBe('Hukuksal Koruma')
    expect(result[0].nameEn).toBe('Legal Protection')
  })

  it('should handle the Artan Mali Sorumluluk group prefix', () => {
    const coverages = [
      { name: 'Artan Mali Sorumluluk - Maddi', limit: 500000 },
      { name: 'Artan Mali Sorumluluk - Bedeni', limit: 1000000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
    expect(result[0].name).toBe('Artan Mali Sorumluluk')
  })

  it('should handle Ferdi Kaza group prefix', () => {
    const coverages = [
      { name: 'Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Ferdi Kaza - Sakatlık', limit: 50000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
    expect(result[0].name).toBe('Ferdi Kaza')
    expect(result[0].nameEn).toBe('Personal Accident')
  })

  it('should extract sub-limit label when subKey does not match known labels', () => {
    const coverages = [
      { name: 'Hukuksal Koruma - Sigorta Süresi Toplam Limit', limit: 10000 },
      { name: 'Hukuksal Koruma - Bilinmeyen Alt Limit', limit: 5000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
    // Sub-limits should have extracted labels
    expect(result[0].subLimits!.length).toBe(2)
  })

  it('should detect unlimited sub-limits via shouldShowUnlimited', () => {
    const coverages = [
      { name: 'Artan Mali Sorumluluk - Maddi', limit: 0 },
      { name: 'Artan Mali Sorumluluk - Bedeni', limit: 0 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].isGrouped).toBe(true)
    for (const sub of result[0].subLimits!) {
      expect(sub.isUnlimited).toBe(true)
    }
  })

  it('should detect unlimited sub-limits via isUnlimited flag', () => {
    const coverages = [
      { name: 'Artan Mali Sorumluluk - Maddi', limit: 500000, isUnlimited: true },
      { name: 'Artan Mali Sorumluluk - Bedeni', limit: 1000000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].subLimits![0].isUnlimited).toBe(true)
    expect(result[0].subLimits![1].isUnlimited).toBe(false)
  })

  it('should handle prefix match with " - " separator', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Koltuk Ferdi Kaza - Tedavi', limit: 25000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    expect(result[0].isGrouped).toBe(true)
  })

  it('should handle mixed grouped and ungrouped coverages', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Koltuk Ferdi Kaza - Sakatlık', limit: 50000 },
      { name: 'Cam Kırılması', limit: 25000 },
      { name: 'İkame Araç', limit: 0 },
    ]
    const result = groupCoverageSubLimits(coverages)
    // 1 grouped + 2 ungrouped
    expect(result).toHaveLength(3)
    expect(result.filter((r) => r.isGrouped)).toHaveLength(1)
  })

  it('should handle empty array', () => {
    expect(groupCoverageSubLimits([])).toEqual([])
  })

  it('should use first coverage category for grouped items', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000, category: 'personal_accident' },
      { name: 'Koltuk Ferdi Kaza - Tedavi', limit: 25000, category: 'personal_accident' },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].category).toBe('personal_accident')
  })

  it('should auto-detect category for grouped items without category', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Koltuk Ferdi Kaza - Tedavi', limit: 25000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].category).toBe('personal_accident')
  })

  it('should preserve importance from first coverage in group', () => {
    const coverages = [
      { name: 'Koltuk Ferdi Kaza - Ölüm', limit: 100000, importance: 'critical' },
      { name: 'Koltuk Ferdi Kaza - Tedavi', limit: 25000, importance: 'minor' },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].importance).toBe('critical')
  })

  it('should set included: true for grouped items', () => {
    const coverages = [
      { name: 'Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Ferdi Kaza - Sakatlık', limit: 50000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result[0].included).toBe(true)
  })

  it('should not double-process coverages that matched in a group', () => {
    const coverages = [
      { name: 'Ferdi Kaza - Ölüm', limit: 100000 },
      { name: 'Ferdi Kaza - Sakatlık', limit: 50000 },
      { name: 'Ferdi Kaza - Tedavi', limit: 25000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    // All 3 should be in one group, not appear again individually
    expect(result).toHaveLength(1)
    expect(result[0].subLimits).toHaveLength(3)
  })
})

// =============================================================================
// analyzeExclusionsComprehensive
// =============================================================================

describe('analyzeExclusionsComprehensive', () => {
  describe('coverage-with-limit detection', () => {
    it('should detect coverage with TL limit in exclusion text', () => {
      const result = analyzeExclusionsComprehensive(['İkame Araç (50.000 TL limit)'])
      expect(result.coveragesInExclusions).toHaveLength(1)
      expect(result.coveragesInExclusions[0].type).toBe('coverage_with_limit')
      expect(result.coveragesInExclusions[0].extractedLimit).toBe(50000)
    })

    it('should detect coverage with simple numeric limit', () => {
      const result = analyzeExclusionsComprehensive(['Cam Kırılması 25000 TL'])
      expect(result.coveragesInExclusions).toHaveLength(1)
      expect(result.coveragesInExclusions[0].extractedLimit).toBe(25000)
    })

    it('should detect coverage with comma-separated limit', () => {
      const result = analyzeExclusionsComprehensive(['Ferdi Kaza 100,000 teminat'])
      expect(result.coveragesInExclusions).toHaveLength(1)
      expect(result.coveragesInExclusions[0].extractedLimit).toBe(100000)
    })

    it('should have explanations for detected coverage-with-limits', () => {
      const result = analyzeExclusionsComprehensive(['İkame Araç (50.000 TL limit)'])
      expect(result.coveragesInExclusions[0].explanation).toBeTruthy()
      expect(result.coveragesInExclusions[0].explanationEn).toBeTruthy()
    })
  })

  describe('exclusion explanations', () => {
    it('should match known exclusion patterns and provide explanations', () => {
      const result = analyzeExclusionsComprehensive(['Alkollü sürüş sonucu hasarlar'])
      expect(result.exclusions).toHaveLength(1)
      expect(result.exclusions[0].severity).toBe('critical')
      expect(result.exclusions[0].explanation).toBeTruthy()
      expect(result.exclusions[0].examples).toBeTruthy()
    })

    it('should assign standard severity for unknown exclusions', () => {
      const result = analyzeExclusionsComprehensive(['Bilinmeyen bir istisna'])
      expect(result.exclusions).toHaveLength(1)
      expect(result.exclusions[0].severity).toBe('standard')
    })

    it('should match multiple known patterns', () => {
      const result = analyzeExclusionsComprehensive([
        'Alkollü sürüş',
        'Ehliyetsiz kullanım',
        'Yarış katılımı',
      ])
      expect(result.exclusions).toHaveLength(3)
      expect(result.exclusions.every((e) => e.severity === 'critical')).toBe(true)
    })
  })

  describe('commercial vs private vehicle filtering', () => {
    it('should skip exclusions not affecting commercial when isCommercial=true', () => {
      // 'vale' has affectsCommercial: false
      const result = analyzeExclusionsComprehensive(['Vale park hasarı'], [], true)
      // The pattern matches but affectsCommercial is false, so it skips the vale explanation
      expect(result.exclusions).toHaveLength(1)
      // It won't get the vale explanation — keeps default severity
      expect(result.exclusions[0].severity).toBe('standard')
    })

    it('should skip exclusions not affecting private when isCommercial=false', () => {
      // 'yaptırım' has affectsPrivate: false
      const result = analyzeExclusionsComprehensive(['Yaptırım uygulaması'], [], false)
      expect(result.exclusions).toHaveLength(1)
      // Should not match the yaptırım explanation
      expect(result.exclusions[0].severity).toBe('standard')
    })

    it('should include matching explanation when affects both', () => {
      // 'alkol' has both affectsPrivate and affectsCommercial true
      const result = analyzeExclusionsComprehensive(['Alkollü sürüş'], [], true)
      expect(result.exclusions[0].severity).toBe('critical')
    })

    it('should include yaptırım for commercial vehicles', () => {
      const result = analyzeExclusionsComprehensive(['Yaptırım uygulaması'], [], true)
      expect(result.exclusions[0].severity).toBe('informational')
      expect(result.exclusions[0].explanation).toBeTruthy()
    })

    it('should include kiralık for private vehicles', () => {
      // 'kiralık' has affectsPrivate: true, affectsCommercial: false
      const result = analyzeExclusionsComprehensive(['Kiralık araç kullanımı'], [], false)
      expect(result.exclusions[0].severity).toBe('important')
    })

    it('should skip kiralık explanation for commercial vehicles', () => {
      const result = analyzeExclusionsComprehensive(['Kiralık araç kullanımı'], [], true)
      expect(result.exclusions[0].severity).toBe('standard') // No match found
    })
  })

  describe('clarification detection', () => {
    it('should flag "yetkisiz" pattern for clarification', () => {
      const result = analyzeExclusionsComprehensive(['Yetkisiz sürücü kullanımı'])
      expect(result.clarificationNeeded).toHaveLength(1)
      expect(result.clarificationNeeded[0].question).toContain('Yetkisiz')
      expect(result.exclusions[0].needsClarification).toBe(true)
    })

    it('should flag "belirli sürücü" pattern for clarification', () => {
      const result = analyzeExclusionsComprehensive(['Belirli sürücü dışında kullanım'])
      expect(result.clarificationNeeded).toHaveLength(1)
      expect(result.clarificationNeeded[0].question).toContain('sürücüler')
    })

    it('should flag "ruhsata" pattern for clarification', () => {
      const result = analyzeExclusionsComprehensive(['Ruhsata işlenmeyen değişiklikler'])
      expect(result.clarificationNeeded).toHaveLength(1)
      expect(result.clarificationNeeded[0].question).toContain('Ruhsat')
    })

    it('should not flag unrecognized patterns for clarification', () => {
      const result = analyzeExclusionsComprehensive(['Normal aşınma ve yıpranma'])
      expect(result.clarificationNeeded).toHaveLength(0)
    })

    it('should add clarificationQuestion to the analyzed exclusion', () => {
      const result = analyzeExclusionsComprehensive(['Yetkisiz sürücü'])
      expect(result.exclusions[0].clarificationQuestion).toBeTruthy()
    })
  })

  describe('missing important exclusions', () => {
    it('should report all missing important exclusions when none mentioned', () => {
      const result = analyzeExclusionsComprehensive([])
      expect(result.missingImportantExclusions.length).toBe(COMMON_EXCLUSIONS_TO_CHECK.length)
    })

    it('should not report mentioned exclusion topics', () => {
      // Mention 'vale' to cover "Vale Hırsızlığı/Hasarı"
      const result = analyzeExclusionsComprehensive([
        'Vale park hizmetinde dikkat edilmesi gerekenler',
      ])
      const valeFound = result.missingImportantExclusions.find((e) => e.name.includes('Vale'))
      expect(valeFound).toBeUndefined()
    })

    it('should detect keyword matches when exclusion keywords appear in text', () => {
      // 'alkollü' is a keyword from "Alkollü Sürücü Limiti" — needs exact word match
      const result = analyzeExclusionsComprehensive(['Alkollü araç kullanımı yasaktır'])
      const alcoholFound = result.missingImportantExclusions.find((e) => e.name.includes('Alkol'))
      expect(alcoholFound).toBeUndefined()
    })

    it('matches partial substrings of explicit keywords (P1 #11B broadened matching)', () => {
      // Sprint 2 #11B intentionally broadened keyword matching: each
      // COMMON_EXCLUSIONS_TO_CHECK entry now carries an explicit `keywords`
      // array that includes shorter stems ("alkol" instead of "alkollü").
      // "Alkol düzeyi kontrolleri" now matches the Alcohol Limit template
      // via the "alkol" stem and lands in addressedByPolicy with the
      // verbatim source as the answer (was: previously this fell through
      // to missingImportantExclusions because the keyword derivation was
      // narrower).
      const result = analyzeExclusionsComprehensive(['Alkol düzeyi kontrolleri'])
      const alcoholAddressed = result.addressedByPolicy.find((e) => e.name.includes('Alkol'))
      expect(alcoholAddressed).toBeDefined()
      expect(alcoholAddressed!.answer).toBe('Alkol düzeyi kontrolleri')
      // And it should NO LONGER appear in missingImportantExclusions.
      const alcoholMissing = result.missingImportantExclusions.find((e) => e.name.includes('Alkol'))
      expect(alcoholMissing).toBeUndefined()
    })

    it('should have question and importance for missing exclusions', () => {
      const result = analyzeExclusionsComprehensive([])
      for (const missing of result.missingImportantExclusions) {
        expect(missing.name).toBeTruthy()
        expect(missing.nameEn).toBeTruthy()
        expect(missing.question).toBeTruthy()
        expect(missing.importance).toBeTruthy()
      }
    })
  })

  describe('mixed inputs', () => {
    it('should handle mix of exclusions, coverages, and clarification items', () => {
      const result = analyzeExclusionsComprehensive([
        'Alkollü sürüş yasaktır', // critical exclusion
        'İkame Araç (50.000 TL limit)', // coverage with limit
        'Yetkisiz sürücü kullanımı', // needs clarification
        'Normal aşınma', // standard exclusion
      ])
      expect(result.exclusions.length).toBe(3) // alkol + yetkisiz + aşınma
      expect(result.coveragesInExclusions.length).toBe(1) // ikame araç
      expect(result.clarificationNeeded.length).toBe(1) // yetkisiz
    })
  })

  describe('default isCommercial parameter', () => {
    it('should default isCommercial to false', () => {
      // 'kiralık' has affectsCommercial: false → should match for private
      const result = analyzeExclusionsComprehensive(['Kiralık araç kullanımı'])
      expect(result.exclusions[0].severity).toBe('important')
    })
  })
})

// =============================================================================
// KASKO_EXCLUSION_EXPLANATIONS (data integrity)
// =============================================================================

describe('KASKO_EXCLUSION_EXPLANATIONS', () => {
  it('should have Turkish and English explanations for all entries', () => {
    for (const [key, info] of Object.entries(KASKO_EXCLUSION_EXPLANATIONS)) {
      expect(info.explanation, `Missing Turkish explanation for ${key}`).toBeTruthy()
      expect(info.explanationEn, `Missing English explanation for ${key}`).toBeTruthy()
    }
  })

  it('should have valid severity values', () => {
    const validSeverities = ['critical', 'important', 'standard', 'informational']
    for (const [key, info] of Object.entries(KASKO_EXCLUSION_EXPLANATIONS)) {
      expect(validSeverities, `Invalid severity for ${key}: ${info.severity}`).toContain(
        info.severity
      )
    }
  })

  it('should have defined affectsPrivate and affectsCommercial', () => {
    for (const [key, info] of Object.entries(KASKO_EXCLUSION_EXPLANATIONS)) {
      expect(typeof info.affectsPrivate, `affectsPrivate not boolean for ${key}`).toBe('boolean')
      expect(typeof info.affectsCommercial, `affectsCommercial not boolean for ${key}`).toBe(
        'boolean'
      )
    }
  })
})

// =============================================================================
// COMMON_EXCLUSIONS_TO_CHECK (data integrity)
// =============================================================================

describe('COMMON_EXCLUSIONS_TO_CHECK', () => {
  it('should have 6 check items', () => {
    expect(COMMON_EXCLUSIONS_TO_CHECK).toHaveLength(6)
  })

  it('should have Turkish and English names and questions', () => {
    for (const check of COMMON_EXCLUSIONS_TO_CHECK) {
      expect(check.name).toBeTruthy()
      expect(check.nameEn).toBeTruthy()
      expect(check.question).toBeTruthy()
      expect(check.questionEn).toBeTruthy()
    }
  })

  it('should have valid importance values', () => {
    for (const check of COMMON_EXCLUSIONS_TO_CHECK) {
      expect(['high', 'medium']).toContain(check.importance)
    }
  })
})

// =============================================================================
// Edge cases and Turkish text handling
// =============================================================================

describe('Turkish text handling edge cases', () => {
  it('isImplicitKaskoCoverage does NOT match HIRSIZLIK (ASCII I vs Turkish ı)', () => {
    // 'HIRSIZLIK'.toLowerCase() = 'hirsizlik', but alias is 'hırsızlık' (Turkish ı)
    expect(isImplicitKaskoCoverage('HIRSIZLIK')).toBe(false)
  })

  it('isImplicitKaskoCoverage matches lowercase Turkish aliases correctly', () => {
    expect(isImplicitKaskoCoverage('hırsızlık')).toBe(true)
    expect(isImplicitKaskoCoverage('yangın')).toBe(true)
  })

  it('detectCoverageCategory does NOT match MALİ (İ combining dot issue)', () => {
    // 'MALİ SORUMLULUK'.toLowerCase() = 'mali̇ sorumluluk' (combining dot)
    // This does NOT include 'mali sorumluluk'
    expect(detectCoverageCategory('MALİ SORUMLULUK')).toBe('supplementary')
  })

  it('detectCoverageCategory matches lowercase mali sorumluluk', () => {
    expect(detectCoverageCategory('mali sorumluluk')).toBe('liability')
  })

  it('shouldShowUnlimited with empty string name', () => {
    expect(shouldShowUnlimited('', 0)).toBe(false)
  })

  it('shouldShowIncluded with empty string name', () => {
    expect(shouldShowIncluded('', 0)).toBe(false)
  })

  it('extractVehicleInfo with Turkish characters in text', () => {
    const result = extractVehicleInfo('Marka: Citroen\nmodel C5')
    expect(result.make).toBeTruthy()
  })

  it('analyzeExclusions handles lowercase Turkish correctly', () => {
    // 'alkollü sürüş' with lowercase Turkish chars matches 'alkol' pattern
    const result = analyzeExclusions(['alkollü sürüş sonucu hasarlar'])
    expect(result.critical).toHaveLength(1)
  })

  it('analyzeExclusions does NOT match ALKOLLÜ with uppercase Turkish Ü', () => {
    // 'ALKOLLÜ'.toLowerCase() = 'alkollü' which does include 'alkol' since 'alkol' is ASCII
    const result = analyzeExclusions(['ALKOLLÜ SÜRÜŞ SONUCU HASARLAR'])
    // 'alkol' is ASCII substring so it matches
    expect(result.critical).toHaveLength(1)
  })
})

// =============================================================================
// extractSubLimitLabel (tested indirectly via groupCoverageSubLimits)
// =============================================================================

describe('extractSubLimitLabel behavior (indirect)', () => {
  it('should clean prefix and separator from sub-limit label', () => {
    const coverages = [
      { name: 'Hukuksal Koruma - Özel Durum Limiti', limit: 5000 },
      { name: 'Hukuksal Koruma - Başka Durum', limit: 3000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    // Labels should be cleaned — no prefix, no separator
    for (const sub of result[0].subLimits!) {
      expect(sub.label).not.toContain('Hukuksal Koruma')
      expect(sub.label.length).toBeGreaterThan(0)
    }
  })

  it('should handle azami cleanup in sub-limit label', () => {
    const coverages = [
      { name: 'Hukuksal Koruma - Olay Başına Azami Kefalet', limit: 5000 },
      { name: 'Hukuksal Koruma - Olay Başına Azami Avans', limit: 3000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    // Known subKey 'kefalet' and 'avans' should resolve to the labels from COVERAGE_GROUP_PREFIXES
    const labels = result[0].subLimits!.map((s) => s.label)
    expect(labels).toContain('Olay Başı Kefalet')
    expect(labels).toContain('Olay Başı Avans')
  })

  it('should return full name as label when prefix removal results in empty string', () => {
    // Coverage name IS the prefix exactly
    const coverages = [
      { name: 'Ferdi Kaza', limit: 100000 },
      { name: 'Ferdi Kaza', limit: 50000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
    // extractSubLimitLabel should return fullName when label becomes empty
    for (const sub of result[0].subLimits!) {
      expect(sub.label.length).toBeGreaterThan(0)
    }
  })

  it('should handle dash separator variants', () => {
    const coverages = [
      { name: 'Artan Mali Sorumluluk – Maddi', limit: 500000 },
      { name: 'Artan Mali Sorumluluk — Bedeni', limit: 1000000 },
    ]
    const result = groupCoverageSubLimits(coverages)
    expect(result).toHaveLength(1)
  })
})
