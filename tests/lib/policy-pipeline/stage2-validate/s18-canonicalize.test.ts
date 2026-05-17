import { describe, it, expect } from 'vitest'
import { canonicalizeCoverage } from '../../../../src/lib/policy-pipeline/stage2-validate/canonicalize-coverage'
import { normalizeCoverageLabel } from '../../../../src/lib/policy-pipeline/stage2-validate/normalize-text'

describe('S18 coverage canonicalization', () => {
  const cases: [string, string][] = [
    ['Motorlu Araca Bağlı FK', 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'],
    ['Motorlu Araca Bağlı', 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'],
    ['Sürücüye Bağlı FK', 'DRIVER_PERSONAL_ACCIDENT'],
    ['Sürücüye Bağlı', 'DRIVER_PERSONAL_ACCIDENT'],
    ['KASA/TANK', 'TANK_BODY_COVERAGE'],
    ['Yol Kenarında Onarım', 'ROADSIDE_REPAIR'],
    ['Araç Bilgi Hattı', 'VEHICLE_INFORMATION_HOTLINE'],
    ['Lastik Değişimi', 'TIRE_CHANGE'],
    ['Çilingir Hizmeti', 'LOCKSMITH_SERVICE'],
    ['Aracın Teslim Alınması', 'VEHICLE_PICKUP_DELIVERY'],
    ['Aracın Emanet ve Muhafazası', 'VEHICLE_SAFEKEEPING'],
    ['Bulunamayan Yedek Parçaların Temini', 'UNAVAILABLE_SPARE_PARTS'],
    ['Refakatçinin Nakli ve Konaklaması', 'ESCORT_TRANSPORT_ACCOMMODATION'],
    ['Cenaze Nakli', 'FUNERAL_TRANSPORT'],
    ['Bilgi ve Organizasyon Hizmetleri', 'INFORMATION_ORGANIZATION_SERVICES'],
    ['Eksik Aşkın Sigorta', 'EXCESS_INSURANCE'],
    ['Hasar Ek Belgesi İstisnası Klozu', 'UNKNOWN'],
    ['Anlaşmalı Servisler Klozu', 'UNKNOWN'],
  ]

  for (const [input, expected] of cases) {
    it(`maps "${input}" to ${expected}`, () => {
      const norm = normalizeCoverageLabel(input)
      const result = canonicalizeCoverage(norm)
      expect(result).toBe(expected)
    })
  }
})
