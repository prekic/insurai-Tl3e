/**
 * Pilot batch ingestion — pure helper functions.
 *
 * No Vite deps, no DB deps, no LLM calls. Testable in isolation.
 */

export interface BatchFileInfo {
  path: string
  name: string
  sizeBytes: number
}

export interface BatchResultEntry {
  filename: string
  textExtracted: boolean
  textLength: number
  pageCount: number
  llmExtracted: boolean
  llmModel: string
  policyNumber: string | null
  provider: string | null
  coverageCount: number
  admissionStatus: string
  displayMode: string
  phraseClean: boolean
  error: string | null
}

export interface BatchSummary {
  totalFiles: number
  textSuccess: number
  textFailed: number
  llmSuccess: number
  llmFailed: number
  admissionBreakdown: Record<string, number>
  displayModeBreakdown: Record<string, number>
  phraseLeaks: number
  averageCoverages: number
}

/**
 * Discover PDF files in a directory (non-recursive).
 * Returns sorted by filename for deterministic ordering.
 */
export function discoverPDFs(
  dirPath: string,
  fsModule: { readdirSync: (p: string) => string[]; statSync: (p: string) => { size: number } },
  pathModule: { join: (...args: string[]) => string; extname: (p: string) => string }
): BatchFileInfo[] {
  const entries = fsModule.readdirSync(dirPath)
  return entries
    .filter((f) => pathModule.extname(f).toLowerCase() === '.pdf')
    .sort()
    .map((f) => {
      const fullPath = pathModule.join(dirPath, f)
      return {
        path: fullPath,
        name: f,
        sizeBytes: fsModule.statSync(fullPath).size,
      }
    })
}

/**
 * Summarize a batch of extraction results.
 */
export function summarizeBatch(results: BatchResultEntry[]): BatchSummary {
  const total = results.length
  const textSuccess = results.filter((r) => r.textExtracted).length
  const llmSuccess = results.filter((r) => r.llmExtracted).length

  const admissionBreakdown: Record<string, number> = {}
  const displayModeBreakdown: Record<string, number> = {}

  for (const r of results) {
    admissionBreakdown[r.admissionStatus] = (admissionBreakdown[r.admissionStatus] || 0) + 1
    displayModeBreakdown[r.displayMode] = (displayModeBreakdown[r.displayMode] || 0) + 1
  }

  const llmResults = results.filter((r) => r.llmExtracted)
  const avgCov =
    llmResults.length > 0
      ? llmResults.reduce((sum, r) => sum + r.coverageCount, 0) / llmResults.length
      : 0

  return {
    totalFiles: total,
    textSuccess,
    textFailed: total - textSuccess,
    llmSuccess,
    llmFailed: total - llmSuccess,
    admissionBreakdown,
    displayModeBreakdown,
    phraseLeaks: results.filter((r) => !r.phraseClean).length,
    averageCoverages: Math.round(avgCov * 10) / 10,
  }
}
