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
        // ── UNKNOWN De-duplication ──
        // First check: does this UNKNOWN name match an already-canonicalized
        // coverage? LLMs often produce variants like "Seat Personal Accident"
        // when SEAT_PERSONAL_ACCIDENT_DEATH is already in the map. Drop it.
        const nameLow = (cov.name || '').toLowerCase().trim()

        // Build fuzzy match: extract key terms from the UNKNOWN name and
        // see if they overlap with any canonical name already in the map.
        const nameTokens = nameLow.split(/[\s-/]+/).filter((t: string) => t.length > 3)
        let isDuplicateOfKnown = false
        if (nameTokens.length > 0) {
          for (const [existingCn, existingCov] of uniqueCoverages) {
            // Skip UNKNOWN coverages in the map (don't compare against them)
            if (existingCn === 'UNKNOWN' || existingCn.startsWith('unknown_')) continue
            // Check if most tokens in the UNKNOWN name appear in the canonical label
            // existingCov.name is replaced with Turkish label (e.g. 'Koltuk Ferdi Kaza')
            // so check against BOTH the canonical concept (English) AND the Turkish name
            const existingName = (existingCn + ' ' + (existingCov.name || '')).toLowerCase()
            const matchingTokens = nameTokens.filter((token: string) =>
              existingName.includes(token)
            )
            if (matchingTokens.length >= nameTokens.length * 0.5) {
              isDuplicateOfKnown = true
              break
            }
          }
        }

        if (isDuplicateOfKnown) {
          // Silently drop — this is just a variant of an already-extracted coverage
        } else {
          // Use the original name as key to dedup UNKNOWN coverages
          // (LLM often outputs Turkish names that don't canonicalize)
          const unknownKey = cov.name ? `unknown_${nameLow}` : `unknown_${Math.random()}`
          const existing = uniqueCoverages.get(unknownKey)
          if (!existing) {
            uniqueCoverages.set(unknownKey, canonicalized)
          } else {
            // Merge: keep the entry with higher limit (same logic as known)
            const existingLimit = existing.parsedLimit?.amount || 0
            const newLimit = canonicalized.parsedLimit?.amount || 0
            if (newLimit > existingLimit) {
              uniqueCoverages.set(unknownKey, canonicalized)
            }
          }
        }
      }
    })

    result.coverages = Array.from(uniqueCoverages.values())

    // ── Post-processing: filter out kloz/clause items masquerading as coverages ──
    // LLMs sometimes extract clause section headings or policy descriptions as
    // coverage entries with no limit. These are not real coverages.
    const klozStopWords = [
      'reinstatement',
      'continuity of sum',
      'service network',
      'agreed network',
      'authorized service',
      'external impact',
      'overturning',
      'legally incapable',
      'incapable persons',
      'attempted theft',
      'hatalı akaryakıt',
      'eksper',
      'muafiyet',
      'servis uygulama',
    ]
    result.coverages = result.coverages.filter((cov: any) => {
      if (cov.canonicalName !== 'UNKNOWN') return true
      const label = (cov.normalizedName || cov.name || '').toLowerCase()
      for (const stop of klozStopWords) {
        if (label.includes(stop.toLowerCase())) return false
      }
      return true
    })
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
            // Only overwrite limit with default if the LLM didn't extract a real limit
            // AND the LLM didn't mark it as unlimited/market value.
            // The adapter's defaultLimit is a fallback, not an override.
            const llmLimit = strictCov.limit ?? strictCov.parsedLimit?.amount ?? null
            const llmIsUnlimited = strictCov.isUnlimited === true
            const llmIsMarketValue = strictCov.isMarketValue === true
            if (
              (llmLimit === null || llmLimit === undefined) &&
              !llmIsUnlimited &&
              !llmIsMarketValue
            ) {
              strictCov.limit = reqDef.defaultLimit
              strictCov.parsedLimit =
                reqDef.defaultLimit !== null
                  ? { type: 'numeric', amount: reqDef.defaultLimit }
                  : null
            }
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

  // 3b. Post-processing: Auto-inject missing Sürücüye Bağlı when Motorlu Araca Bağlı exists
  // This is a KNOWN systematic LLM gap: Sürücüye Bağlı (50K) appears in source text alongside
  // Motorlu Araca Bağlı (50K) but the LLM drops it ~100% of the time.
  if (Array.isArray(result.coverages)) {
    const hasMAB = result.coverages.some(
      (c: any) => c.canonicalName === 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'
    )
    const hasSDB = result.coverages.some((c: any) => c.canonicalName === 'DRIVER_PERSONAL_ACCIDENT')
    if (hasMAB && !hasSDB) {
      const mab = result.coverages.find(
        (c: any) => c.canonicalName === 'VEHICLE_ATTACHED_PERSONAL_ACCIDENT'
      )
      const mabLimit = mab?.limit ?? 50000
      const labels = getConceptLabels('DRIVER_PERSONAL_ACCIDENT')
      result.coverages.push({
        name: labels.tr,
        canonicalName: 'DRIVER_PERSONAL_ACCIDENT',
        normalizedName: labels.tr.toLocaleLowerCase('tr-TR'),
        nameTr: labels.tr,
        limit: mabLimit,
        parsedLimit: { type: 'numeric' as const, amount: mabLimit },
        isUnlimited: false,
        isMarketValue: false,
        isImplicit: false,
        included: true,
        isOptional: false,
        description:
          'Otomatik olarak tamamlandı: Motorlu Araca Bağlı ile aynı limite sahip Sürücüye Bağlı eklendi.',
      })
    }
  }

  // 3c. Coverage Field Defaults
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

  // 3d. Propagate Hukuksal Koruma sub-limits from main entry description
  // The main HK entry has limits in its description field (e.g. "5,000 TL per claim
  // / 11,000 TL annual aggregate / 750 TL bail / 750 TL advance"). The sub-items
  // (Avans, Kefalet, Olay Basi, Yillik Toplam) are auto-added by the adapter with
  // null limits. Extract sub-limits from the main entry and propagate.
  if (Array.isArray(result.coverages)) {
    const mainHk = result.coverages.find(
      (c: any) =>
        c.canonicalName === 'LEGAL_PROTECTION' && c.description && c.description.length > 20
    )
    if (mainHk?.description) {
      const desc = (mainHk.description as string).toLocaleLowerCase('tr-TR')
      // HK descriptions follow this pattern:
      // '5,000 TL per claim / 11,000 TL annual aggregate / 750 TL bail / 750 TL legal advance'
      // Extract all numeric amounts with their corresponding labels
      const amounts: { concept: string; amount: number }[] = []
      // Split on / to get segments like '5,000 TL per claim'
      const parts = desc.split(/\s*\/\s*/)
      for (const part of parts) {
        const numMatch = part.match(/([\d,.]+)\s*tl/i)
        if (!numMatch) continue
        // Handle Turkish thousands format: dot=thousands (5.000 → 5000),
        // comma=decimal (5.000,50 → 5000.50)
        let raw = numMatch[1]
        // Remove dots used as thousands separators (\d{1,3}\.\d{3})
        raw = raw.replace(/(?<=\d)\.(?=\d{3}(?:[^\d]|$))/g, '')
        // Replace comma decimal with dot
        raw = raw.replace(',', '.')
        const amount = parseFloat(raw)
        if (!isNaN(amount) && amount > 0) {
          const seg = part.toLocaleLowerCase('tr-TR')
          if (
            seg.includes('claim') ||
            seg.includes('olay') ||
            seg.includes('per event') ||
            seg.includes('per claim')
          ) {
            amounts.push({ concept: 'LEGAL_PROTECTION_PER_EVENT', amount })
          } else if (
            seg.includes('annual') ||
            seg.includes('y.l.l.k') ||
            seg.includes('aggregate') ||
            seg.includes('sigorta s.resi') ||
            seg.includes('insurance period')
          ) {
            amounts.push({ concept: 'LEGAL_PROTECTION_ANNUAL_AGGREGATE', amount })
          } else if (seg.includes('bail') || seg.includes('kefalet')) {
            amounts.push({ concept: 'LEGAL_PROTECTION_BAIL', amount })
          } else if (seg.includes('advance') || seg.includes('avan') || seg.includes('avans')) {
            amounts.push({ concept: 'LEGAL_PROTECTION_ADVANCE', amount })
          }
        }
      }
      // Fallback if label matching failed: use positional order
      // Format is always: [per_event], [annual], [bail], [advance]
      if (amounts.length === 0) {
        const nums = desc.match(/(\d{1,3}(?:\.\d{3})*)/g)
        if (nums && nums.length >= 4) {
          const order = [
            'LEGAL_PROTECTION_PER_EVENT',
            'LEGAL_PROTECTION_ANNUAL_AGGREGATE',
            'LEGAL_PROTECTION_BAIL',
            'LEGAL_PROTECTION_ADVANCE',
          ]
          for (let i = 0; i < order.length; i++) {
            const amount = parseFloat(nums[i].replace(/\./g, ''))
            if (!isNaN(amount) && amount > 0) {
              amounts.push({ concept: order[i], amount })
            }
          }
        }
      }
      // Apply extracted amounts to matching coverage items
      for (const entry of amounts) {
        const cov = result.coverages.find(
          (c: any) =>
            c.canonicalName === entry.concept && (c.limit === null || c.limit === undefined)
        )
        if (cov) {
          cov.limit = entry.amount
          cov.parsedLimit = { type: 'numeric' as const, amount: entry.amount }
        }
      }
    }
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
      const kademeMatch = result.discounts.evidence.match(/Kademe(?:si)?\s*:\s*(\d+)/i)
      if (kademeMatch) {
        kademe = parseInt(kademeMatch[1], 10)
      }
    }
    const projection = projectNCD(ncdPct, kademe)
    result.ncdProjection = projection
  }

  return result
}
