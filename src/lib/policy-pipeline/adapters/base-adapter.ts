import { CanonicalCoverageConcept } from '../types/canonical-concepts'

export interface StandardizedCoverage {
  concept: CanonicalCoverageConcept
  originalName: string
  limit?: any
  deductible?: any
  network?: string // Canonical network name, e.g., 'CONTRACTED_GLASS_NETWORK'
}

export interface RequiredCoverageDefinition {
  concept: CanonicalCoverageConcept
  defaultLimit?: number | null
  isUnlimited?: boolean
  isMarketValue?: boolean
  enforce?: boolean // If true, override extracted fields to match these defaults
}

/**
 * Base abstract class for Insurer Adapters.
 * Adapters translate Stage 2 normalized extraction data into standard actuarial formats.
 * They handle insurer-specific implicit rules and network mappings.
 */
export abstract class InsurerAdapter {
  protected providerName: string

  constructor(providerName: string) {
    this.providerName = providerName
  }

  /**
   * Applies the full adaptation process to the extracted data.
   */
  public adapt(extractionData: any): any {
    if (!extractionData) return extractionData

    const adapted = { ...extractionData }

    if (Array.isArray(adapted.coverages)) {
      adapted.coverages = adapted.coverages.map((cov: any) => this.adaptCoverage(cov))
    }

    adapted.coverages = this.resolveImplicitCoverages(adapted.coverages || [])

    return adapted
  }

  /**
   * Adapts a single coverage.
   */
  protected adaptCoverage(coverage: any): StandardizedCoverage {
    return {
      concept: coverage.canonicalName as CanonicalCoverageConcept,
      originalName: coverage.name,
      limit: coverage.parsedLimit || coverage.limit,
      deductible: this.standardizeDeductible(coverage),
      network: this.mapServiceNetwork(coverage.name, coverage.canonicalName),
    }
  }

  /**
   * Translates insurer-specific service network strings into standard concepts.
   */
  public abstract mapServiceNetwork(originalName: string, concept: string): string | undefined

  /**
   * Infers and adds coverages that are implicitly included by this insurer
   * but typically omitted from their policy documents.
   */
  public abstract resolveImplicitCoverages(coverages: any[]): any[]

  /**
   * Extracts or standardizes deductible information for this insurer's formatting.
   */
  public abstract standardizeDeductible(coverage: any): any

  /**
   * Defines mandatory coverages that must be present for a given product type.
   * If the LLM omits these, the pipeline will deterministically inject them.
   * If the LLM extracts them with non-deterministic values, the 'enforce' flag can standardise them.
   */
  public abstract getRequiredCoverages(productType?: string): RequiredCoverageDefinition[]
}
