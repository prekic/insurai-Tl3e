import fs from 'fs'

const p = 'src/lib/reviewer/policy-reviewer-summary.ts'
let code = fs.readFileSync(p, 'utf-8')

// Add imports for grouping
code = code.replace(
  "import { COVERAGE_NAMES_EN_TO_TR, lookupCoverageNameTr } from '@/lib/i18n/coverage-names'",
  "import { COVERAGE_NAMES_EN_TO_TR, lookupCoverageNameTr } from '@/lib/i18n/coverage-names'\nimport { groupCoverageSubLimits, detectCoverageCategory, sortByImportance, GroupedCoverage } from '@/lib/knowledge/kasko-knowledge'"
)

// Add groupedCoverages to ReviewerSummary
code = code.replace(
  '  coverages: ReviewerCoverageItem[]',
  '  coverages: ReviewerCoverageItem[]\n  groupedCoverages: Record<string, GroupedCoverage[]>'
)

code = code.replace(
  '  const hasConditionalDeductibles =',
  `  // Grouping logic for UI
  const groups: Record<string, Coverage[]> = {
    main: [],
    liability: [],
    personal_accident: [],
    supplementary: [],
    assistance: [],
    legal: [],
    other: [],
  }

  const filteredCoverages = policy.coverages.filter((coverage) => {
    // Always keep coverages with limits, unlimited flag, or market value flag
    if (coverage.limit > 0) return true
    if (coverage.isUnlimited) return true
    if (coverage.isMarketValue) return true

    // Keep service coverages
    const nameLower = (coverage.name || '').toLowerCase()
    if (shouldShowUnlimited(nameLower, 0) || shouldShowIncluded(nameLower, 0)) {
      return true
    }

    // Filter out zero-limit entries that look like policy category headers
    const categoryPatterns = [
      'zorunlu mali sorumluluk',
      'trafik sigortası',
      'kasko sigortası',
      'konut sigortası',
    ]
    return !categoryPatterns.some((pattern) => nameLower.includes(pattern))
  })

  // Format and group
  for (const coverage of filteredCoverages) {
    const origCov = {
      ...coverage,
      name: getLocalizedCoverageName(coverage, locale, coverageNamesMap),
    }
    const category = origCov.category || detectCoverageCategory(coverage.name)
    if (groups[category]) {
      groups[category].push(origCov)
    } else {
      groups.other.push(origCov)
    }
  }

  const groupedWithSubLimits: Record<string, GroupedCoverage[]> = {}
  for (const [category, _coverages] of Object.entries(groups)) {
    const grouped = groupCoverageSubLimits(_coverages)
    groupedWithSubLimits[category] = sortByImportance(grouped)
  }

  const hasConditionalDeductibles =`
)

code = code.replace('    coverages,', '    coverages,\n    groupedCoverages: groupedWithSubLimits,')

fs.writeFileSync(p, code)
