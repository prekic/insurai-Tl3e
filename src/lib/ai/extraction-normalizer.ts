/**
 * Branch-specific post-extraction normalization.
 *
 * Called after the LLM extraction produces raw ExtractedPolicyData.
 * Applies branch-specific field normalization, classification tagging,
 * and structured marker injection to improve downstream validator,
 * insight, and display-interpreter accuracy.
 *
 * IMPORTANT: Uses the `description` field for branch-specific tags
 * because `category` is a closed union type (main|liability|supplementary|...).
 * Branch-specific tags use format: [tag_name] or [tag_name:value]
 */

import type { ExtractedPolicyData } from './extraction-schema'

/**
 * Normalize extracted data based on branch-specific rules.
 * Mutates data in place and returns it.
 */
export function normalizeBranchExtraction(data: ExtractedPolicyData): ExtractedPolicyData {
  const branch = data.policyType
  switch (branch) {
    case 'traffic':
      return normalizeTraffic(data)
    case 'home':
      return normalizeHome(data)
    case 'health':
      return normalizeHealth(data)
    case 'life':
      return normalizeLife(data)
    case 'dask':
      return normalizeDask(data)
    case 'business':
      return normalizeBusiness(data)
    case 'nakliyat':
      return normalizeNakliyat(data)
    default:
      return data
  }
}

// ---- helpers ----

function ensureConditions(data: ExtractedPolicyData): string[] {
  if (!data.specialConditions) data.specialConditions = []
  return data.specialConditions
}

function addDescTag(cov: { description?: string | null }, tag: string): void {
  if (!cov.description) cov.description = ''
  if (!cov.description.includes(tag)) {
    cov.description = `${cov.description} ${tag}`.trim()
  }
}

// ==== TRAFFIC ====
function normalizeTraffic(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []
  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const nameTr = (c.nameTr || '').toLowerCase()

    // Auto-classify liability coverages
    if (
      name.includes('bodily') ||
      name.includes('property') ||
      name.includes('death') ||
      nameTr.includes('bedeni') ||
      nameTr.includes('maddi') ||
      nameTr.includes('ölüm')
    ) {
      if (!c.category) c.category = 'liability'
    }

    // Tag statutory vs enhanced based on SEDDK minimums
    if (c.category === 'liability' && c.limit !== null && c.limit !== undefined) {
      if (c.limit > 1_200_000) {
        addDescTag(c, '[enhanced]')
      } else {
        addDescTag(c, '[statutory_minimum]')
      }
    }
  }
  return data
}

// ==== HOME ====
function normalizeHome(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []

  // Tag coverages by home sub-category using description
  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const nameTr = (c.nameTr || '').toLowerCase()
    if (name.includes('building') || nameTr.includes('bina')) addDescTag(c, '[building]')
    if (name.includes('content') || nameTr.includes('eşya')) addDescTag(c, '[contents]')
    if (name.includes('valuable') || nameTr.includes('kıymet')) addDescTag(c, '[valuables]')
    if (name.includes('liability') || nameTr.includes('sorumluluk')) {
      if (!c.category) c.category = 'liability'
    }
  }

  // Check building/contents separation
  const hasBuilding = covs.some((c) => (c.description || '').includes('[building]'))
  const hasContents = covs.some((c) => (c.description || '').includes('[contents]'))
  const conditions = ensureConditions(data)

  if (!hasBuilding && !hasContents && covs.length > 0) {
    if (!conditions.some((c) => c.includes('[unseparated_coverages]'))) {
      conditions.push(
        '[unseparated_coverages] Building and contents coverages could not be separated.'
      )
    }
  }

  // Extract average clause from exclusions
  const avgFromExcl = (data.exclusions || []).find(
    (e) =>
      e.toLowerCase().includes('average') ||
      e.toLowerCase().includes('alt sigorta') ||
      e.toLowerCase().includes('müşterek')
  )
  if (avgFromExcl && !conditions.some((c) => c.toLowerCase().includes('average'))) {
    conditions.push(`[average_clause] ${avgFromExcl}`)
  }

  return data
}

// ==== HEALTH ====
function normalizeHealth(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []
  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const nameTr = (c.nameTr || '').toLowerCase()
    if (name.includes('inpatient') || nameTr.includes('yatarak')) addDescTag(c, '[inpatient]')
    else if (name.includes('outpatient') || nameTr.includes('ayakta')) addDescTag(c, '[outpatient]')
    else if (name.includes('maternity') || nameTr.includes('doğum')) addDescTag(c, '[maternity]')
    else if (name.includes('dental') || nameTr.includes('diş')) addDescTag(c, '[dental]')
    else if (name.includes('vision') || nameTr.includes('göz')) addDescTag(c, '[vision]')
    else if (name.includes('mental') || nameTr.includes('psikoloji'))
      addDescTag(c, '[mental_health]')
  }

  // Extract copay percentage from free-text conditions
  const conditions = ensureConditions(data)
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i]
    const pctMatch =
      c.match(/(\d+)\s*%\s*(katılım|copay|co-pay|pay)/i) ||
      c.match(/(katılım|copay|co-pay|pay)\D*(\d+)\s*%/i)
    if (pctMatch && !c.startsWith('[copay_pct]')) {
      const pct = pctMatch[1] || pctMatch[2]
      conditions[i] = `[copay_pct:${pct}%] ${c}`
    }

    const waitMatch =
      c.match(/(\d+)\s*(ay|month|gün|day|hafta|week)\s*(bekleme|waiting)/i) ||
      c.match(/(bekleme|waiting)\s*(?:süresi|period)?\s*(\d+)\s*(ay|month|gün|day)/i)
    if (waitMatch && !c.startsWith('[waiting_')) {
      conditions[i] = `[waiting_period] ${c}`
    }
  }

  return data
}

// ==== LIFE ====
function normalizeLife(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []

  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const nameTr = (c.nameTr || '').toLowerCase()
    if (
      name.includes('death') ||
      name.includes('sum assured') ||
      nameTr.includes('vefat') ||
      nameTr.includes('teminat bedeli')
    ) {
      if (!c.category) c.category = 'main'
      addDescTag(c, '[death_benefit]')
    } else if (name.includes('rider') || name.includes('ek teminat')) {
      if (!c.category) c.category = 'supplementary'
      addDescTag(c, '[rider]')
    }
  }

  // Flag missing beneficiary
  const conditions = ensureConditions(data)
  if (
    !conditions.some(
      (c) => c.toLowerCase().includes('beneficiary') || c.toLowerCase().includes('lehdar')
    )
  ) {
    if (!conditions.some((c) => c.includes('[ben_unconfirmed]'))) {
      conditions.push(
        '[ben_unconfirmed] Designated payee could not be confirmed from the document.'
      )
    }
  }

  return data
}

// ==== DASK ====
function normalizeDask(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []
  const conditions = ensureConditions(data)

  for (const c of covs) {
    if (!c.category) c.category = 'main'
    addDescTag(c, '[earthquake_scope]')
  }

  const maxLimit = Math.max(...covs.map((c) => c.limit || 0), 0)
  if (maxLimit > 0 && !conditions.some((c) => c.includes('[statutory_cap]'))) {
    conditions.push(`[statutory_cap:${maxLimit}] DASK statutory coverage cap`)
  }

  return data
}

// ==== BUSINESS ====
function normalizeBusiness(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []

  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const nameTr = (c.nameTr || '').toLowerCase()

    if (
      name.includes('building') ||
      name.includes('fire') ||
      nameTr.includes('bina') ||
      nameTr.includes('yangın')
    ) {
      addDescTag(c, '[property]')
    } else if (
      name.includes('stock') ||
      name.includes('inventor') ||
      nameTr.includes('emtia') ||
      nameTr.includes('stok')
    ) {
      addDescTag(c, '[stock]')
    } else if (
      name.includes('machin') ||
      name.includes('equipment') ||
      nameTr.includes('makine') ||
      nameTr.includes('teçhizat')
    ) {
      addDescTag(c, '[machinery]')
    } else if (name.includes('business interruption') || nameTr.includes('iş dur')) {
      addDescTag(c, '[business_interruption]')
    } else if (name.includes('liability') || nameTr.includes('sorumluluk')) {
      if (!c.category) c.category = 'liability'
      addDescTag(c, '[liability]')
    }
  }

  return data
}

// ==== NAKLIYAT ====
function normalizeNakliyat(data: ExtractedPolicyData): ExtractedPolicyData {
  const covs = data.coverages || []
  const conditions = ensureConditions(data)

  let iccDetected = ''
  for (const c of covs) {
    const name = (c.name || '').toLowerCase()
    const desc = (c.description || '').toLowerCase()

    if (
      name.includes('icc (a)') ||
      name.includes('all risk') ||
      desc.includes('icc (a)') ||
      desc.includes('institute cargo clauses (a)')
    ) {
      iccDetected = 'A'
      addDescTag(c, '[icc:A]')
    } else if (
      name.includes('icc (b)') ||
      desc.includes('icc (b)') ||
      desc.includes('institute cargo clauses (b)')
    ) {
      iccDetected = 'B'
      addDescTag(c, '[icc:B]')
    } else if (
      name.includes('icc (c)') ||
      name.includes('minimum') ||
      desc.includes('icc (c)') ||
      desc.includes('institute cargo clauses (c)')
    ) {
      iccDetected = 'C'
      addDescTag(c, '[icc:C]')
    }
  }

  if (iccDetected && !conditions.some((c) => c.includes('[icc_basis]'))) {
    conditions.push(`[icc_basis:${iccDetected}] Institute Cargo Clauses (${iccDetected}) detected`)
  }

  // Extract Incoterm
  const incoterms = ['CIF', 'FOB', 'CFR', 'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']
  for (const cond of [...conditions]) {
    for (const term of incoterms) {
      if (
        cond.toUpperCase().includes(term) &&
        !conditions.some((c) => c.includes(`[incoterm:${term}]`))
      ) {
        conditions.push(`[incoterm:${term}] Incoterm ${term} detected`)
        break
      }
    }
  }

  return data
}
