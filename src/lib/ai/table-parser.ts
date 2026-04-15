/**
 * Document AI Table Parser
 *
 * Extracts structured coverage information from Document AI tables.
 * Parses Turkish insurance document tables for coverage limits,
 * deductibles, and policy details.
 */

import type { Table, TableRow } from './ocr'
import type { ExtractedCoverage } from './extraction-schema'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Internal coverage type with additional metadata for table processing
 * Used internally then stripped to ExtractedCoverage for output
 */
interface InternalCoverage extends ExtractedCoverage {
  /** Turkish name (internal use for matching) */
  _nameTr?: string
  /** Row confidence (internal use for deduplication) */
  _rowConfidence?: number
}

export interface ParsedTableData {
  coverages: ExtractedCoverage[]
  metadata: Record<string, string>
  confidence: number
}

export interface TableColumnMapping {
  coverageName?: number
  limit?: number
  deductible?: number
  included?: number
  notes?: number
}

// ============================================================================
// TURKISH COVERAGE PATTERNS
// ============================================================================

/**
 * Turkish coverage name patterns for matching table headers and values
 */
const TURKISH_COVERAGE_PATTERNS = {
  // Main coverages
  collision: [/çarp[ıi]?[sş]ma/i, /çarpma/i, /kasko/i],
  theft: [/h[ıi]rs[ıi]zl[ıi]k/i, /çal[ıi]n/i],
  fire: [/yang[ıi]n/i, /ate[sş]/i],
  naturalDisaster: [/do[gğ]al\s*afet/i, /deprem/i, /sel/i, /f[ıi]rt[ıi]na/i],
  glass: [/cam/i, /cam\s*k[ıi]r[ıi]l/i],
  personalAccident: [/ki[sş]isel\s*kaza/i, /ferdi\s*kaza/i, /s[üu]r[üu]c[üu]/i],
  liability: [/mali\s*sorumluluk/i, /sorumluluk/i, /3\.\s*[sş]ah[ıi]s/i],
  legal: [/hukuki\s*koruma/i, /hukuk/i],
  assistance: [/yard[ıi]m/i, /asist/i, /[çc]ekici/i, /ikame/i],
  medical: [/sa[gğ]l[ıi]k/i, /tedavi/i, /hastane/i],

  // Kasko specific
  partialDamage: [/k[ıi]smi\s*hasar/i],
  totalLoss: [/tam\s*hasar/i, /pert/i],
  replacementVehicle: [/ikame\s*ara[çc]/i],
  towing: [/[çc]ekici/i, /[çc]eki[sş]/i],
  keyLoss: [/anahtar/i],

  // Traffic specific
  bodilyInjury: [/bedeni/i, /yaralanma/i],
  propertyDamage: [/maddi/i, /mal/i],

  // Home/DASK specific
  building: [/bina/i, /yap[ıi]/i],
  contents: [/e[sş]ya/i, /i[çc]erik/i],
  earthquake: [/deprem/i, /dask/i],
}

/**
 * Turkish header patterns for identifying table columns
 */
const TURKISH_HEADER_PATTERNS = {
  coverageName: [/teminat/i, /kapsam/i, /koruma/i, /sigorta\s*konu/i],
  limit: [/limit/i, /teminat\s*tutar/i, /azami/i, /maksimum/i, /tutar/i],
  deductible: [/muafiyet/i, /pay/i, /katk[ıi]/i],
  included: [/dahil/i, /kapsam/i, /var/i, /evet/i],
  premium: [/prim/i, /[üu]cret/i],
  notes: [/not/i, /a[çc][ıi]klama/i, /detay/i],
}

/**
 * Patterns indicating unlimited coverage
 */
const UNLIMITED_PATTERNS = [/s[ıi]n[ıi]rs[ıi]z/i, /limitsiz/i, /unlimited/i]

/**
 * Patterns indicating market value coverage
 */
const MARKET_VALUE_PATTERNS = [/rayi[çc]/i, /piyasa\s*de[gğ]er/i, /g[üu]ncel\s*de[gğ]er/i]

/**
 * Patterns indicating coverage is included
 * Note: /x/i removed — too broad (matches "text", "next", etc.)
 * Note: dahi̇l variant added for Turkish İ→i̇ lowercasing (U+0130 → U+0069+U+0307)
 */
const INCLUDED_PATTERNS = [/dahil/i, /dahi̇l/i, /\bvar\b/i, /evet/i, /✓/, /✔/, /^x$/i]

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse Document AI tables and extract coverage information
 */
export function parseTablesForCoverages(tables: Table[]): ParsedTableData {
  const allCoverages: InternalCoverage[] = []
  const metadata: Record<string, string> = {}
  let totalConfidence = 0
  let tableCount = 0

  for (const table of tables) {
    const parsed = parseSingleTable(table)
    allCoverages.push(...parsed.coverages)
    Object.assign(metadata, parsed.metadata)
    totalConfidence += parsed.confidence
    tableCount++
  }

  // Deduplicate coverages by name
  const uniqueCoverages = deduplicateCoverages(allCoverages)

  // Strip internal properties before returning
  const cleanCoverages = uniqueCoverages.map(stripInternalProperties)

  return {
    coverages: cleanCoverages,
    metadata,
    confidence: tableCount > 0 ? totalConfidence / tableCount : 0,
  }
}

/**
 * Internal parsed table data with coverage metadata
 */
interface InternalParsedTableData {
  coverages: InternalCoverage[]
  metadata: Record<string, string>
  confidence: number
}

/**
 * Parse a single table for coverage information
 */
function parseSingleTable(table: Table): InternalParsedTableData {
  const coverages: InternalCoverage[] = []
  const metadata: Record<string, string> = {}

  if (!table.rows || table.rows.length < 2) {
    return { coverages, metadata, confidence: 0 }
  }

  // Try to identify column structure from header row
  const headerRow = table.rows[0]
  const columnMapping = identifyColumns(headerRow)

  // If no clear column mapping, try pattern-based extraction
  if (!columnMapping.coverageName && !columnMapping.limit) {
    return extractWithPatternMatching(table)
  }

  // Process data rows
  const dataRows = table.rows.slice(table.headerRows || 1)

  for (const row of dataRows) {
    const coverage = extractCoverageFromRow(row, columnMapping)
    if (coverage) {
      coverages.push(coverage)
    }
  }

  return {
    coverages,
    metadata,
    confidence: table.confidence || 0.7,
  }
}

/**
 * Identify column types from header row
 */
function identifyColumns(headerRow: TableRow): TableColumnMapping {
  const mapping: TableColumnMapping = {}

  for (let i = 0; i < headerRow.cells.length; i++) {
    const cellText = headerRow.cells[i].text.toLowerCase()

    for (const [type, patterns] of Object.entries(TURKISH_HEADER_PATTERNS)) {
      if (patterns.some((p) => p.test(cellText))) {
        mapping[type as keyof TableColumnMapping] = i
        break
      }
    }
  }

  return mapping
}

/**
 * Extract coverage data from a table row
 */
function extractCoverageFromRow(
  row: TableRow,
  columnMapping: TableColumnMapping
): InternalCoverage | null {
  if (!row.cells || row.cells.length === 0) return null

  // Get coverage name
  const nameIndex = columnMapping.coverageName ?? 0
  const nameCell = row.cells[nameIndex]
  if (!nameCell || !nameCell.text.trim()) return null

  const name = nameCell.text.trim()

  // Determine coverage category
  const category = determineCoverageCategory(name)

  // Get limit
  let limit: number | null = null
  let isUnlimited = false
  let isMarketValue = false

  if (columnMapping.limit !== undefined) {
    const limitCell = row.cells[columnMapping.limit]
    if (limitCell) {
      const limitResult = parseLimitValue(limitCell.text)
      limit = limitResult.limit || null
      isUnlimited = limitResult.isUnlimited
      isMarketValue = limitResult.isMarketValue
    }
  }

  // Get deductible
  let deductible: number | null = null
  if (columnMapping.deductible !== undefined) {
    const deductibleCell = row.cells[columnMapping.deductible]
    if (deductibleCell) {
      const parsed = parseCurrencyValue(deductibleCell.text)
      deductible = parsed || null
    }
  }

  // Check if included — keep excluded coverages with included=false instead of
  // dropping them, so downstream gap analysis can see what was explicitly excluded.
  let isIncluded = true
  if (columnMapping.included !== undefined) {
    const includedCell = row.cells[columnMapping.included]
    if (includedCell) {
      isIncluded = isIncludedValue(includedCell.text)
    }
  }

  // Calculate confidence from cell confidences (for internal use)
  const rowConfidence = calculateRowConfidence(row)

  return {
    name: translateCoverageName(name),
    limit,
    deductible,
    description: null,
    isUnlimited,
    isMarketValue,
    category,
    included: isIncluded,
    // Internal properties (will be stripped)
    _nameTr: name,
    _rowConfidence: rowConfidence,
  }
}

/**
 * Pattern-based extraction when column structure is unclear
 */
function extractWithPatternMatching(table: Table): InternalParsedTableData {
  const coverages: InternalCoverage[] = []
  const metadata: Record<string, string> = {}

  for (const row of table.rows) {
    // Concatenate all cells to find patterns
    const rowText = row.cells.map((c) => c.text).join(' ')

    // Check if row contains a coverage pattern
    for (const [coverageType, patterns] of Object.entries(TURKISH_COVERAGE_PATTERNS)) {
      if (patterns.some((p) => p.test(rowText))) {
        // Found a coverage - extract limit from the row
        const limitResult = extractLimitFromText(rowText)

        coverages.push({
          name: getCoverageEnglishName(coverageType),
          limit: limitResult.limit || null,
          deductible: null,
          description: null,
          isUnlimited: limitResult.isUnlimited,
          isMarketValue: limitResult.isMarketValue,
          category: determineCategoryFromType(coverageType),
          // Internal properties
          _nameTr: extractTurkishName(rowText, patterns),
          _rowConfidence: calculateRowConfidence(row),
        })
        break
      }
    }
  }

  return {
    coverages,
    metadata,
    confidence: table.confidence || 0.6,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a limit value from text
 */
function parseLimitValue(text: string): {
  limit: number
  isUnlimited: boolean
  isMarketValue: boolean
} {
  const cleanText = text.trim()

  // Check for unlimited
  if (UNLIMITED_PATTERNS.some((p) => p.test(cleanText))) {
    return { limit: 0, isUnlimited: true, isMarketValue: false }
  }

  // Check for market value
  if (MARKET_VALUE_PATTERNS.some((p) => p.test(cleanText))) {
    return { limit: 0, isUnlimited: false, isMarketValue: true }
  }

  // Parse numeric value
  const limit = parseCurrencyValue(cleanText)
  return { limit, isUnlimited: false, isMarketValue: false }
}

/**
 * Parse Turkish currency format to number
 */
function parseCurrencyValue(text: string): number {
  // Remove currency symbols and whitespace
  let cleaned = text.replace(/[₺TL\s]/gi, '')

  // Turkish format uses . for thousands, , for decimal
  // Convert to standard format
  cleaned = cleaned.replace(/\./g, '').replace(',', '.')

  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : value
}

/**
 * Extract limit value from free-form text
 */
function extractLimitFromText(text: string): {
  limit: number
  isUnlimited: boolean
  isMarketValue: boolean
} {
  // Check for unlimited
  if (UNLIMITED_PATTERNS.some((p) => p.test(text))) {
    return { limit: 0, isUnlimited: true, isMarketValue: false }
  }

  // Check for market value
  if (MARKET_VALUE_PATTERNS.some((p) => p.test(text))) {
    return { limit: 0, isUnlimited: false, isMarketValue: true }
  }

  // Look for currency patterns
  const currencyMatch = text.match(/(?:₺|TL)?\s*([\d.,]+)\s*(?:₺|TL)?/i)
  if (currencyMatch) {
    return {
      limit: parseCurrencyValue(currencyMatch[1]),
      isUnlimited: false,
      isMarketValue: false,
    }
  }

  return { limit: 0, isUnlimited: false, isMarketValue: false }
}

/**
 * Check if text indicates coverage is included
 */
function isIncludedValue(text: string): boolean {
  const cleanText = text.trim().toLowerCase()

  // Check for explicit inclusion
  if (INCLUDED_PATTERNS.some((p) => p.test(cleanText))) {
    return true
  }

  // Check for explicit exclusion — handle OCR variants of HARİÇ
  if (/hay[ıi]r|yok|hari[çc]|excluded|HARİÇ|HARIC/i.test(cleanText)) {
    return false
  }

  // Default to excluded (safe) when DAHİL/HARİÇ column can't be confidently parsed.
  // Previously defaulted to true, which caused HARİÇ coverages to be incorrectly
  // marked as included when OCR corrupted the text.
  return false
}

/**
 * Determine coverage category from name
 */
function determineCoverageCategory(name: string): ExtractedCoverage['category'] {
  const lowerName = name.toLowerCase()

  if (/mali\s*sorumluluk|sorumluluk|3\.\s*şahıs/i.test(lowerName)) {
    return 'liability'
  }
  if (/hukuk|legal/i.test(lowerName)) {
    return 'legal'
  }
  if (/yardım|asist|çekici|ikame/i.test(lowerName)) {
    return 'assistance'
  }
  if (/çarpma|hırsızlık|yangın|deprem|kasko|bina|eşya/i.test(lowerName)) {
    return 'main'
  }
  if (/cam|anahtar|ferdi/i.test(lowerName)) {
    return 'supplementary'
  }

  return 'other'
}

/**
 * Determine category from coverage type key
 */
function determineCategoryFromType(type: string): ExtractedCoverage['category'] {
  const mainTypes = [
    'collision',
    'theft',
    'fire',
    'naturalDisaster',
    'building',
    'contents',
    'earthquake',
  ]
  const liabilityTypes = ['liability', 'bodilyInjury', 'propertyDamage']
  const assistanceTypes = ['assistance', 'towing', 'replacementVehicle']
  const supplementaryTypes = ['glass', 'personalAccident', 'keyLoss']
  const legalTypes = ['legal']

  if (mainTypes.includes(type)) return 'main'
  if (liabilityTypes.includes(type)) return 'liability'
  if (assistanceTypes.includes(type)) return 'assistance'
  if (supplementaryTypes.includes(type)) return 'supplementary'
  if (legalTypes.includes(type)) return 'legal'

  return 'other'
}

/**
 * Get English name for coverage type
 */
function getCoverageEnglishName(type: string): string {
  const names: Record<string, string> = {
    collision: 'Collision Damage',
    theft: 'Theft',
    fire: 'Fire',
    naturalDisaster: 'Natural Disaster',
    glass: 'Glass Coverage',
    personalAccident: 'Personal Accident',
    liability: 'Liability',
    legal: 'Legal Protection',
    assistance: 'Roadside Assistance',
    medical: 'Medical Coverage',
    partialDamage: 'Partial Damage',
    totalLoss: 'Total Loss',
    replacementVehicle: 'Replacement Vehicle',
    towing: 'Towing Service',
    keyLoss: 'Key Loss',
    bodilyInjury: 'Bodily Injury',
    propertyDamage: 'Property Damage',
    building: 'Building Coverage',
    contents: 'Contents Coverage',
    earthquake: 'Earthquake Coverage',
  }

  return names[type] || type
}

/**
 * Extract Turkish name from text matching pattern
 */
function extractTurkishName(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      // Return the matched portion plus some context
      return match[0]
    }
  }
  return text.substring(0, 50) // Fallback to first 50 chars
}

/**
 * Translate common Turkish coverage names to English
 */
function translateCoverageName(turkishName: string): string {
  const translations: Record<string, string> = {
    'çarpma/çarpışma': 'Collision Damage',
    hırsızlık: 'Theft',
    yangın: 'Fire',
    'doğal afetler': 'Natural Disaster',
    deprem: 'Earthquake',
    sel: 'Flood',
    'cam kırılması': 'Glass Breakage',
    'ferdi kaza': 'Personal Accident',
    'mali sorumluluk': 'Liability',
    'hukuki koruma': 'Legal Protection',
    'yol yardım': 'Roadside Assistance',
    'ikame araç': 'Replacement Vehicle',
    çekici: 'Towing',
    'anahtar kaybı': 'Key Loss',
    'kısmi hasar': 'Partial Damage',
    'tam hasar': 'Total Loss',
  }

  const lowerName = turkishName.toLowerCase()
  for (const [turkish, english] of Object.entries(translations)) {
    if (lowerName.includes(turkish)) {
      return english
    }
  }

  return turkishName
}

/**
 * Calculate average confidence for a row
 */
function calculateRowConfidence(row: TableRow): number {
  if (!row.cells || row.cells.length === 0) return 0

  const totalConfidence = row.cells.reduce((sum, cell) => sum + (cell.confidence || 0), 0)
  return totalConfidence / row.cells.length
}

/**
 * Deduplicate coverages by name, keeping highest confidence
 */
function deduplicateCoverages(coverages: InternalCoverage[]): InternalCoverage[] {
  const seen = new Map<string, InternalCoverage>()

  for (const coverage of coverages) {
    const key = coverage.name.toLowerCase()
    const existing = seen.get(key)

    if (!existing || (coverage._rowConfidence || 0) > (existing._rowConfidence || 0)) {
      seen.set(key, coverage)
    }
  }

  return Array.from(seen.values())
}

/**
 * Strip internal properties from coverage before returning
 */
function stripInternalProperties(coverage: InternalCoverage): ExtractedCoverage {
  const { _nameTr, _rowConfidence, ...clean } = coverage
  return clean
}

/**
 * Merge table-extracted coverages with AI-extracted coverages
 * Table data takes precedence for limits when table confidence is high
 *
 * @param aiCoverages - Coverages from AI extraction
 * @param tableCoverages - Coverages from table parsing
 * @param tableConfidence - Overall confidence of the table parsing (0-1)
 * @param minTableConfidence - Minimum confidence to use table data
 */
export function mergeCoveragesWithTableData(
  aiCoverages: ExtractedCoverage[],
  tableCoverages: ExtractedCoverage[],
  tableConfidence = 0.7,
  minTableConfidence = 0.7
): ExtractedCoverage[] {
  const merged = new Map<string, ExtractedCoverage>()

  // Add AI coverages first
  for (const coverage of aiCoverages) {
    merged.set(coverage.name.toLowerCase(), coverage)
  }

  // Override/add table coverages if table confidence is high enough
  if (tableConfidence >= minTableConfidence) {
    for (const tableCoverage of tableCoverages) {
      const key = tableCoverage.name.toLowerCase()
      const existing = merged.get(key)

      if (!existing) {
        // New coverage from table
        merged.set(key, tableCoverage)
      } else {
        // Update limit/deductible from table data
        merged.set(key, {
          ...existing,
          limit: tableCoverage.limit ?? existing.limit,
          deductible: tableCoverage.deductible ?? existing.deductible,
          isUnlimited: tableCoverage.isUnlimited || existing.isUnlimited,
          isMarketValue: tableCoverage.isMarketValue || existing.isMarketValue,
        })
      }
    }
  }

  return Array.from(merged.values())
}
