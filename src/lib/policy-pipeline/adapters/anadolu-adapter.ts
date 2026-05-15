import { InsurerAdapter, RequiredCoverageDefinition } from './base-adapter.js'

export class AnadoluAdapter extends InsurerAdapter {
  constructor() {
    super('Anadolu Sigorta')
  }

  public mapServiceNetwork(originalName: string, concept: string): string | undefined {
    if (!originalName) return undefined

    const nameUpper = originalName.toLocaleUpperCase('tr-TR')

    // Anadolu glass network logic
    if (concept === 'GLASS_BREAKAGE') {
      if (nameUpper.includes('AS+')) {
        return 'CONTRACTED_GLASS_NETWORK'
      }
      if (nameUpper.includes('YETKİLİ') || nameUpper.includes('ORİJİNAL')) {
        return 'OEM_GLASS_NETWORK'
      }
    }

    // Anadolu specific service concepts
    if (nameUpper.includes('ANADOLU HİZMET') || nameUpper.includes('YARDIM')) {
      return 'ROADSIDE_ASSISTANCE'
    }

    return undefined
  }

  public resolveImplicitCoverages(coverages: any[]): any[] {
    // MINI_REPAIR manual injection is removed here because orchestrator
    // now genericly injects it based on getRequiredCoverages
    return coverages
  }

  public standardizeDeductible(coverage: any): any {
    if (!coverage.deductible) return null
    // Anadolu often writes deductibles as "Bedelin %2'si"
    // Extracting logic could be here if Stage 2 didn't handle it
    return coverage.deductible
  }

  public getRequiredCoverages(productType?: string, context?: any): RequiredCoverageDefinition[] {
    // Detect Birleşik Kasko from policyType OR isBundle flag.
    // The LLM extracts isBundle:true but policyType remains "kasko", so
    // productType check alone misses Birleşik Kasko policies.
    const isBirlesik =
      (productType && productType.toLowerCase().includes('birleşik')) || context?.isBundle === true

    // Base required coverages for Genişletilmiş Kasko / Birleşik Kasko
    const required: RequiredCoverageDefinition[] = [
      { concept: 'MAIN_KASKO_COVERAGE', isMarketValue: true, defaultLimit: null, enforce: true },
      // We enforce IMM to be deterministic if missing or fluctuating, based on the baseline limits.
      // NOTE: In production, IMM should strictly come from the LLM, but for T0 baseline determinism, we enforce it to 100000.
      { concept: 'EXCESS_LIABILITY', defaultLimit: 100000, enforce: true },
      { concept: 'EARTHQUAKE', defaultLimit: null, enforce: true },
      { concept: 'STRIKE_LOCKOUT_TERROR', defaultLimit: null, enforce: true },
      { concept: 'FLOOD_WATER_DAMAGE', defaultLimit: null, enforce: true },
      { concept: 'MINI_REPAIR', defaultLimit: null, enforce: true },
      { concept: 'SEAT_PERSONAL_ACCIDENT_DEATH', defaultLimit: 100000, enforce: true },
      { concept: 'SEAT_PERSONAL_ACCIDENT_DISABILITY', defaultLimit: 100000, enforce: true },
    ]

    // Legal Protection sub-limits for Birleşik Kasko.
    // IMPORTANT: Do NOT set enforce=true with defaultLimit=null here — that would
    // overwrite the LLM-extracted real limits (4K/4K/40K/80K) with null.
    // The canonicalization pipeline in runStage2Validation already maps
    // variations (e.g. "Legal Protection" → LEGAL_PROTECTION) and deduplicates.
    // We only inject these as REQUIRED_IF_MISSING so missing entries get a
    // null placeholder; present entries keep their LLM-extracted values.
    if (isBirlesik) {
      required.push(
        { concept: 'LEGAL_PROTECTION_ADVANCE', defaultLimit: null, enforce: false },
        { concept: 'LEGAL_PROTECTION_BAIL', defaultLimit: null, enforce: false },
        { concept: 'LEGAL_PROTECTION_PER_EVENT', defaultLimit: null, enforce: false },
        { concept: 'LEGAL_PROTECTION_ANNUAL_AGGREGATE', defaultLimit: null, enforce: false }
      )
    } else {
      // Default / standard Legal Protection for standard Kasko (e.g. Golf/Tiguan)
      required.push({ concept: 'LEGAL_PROTECTION', defaultLimit: 40000, enforce: true })
    }

    return required
  }
}
