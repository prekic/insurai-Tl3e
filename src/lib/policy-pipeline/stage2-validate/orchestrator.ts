import { canonicalizeCoverage } from './canonicalize-coverage.js'
import { deriveEntityType } from './derive-entity-type.js'
import { normalizeCoverageLabel } from './normalize-text.js'
import { parseCoverageLimit } from './parse-coverage-limit.js'
import { getAdapterForInsurer } from '../adapters/adapter-factory.js'
import { getConceptLabels } from '../types/canonical-concepts.js'

/**
 * Runs the Stage 2 validation process on raw extraction data.
 * Applies canonicalization, limit parsing, and entity type derivation safely.
 */
export function runStage2Validation(data: any): any {
  if (!data || typeof data !== 'object') return data

  const result = { ...data }

  // 1. Derive Entity Type
  if (!result.entityType && (result.identityNumber || result.taxNumber)) {
    result.entityType = deriveEntityType(result.identityNumber || result.taxNumber)
  } else if (!result.entityType && result.insured?.identityNumber) {
    result.entityType = deriveEntityType(result.insured.identityNumber)
  }

  // 2. Canonicalize Coverages
  if (Array.isArray(result.coverages)) {
    const uniqueCoverages = new Map<string, any>()

    result.coverages.forEach((cov: any) => {
      if (!cov) return

      const canonicalized = { ...cov }

      // Normalize and Canonicalize Label
      if (cov.name) {
        canonicalized.normalizedName = normalizeCoverageLabel(cov.name)
        try {
          canonicalized.canonicalName = canonicalizeCoverage(canonicalized.normalizedName)
          if (canonicalized.canonicalName !== 'UNKNOWN') {
            const labels = getConceptLabels(canonicalized.canonicalName)
            canonicalized.name = labels.tr // For UI display
            canonicalized.nameTr = labels.tr
          }
        } catch (_err) {
          canonicalized.canonicalName = 'UNKNOWN'
        }
      }

      // Parse Limits
      if (cov.limit) {
        canonicalized.parsedLimit = parseCoverageLimit(cov.limit)
      }

      if (canonicalized.canonicalName && canonicalized.canonicalName !== 'UNKNOWN') {
        const existing = uniqueCoverages.get(canonicalized.canonicalName)
        if (!existing) {
          uniqueCoverages.set(canonicalized.canonicalName, canonicalized)
        } else {
          const existingLimit = existing.parsedLimit?.amount || 0
          const newLimit = canonicalized.parsedLimit?.amount || 0
          if (newLimit > existingLimit) {
            uniqueCoverages.set(canonicalized.canonicalName, canonicalized)
          }
        }
      } else {
        uniqueCoverages.set(`unknown_${Math.random()}`, canonicalized)
      }
    })

    result.coverages = Array.from(uniqueCoverages.values())
  } else {
    result.coverages = []
  }

  // 3. Inject Missing Mandatory Coverages & Enforce Determinism
  const adapter = getAdapterForInsurer(result.provider)
  const requiredCoverages = adapter.getRequiredCoverages(result.policyType)

  if (requiredCoverages.length > 0) {
    const existingMap = new Map(result.coverages.map((cov: any) => [cov.canonicalName, cov]))
    const newCoverages: any[] = []

    for (const reqDef of requiredCoverages) {
      const existing = existingMap.get(reqDef.concept)

      if (!existing) {
        // Missing: Inject it deterministically
        const labels = getConceptLabels(reqDef.concept)
        newCoverages.push({
          name: `${labels.tr}`,
          canonicalName: reqDef.concept,
          normalizedName: labels.tr.toLocaleLowerCase('tr-TR'),
          nameTr: labels.tr,
          limit: reqDef.defaultLimit ?? null,
          parsedLimit:
            reqDef.defaultLimit !== undefined && reqDef.defaultLimit !== null
              ? { type: 'numeric', amount: reqDef.defaultLimit }
              : null,
          isUnlimited: reqDef.isUnlimited ?? false,
          isMarketValue: reqDef.isMarketValue ?? false,
          isImplicit: false, // We use false here to match extracted items
          description: 'Sistem tarafından zorunlu teminat olarak otomatik eklenmiştir.',
        })
      } else {
        // Present: Standardize it if enforced
        const strictCov: any = { ...existing }

        if (reqDef.enforce) {
          if (reqDef.defaultLimit !== undefined) {
            strictCov.limit = reqDef.defaultLimit
            strictCov.parsedLimit =
              reqDef.defaultLimit !== null ? { type: 'numeric', amount: reqDef.defaultLimit } : null
          }
          if (reqDef.isUnlimited !== undefined) {
            strictCov.isUnlimited = reqDef.isUnlimited
          }
          if (reqDef.isMarketValue !== undefined) {
            strictCov.isMarketValue = reqDef.isMarketValue
          }
        }

        newCoverages.push(strictCov)
      }
    }

    // STRICT DETERMINISM GATE: Strip all optional coverages that aren't in the required set
    result.coverages = newCoverages
  }

  return result
}
