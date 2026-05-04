import { InsurerAdapter } from './base-adapter'
import { AnadoluAdapter } from './anadolu-adapter'
import { AllianzAdapter } from './allianz-adapter'

class DefaultAdapter extends InsurerAdapter {
  constructor(providerName: string) {
    super(providerName || 'Unknown')
  }
  public mapServiceNetwork(_originalName: string, _concept: string): string | undefined {
    return undefined
  }
  public resolveImplicitCoverages(coverages: any[]): any[] {
    return coverages
  }
  public getRequiredCoverages(
    _docType?: string,
    _context?: any
  ): import('./base-adapter').RequiredCoverageDefinition[] {
    return []
  }
  public standardizeDeductible(coverage: any): any {
    return coverage.deductible || null
  }
}

export function getAdapterForInsurer(providerName?: string | null): InsurerAdapter {
  if (!providerName) return new DefaultAdapter('Unknown')

  const normalized = providerName.toLowerCase().replace(/[^a-z0-ğüşöçı]/g, '')

  if (normalized.includes('anadolu')) {
    return new AnadoluAdapter()
  }

  if (normalized.includes('allianz')) {
    return new AllianzAdapter()
  }

  return new DefaultAdapter(providerName)
}
