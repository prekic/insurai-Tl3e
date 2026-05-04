import { InsurerAdapter, RequiredCoverageDefinition } from './base-adapter.js'
export class AllianzAdapter extends InsurerAdapter {
  constructor() {
    super('Allianz Sigorta')
  }

  public mapServiceNetwork(originalName: string, concept: string): string | undefined {
    if (!originalName) return undefined

    const nameUpper = originalName.toUpperCase()

    if (concept === 'GLASS_BREAKAGE') {
      if (nameUpper.includes('ANLAŞMALI CAM SERVİSİ')) {
        return 'CONTRACTED_GLASS_NETWORK'
      }
      if (nameUpper.includes('YETKİLİ') || nameUpper.includes('ORİJİNAL')) {
        return 'OEM_GLASS_NETWORK'
      }
    }

    return undefined
  }

  public resolveImplicitCoverages(coverages: any[]): any[] {
    return coverages
  }

  public standardizeDeductible(coverage: any): any {
    if (!coverage.deductible) return null
    return coverage.deductible
  }

  public getRequiredCoverages(_productType?: string): RequiredCoverageDefinition[] {
    return [
      { concept: 'MAIN_KASKO_COVERAGE', isMarketValue: true, defaultLimit: null, enforce: true },
      { concept: 'VOLUNTARY_THIRD_PARTY_LIABILITY', defaultLimit: 400000, enforce: true }, // IMM
      { concept: 'EARTHQUAKE', isMarketValue: false, defaultLimit: null, enforce: true },
      { concept: 'STRIKE_LOCKOUT_TERROR', isMarketValue: false, defaultLimit: null, enforce: true },
      { concept: 'FLOOD_WATER_DAMAGE', isMarketValue: false, defaultLimit: null, enforce: true },
      { concept: 'MINI_REPAIR', defaultLimit: null, enforce: true },
      { concept: 'SEAT_PERSONAL_ACCIDENT_DEATH', defaultLimit: 5000, enforce: true },
      { concept: 'SEAT_PERSONAL_ACCIDENT_DISABILITY', defaultLimit: 5000, enforce: true },
      { concept: 'LEGAL_PROTECTION', defaultLimit: 5000, enforce: true },
    ]
  }
}
