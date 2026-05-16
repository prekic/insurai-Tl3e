import { canonicalizeCoverage } from './canonicalize-coverage.js'
import { deriveEntityType } from './derive-entity-type.js'
import { normalizeCoverageLabel } from './normalize-text.js'
import { parseCoverageLimit } from './parse-coverage-limit.js'
import { getAdapterForInsurer } from '../adapters/adapter-factory.js'
import { getConceptLabels } from '../types/canonical-concepts.js'
import { projectNCD } from './ncd-projection.js'

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
  // Pass context including isBundle so the adapter can detect Birleşik Kasko
  // for correct Hukuksal Koruma sub-tier injection (policyType is always "kasko").
  const reqDefs = adapter.getRequiredCoverages(result.policyType, result)

  if (reqDefs.length > 0) {
    const existingMap = new Map(result.coverages.map((cov: any) => [cov.canonicalName, cov]))
    const standardizedRequired: any[] = []

    for (const reqDef of reqDefs) {
      const existing = existingMap.get(reqDef.concept)

      if (!existing) {
        // Missing: Inject it deterministically
        const labels = getConceptLabels(reqDef.concept)
        standardizedRequired.push({
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
          isImplicit: false,
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

        standardizedRequired.push(strictCov)
      }
    }

    // Build set of required canonical names to dedup from the kept set
    const requiredCanonicalNames = new Set(standardizedRequired.map((cov) => cov.canonicalName))

    // Keep LLM-extracted coverages that are NOT in the required set (was STRICT DETERMINISM GATE)
    // FIX: Previously this was "result.coverages = standardizedRequired" which dropped all
    // non-required coverages (about 20 out of 29). Now we preserve them.
    const keptOptional = result.coverages.filter(
      (cov: any) => !requiredCanonicalNames.has(cov.canonicalName)
    )

    // Merge: optional (LLM-only) coverages + required (adapter-driven) coverages
    result.coverages = [...keptOptional, ...standardizedRequired]
  }

  // 3b. Coverage Field Defaults
  // Set sensible defaults for fields the LLM may leave as null or undefined:
  // - included: true when ambiguous (listed coverages are usually active)
  // - isOptional: false for mandatory, true only when explicitly marked 'Secmeli'
  // NOTE: JavaScript spread preserves undefined values, but JSON.stringify drops
  // them entirely. We must explicitly use null-coalescing or ternary defaults.
  if (Array.isArray(result.coverages)) {
    result.coverages = result.coverages.map((cov: any) => {
      const included =
        cov.included === true || cov.included === false || cov.included === 'false'
          ? !!cov.included
          : true
      const isOptional = cov.isOptional === true ? true : false
      return { ...cov, included, isOptional }
    })
  }

  // 4. NCD Projection
  // Enrich the discounts object with future-year projections.
  // The LLM extracts raw NCD (e.g. 50%, kademe 3). Business logic
  // projects next year (kademe 4 → 60%) and post-claim values.
  if (result.discounts && typeof result.discounts === 'object') {
    const ncdPct = result.discounts.ncdDiscount ?? null
    // Try to extract kademe from evidence text if available
    let kademe: number | null = null
    if (result.discounts.evidence) {
      const kademeMatch = result.discounts.evidence.match(/Kademesi?\s*:\s*(\d+)/i)
      if (kademeMatch) {
        kademe = parseInt(kademeMatch[1], 10)
      }
    }
    const projection = projectNCD(ncdPct, kademe)
    result.ncdProjection = projection
  }

  return result
}
