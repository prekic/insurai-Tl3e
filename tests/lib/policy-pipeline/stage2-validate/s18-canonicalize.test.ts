import { describe, it, expect } from 'vitest'
import { canonicalizeCoverage } from '../../../../src/lib/policy-pipeline/stage2-validate/canonicalize-coverage'
import { normalizeCoverageLabel } from '../../../../src/lib/policy-pipeline/stage2-validate/normalize-text'

describe('S18 coverage canonicalization', () => {
  // Turkish names (as in LLM Turkish output)
  const turkishCases: [string, string][] = [
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

  // English names (as LLM may output, e.g. from OpenAI)
  const englishCases: [string, string][] = [
    ['Personal Accident Attached to Motor Vehicle', 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'],
    ['Driver Personal Accident', 'DRIVER_PERSONAL_ACCIDENT'],
    ['Body/Tank', 'TANK_BODY_COVERAGE'],
    ['Tank Body Coverage', 'TANK_BODY_COVERAGE'],
    ['Roadside Repair', 'ROADSIDE_REPAIR'],
    ['Vehicle Information Hotline', 'VEHICLE_INFORMATION_HOTLINE'],
    ['Vehicle Info Hotline', 'VEHICLE_INFORMATION_HOTLINE'],
    ['Tire Change', 'TIRE_CHANGE'],
    ['Tyre Change', 'TIRE_CHANGE'],
    ['Locksmith Service', 'LOCKSMITH_SERVICE'],
    ['Vehicle Retrieval', 'VEHICLE_PICKUP_DELIVERY'],
    ['Vehicle Custody and Safekeeping', 'VEHICLE_SAFEKEEPING'],
    ['Unavailable Spare Parts Supply', 'UNAVAILABLE_SPARE_PARTS'],
    ['Companion Transportation and Accommodation', 'ESCORT_TRANSPORT_ACCOMMODATION'],
    ['Funeral Transport', 'FUNERAL_TRANSPORT'],
    ['Information and Organization Services', 'INFORMATION_ORGANIZATION_SERVICES'],
    ['Accommodation and Travel Due to Accident', 'BREAKDOWN_OR_ACCIDENT_TRAVEL_ACCOMMODATION'],
    ['Travel and Accommodation Due to Accident', 'BREAKDOWN_OR_ACCIDENT_TRAVEL_ACCOMMODATION'],
    ['Underinsurance / Overinsurance Clause', 'EXCESS_INSURANCE'],
    ['Excess Insurance', 'EXCESS_INSURANCE'],
  ]

  for (const [input, expected] of turkishCases) {
    it(`maps TR "${input}" to ${expected}`, () => {
      const norm = normalizeCoverageLabel(input)
      const result = canonicalizeCoverage(norm)
      expect(result).toBe(expected)
    })
  }

  for (const [input, expected] of englishCases) {
    it(`maps EN "${input}" to ${expected}`, () => {
      const norm = normalizeCoverageLabel(input)
      const result = canonicalizeCoverage(norm)
      expect(result).toBe(expected)
    })
  }
})
