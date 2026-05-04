import fs from 'fs'
import path from 'path'

const fixturesDir = path.join(process.cwd(), 'tests/fixtures/baseline/T0')

// Normalizes coverage name for comparison
function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLocaleLowerCase('tr-TR').trim()
}

const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))

let markdown = `# Stage 2 Determinism: Concept-Set Diff Report\n\n`

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf-8'))
  const fixtureName = data.fixture

  // Determine insurer from filename
  let insurer = 'Unknown'
  if (fixtureName.includes('anadolu')) insurer = 'Anadolu'
  if (fixtureName.includes('allianz')) insurer = 'Allianz'

  markdown += `## Fixture: \`${fixtureName}\` (Insurer: ${insurer})\n`

  const runs = data.runs
  // Filter for successful runs only
  const successfulRuns = runs
    .map((r: any, i: number) => ({ run: r, runIndex: i + 1 }))
    .filter((r: any) => r.run.success && r.run.data && r.run.data.coverages)

  if (successfulRuns.length < 2) {
    markdown += `*Only ${successfulRuns.length} successful run(s). Insufficient data to compute variance.*\n\n---\n\n`
    continue
  }

  // Collect all unique concepts across all successful runs for this fixture
  const conceptMap = new Map<
    string,
    { runsPresent: number[]; originalNames: string[]; isGenuinelyOptional?: boolean }
  >()

  successfulRuns.forEach(({ run, runIndex }: any) => {
    // Track what we saw in this run to avoid double counting
    const seenInThisRun = new Set<string>()

    run.data.coverages.forEach((cov: any) => {
      // Prefer nameTr for Turkish concepts, fallback to name
      const conceptName = cov.nameTr || cov.name
      if (!conceptName) return

      const normalized = normalizeName(conceptName)
      seenInThisRun.add(normalized)

      if (!conceptMap.has(normalized)) {
        conceptMap.set(normalized, { runsPresent: [], originalNames: [] })
      }

      const entry = conceptMap.get(normalized)!
      if (!entry.originalNames.includes(conceptName)) {
        entry.originalNames.push(conceptName)
      }
    })

    seenInThisRun.forEach((normalized) => {
      conceptMap.get(normalized)!.runsPresent.push(runIndex)
    })
  })

  const _allRunIndices = successfulRuns.map((r: any) => r.runIndex)
  let hasDiffs = false

  markdown += `### Inconsistent Concepts (Variance Across ${successfulRuns.length} Successful Runs)\n`
  markdown += `| Concept (Normalized) | Original Name(s) | Runs Present | Categorization |\n`
  markdown += `|---|---|---|---|\n`

  // Sort concepts alphabetically
  const sortedConcepts = Array.from(conceptMap.keys()).sort()

  for (const concept of sortedConcepts) {
    const entry = conceptMap.get(concept)!
    // If it's not in all runs, it's inconsistent
    if (entry.runsPresent.length < runs.length && entry.runsPresent.length > 0) {
      hasDiffs = true

      // Attempt heuristic categorization based on common patterns
      // (This will be refined by the user, but we provide an initial guess)
      let category = 'Genuinely Optional (Warning)'
      const normalized = concept.toLowerCase()

      // Known mandatory coverages that might be missed
      if (
        normalized.includes('kasko') ||
        normalized.includes('ihtiyari mali') ||
        normalized.includes('artan mali') ||
        normalized.includes('imm') ||
        normalized.includes('mini onarım') ||
        normalized.includes('mini repair') ||
        normalized.includes('ferdi kaza') ||
        normalized.includes('hukuksal koruma') ||
        normalized.includes('deprem') ||
        normalized.includes('sel') ||
        normalized.includes('grev')
      ) {
        category = 'Required-by-product (Adapter Injection)'
      }

      markdown += `| \`${concept}\` | ${entry.originalNames.join(', ')} | ${entry.runsPresent.join(', ')} | ${category} |\n`
    }
  }

  if (!hasDiffs) {
    markdown += `*No variance detected! All runs extracted the exact same set of concepts.*\n`
  }

  markdown += `\n---\n\n`
}

console.log(markdown)
