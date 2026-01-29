/**
 * Reconcile Service
 *
 * Bounding-box alignment + voting + dispute detection for ensemble OCR.
 *
 * Features:
 * - Aligns tokens from multiple OCR engines by bounding box overlap
 * - Votes on correct text using confidence-weighted majority
 * - Detects disputes (disagreements between engines)
 * - Triggers targeted re-OCR for disputed regions
 */

import type {
  OCRToken,
  OCREngine,
  OCRResult,
  ReconcileResult,
  ReconciledToken,
  ReconcileDecision,
  DisputedRegion,
  ReconcileCandidate,
  BoundingBox,
} from '@insurai/types'

// ============================================================================
// TYPES
// ============================================================================

export interface ReconcileOptions {
  docId: string
  // Minimum confidence for a token to be considered
  minConfidence?: number
  // Minimum IoU (Intersection over Union) for bbox alignment
  minIoU?: number
  // Minimum agreement ratio to accept without dispute
  agreementThreshold?: number
  // Weight by engine (some engines may be more reliable)
  engineWeights?: Partial<Record<OCREngine, number>>
  // Debug mode
  debug?: boolean
}

export interface AlignedTokenGroup {
  bbox: BoundingBox
  candidates: Array<{
    engine: OCREngine
    token: OCRToken
  }>
  pageNo: number
  regionId: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<ReconcileOptions, 'docId'>> = {
  minConfidence: 0.3,
  minIoU: 0.5,
  agreementThreshold: 0.7,
  engineWeights: {
    abbyy: 1.2,      // ABBYY is generally more accurate
    gcp_docai: 1.0,
    azure_di: 1.0,
    tesseract: 0.8,  // Tesseract is less reliable
  },
  debug: false,
}

// ============================================================================
// MAIN RECONCILER CLASS
// ============================================================================

export class Reconciler {
  private options: Required<ReconcileOptions>

  constructor(options: ReconcileOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      engineWeights: {
        ...DEFAULT_OPTIONS.engineWeights,
        ...options.engineWeights,
      },
    } as Required<ReconcileOptions>
  }

  /**
   * Reconcile OCR results from multiple engines
   */
  reconcile(results: OCRResult[]): ReconcileResult {
    if (results.length === 0) {
      return {
        docId: this.options.docId,
        finalTokens: [],
        disputedRegions: [],
        agreementRatio: 1.0,
        needsTargetedReOCR: false,
        targetedRegions: [],
      }
    }

    // If only one engine, just use its output directly
    if (results.length === 1) {
      return this.singleEngineResult(results[0])
    }

    // Step 1: Collect all tokens from all engines
    const allTokens = this.collectTokens(results)

    // Step 2: Align tokens by bounding box overlap
    const alignedGroups = this.alignTokensByBbox(allTokens)

    // Step 3: Vote on each aligned group
    const decisions: ReconcileDecision[] = []
    const reconciledTokens: ReconciledToken[] = []
    const disputedRegions: DisputedRegion[] = []

    for (const group of alignedGroups) {
      const decision = this.voteOnGroup(group)
      decisions.push(decision)

      // Create reconciled token
      reconciledTokens.push({
        id: `token-${reconciledTokens.length}`,
        text: decision.chosenText,
        bbox: group.bbox,
        confidence: decision.confidence,
        sourceEngines: group.candidates.map(c => c.engine),
        pageNo: group.pageNo,
        regionId: group.regionId,
        lineIndex: 0, // Would need more context
        wordIndex: reconciledTokens.length,
        isDisputed: decision.isDisputed,
      })

      // Track disputed regions
      if (decision.isDisputed) {
        const existing = disputedRegions.find(d => d.regionId === group.regionId)
        if (!existing) {
          disputedRegions.push({
            regionId: group.regionId,
            pageNo: group.pageNo,
            bbox: this.expandBbox(group.bbox, 50), // Expand for re-OCR context
            candidates: decision.candidates,
            disputeType: this.classifyDispute(decision.candidates),
            severity: this.classifyDisputeSeverity(decision),
          })
        }
      }
    }

    // Calculate agreement ratio
    const totalGroups = alignedGroups.length
    const disputedCount = decisions.filter(d => d.isDisputed).length
    const agreementRatio = totalGroups > 0 ? (totalGroups - disputedCount) / totalGroups : 1.0

    // Determine if targeted re-OCR is needed
    const needsTargetedReOCR = agreementRatio < this.options.agreementThreshold
    const targetedRegions = needsTargetedReOCR
      ? [...new Set(disputedRegions.map(d => d.regionId))]
      : []

    if (this.options.debug) {
      console.warn(`[Reconciler] ${this.options.docId}:`)
      console.warn(`  - Engines: ${results.map(r => r.engine).join(', ')}`)
      console.warn(`  - Total groups: ${totalGroups}`)
      console.warn(`  - Disputed: ${disputedCount}`)
      console.warn(`  - Agreement ratio: ${(agreementRatio * 100).toFixed(1)}%`)
      console.warn(`  - Needs targeted re-OCR: ${needsTargetedReOCR}`)
    }

    return {
      docId: this.options.docId,
      finalTokens: reconciledTokens,
      disputedRegions,
      agreementRatio,
      needsTargetedReOCR,
      targetedRegions,
    }
  }

  // ============================================================================
  // STEP 1: COLLECT TOKENS
  // ============================================================================

  private collectTokens(results: OCRResult[]): Array<{ engine: OCREngine; token: OCRToken }> {
    const tokens: Array<{ engine: OCREngine; token: OCRToken }> = []

    for (const result of results) {
      for (const token of result.tokens) {
        if (token.confidence >= this.options.minConfidence) {
          tokens.push({ engine: result.engine, token })
        }
      }
    }

    return tokens
  }

  // ============================================================================
  // STEP 2: ALIGN TOKENS BY BOUNDING BOX
  // ============================================================================

  private alignTokensByBbox(
    tokens: Array<{ engine: OCREngine; token: OCRToken }>
  ): AlignedTokenGroup[] {
    const groups: AlignedTokenGroup[] = []
    const assigned = new Set<string>()

    // Sort tokens by position (top-left to bottom-right)
    const sorted = [...tokens].sort((a, b) => {
      const aPos = a.token.bbox.y * 10000 + a.token.bbox.x
      const bPos = b.token.bbox.y * 10000 + b.token.bbox.x
      return aPos - bPos
    })

    for (const item of sorted) {
      const key = `${item.engine}:${item.token.id}`
      if (assigned.has(key)) continue

      // Find overlapping tokens from other engines
      const candidates: Array<{ engine: OCREngine; token: OCRToken }> = [item]
      assigned.add(key)

      for (const other of sorted) {
        const otherKey = `${other.engine}:${other.token.id}`
        if (assigned.has(otherKey)) continue
        if (other.engine === item.engine) continue // Same engine, skip
        if (other.token.pageNo !== item.token.pageNo) continue // Different page

        // Check bbox overlap
        const iou = this.calculateIoU(item.token.bbox, other.token.bbox)
        if (iou >= this.options.minIoU) {
          candidates.push(other)
          assigned.add(otherKey)
        }
      }

      // Create aligned group
      const mergedBbox = this.mergeBboxes(candidates.map(c => c.token.bbox))
      groups.push({
        bbox: mergedBbox,
        candidates,
        pageNo: item.token.pageNo,
        regionId: item.token.regionId,
      })
    }

    return groups
  }

  // ============================================================================
  // STEP 3: VOTE ON ALIGNED GROUPS
  // ============================================================================

  private voteOnGroup(group: AlignedTokenGroup): ReconcileDecision {
    const candidates = group.candidates

    // If only one candidate, no dispute
    if (candidates.length === 1) {
      const c = candidates[0]
      return {
        docId: this.options.docId,
        pageNo: group.pageNo,
        regionId: group.regionId,
        tokenSpanId: `span-${Date.now()}`,
        chosenText: c.token.text,
        candidates: [{
          engine: c.engine,
          text: c.token.text,
          confidence: c.token.confidence,
          bbox: c.token.bbox,
        }],
        ruleApplied: 'single_engine',
        isDisputed: false,
        confidence: c.token.confidence,
      }
    }

    // Normalize texts for comparison
    const textVotes: Map<string, {
      text: string
      totalWeight: number
      engines: OCREngine[]
      candidates: ReconcileCandidate[]
    }> = new Map()

    for (const c of candidates) {
      const normalizedText = this.normalizeForComparison(c.token.text)
      const weight = (c.token.confidence) * (this.options.engineWeights[c.engine] || 1.0)

      const existing = textVotes.get(normalizedText)
      if (existing) {
        existing.totalWeight += weight
        existing.engines.push(c.engine)
        existing.candidates.push({
          engine: c.engine,
          text: c.token.text,
          confidence: c.token.confidence,
          bbox: c.token.bbox,
        })
      } else {
        textVotes.set(normalizedText, {
          text: c.token.text, // Keep original (non-normalized) text
          totalWeight: weight,
          engines: [c.engine],
          candidates: [{
            engine: c.engine,
            text: c.token.text,
            confidence: c.token.confidence,
            bbox: c.token.bbox,
          }],
        })
      }
    }

    // Find winner
    let winner: { text: string; totalWeight: number; engines: OCREngine[]; candidates: ReconcileCandidate[] } | null = null
    let totalWeight = 0

    for (const vote of textVotes.values()) {
      totalWeight += vote.totalWeight
      if (!winner || vote.totalWeight > winner.totalWeight) {
        winner = vote
      }
    }

    // Determine if this is a dispute
    const winnerRatio = winner ? winner.totalWeight / totalWeight : 0
    const isDisputed = textVotes.size > 1 && winnerRatio < 0.8

    // Determine rule applied
    let ruleApplied = 'majority_vote'
    if (textVotes.size === 1) {
      ruleApplied = 'unanimous'
    } else if (isDisputed) {
      ruleApplied = 'disputed_majority'
    }

    // Collect all candidates for audit
    const allCandidates: ReconcileCandidate[] = []
    for (const vote of textVotes.values()) {
      allCandidates.push(...vote.candidates)
    }

    return {
      docId: this.options.docId,
      pageNo: group.pageNo,
      regionId: group.regionId,
      tokenSpanId: `span-${Date.now()}`,
      chosenText: winner?.text || '',
      candidates: allCandidates,
      ruleApplied,
      isDisputed,
      disputeReason: isDisputed ? `Multiple interpretations: ${[...textVotes.keys()].join(' vs ')}` : undefined,
      confidence: winner ? winner.totalWeight / candidates.length : 0,
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private singleEngineResult(result: OCRResult): ReconcileResult {
    // Filter tokens by minimum confidence
    const filteredTokens = result.tokens.filter(
      token => token.confidence >= this.options.minConfidence
    )

    const tokens: ReconciledToken[] = filteredTokens.map((token, i) => ({
      id: `token-${i}`,
      text: token.text,
      bbox: token.bbox,
      confidence: token.confidence,
      sourceEngines: [result.engine],
      pageNo: token.pageNo,
      regionId: token.regionId,
      lineIndex: token.lineIndex,
      wordIndex: token.wordIndex,
      isDisputed: false,
    }))

    return {
      docId: this.options.docId,
      finalTokens: tokens,
      disputedRegions: [],
      agreementRatio: 1.0,
      needsTargetedReOCR: false,
      targetedRegions: [],
    }
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private calculateIoU(a: BoundingBox, b: BoundingBox): number {
    // Calculate Intersection over Union for two bounding boxes
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    const x2 = Math.min(a.x + a.width, b.x + b.width)
    const y2 = Math.min(a.y + a.height, b.y + b.height)

    if (x2 < x1 || y2 < y1) {
      return 0 // No intersection
    }

    const intersection = (x2 - x1) * (y2 - y1)
    const areaA = a.width * a.height
    const areaB = b.width * b.height
    const union = areaA + areaB - intersection

    return union > 0 ? intersection / union : 0
  }

  private mergeBboxes(boxes: BoundingBox[]): BoundingBox {
    if (boxes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const box of boxes) {
      minX = Math.min(minX, box.x)
      minY = Math.min(minY, box.y)
      maxX = Math.max(maxX, box.x + box.width)
      maxY = Math.max(maxY, box.y + box.height)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  private expandBbox(bbox: BoundingBox, margin: number): BoundingBox {
    return {
      x: Math.max(0, bbox.x - margin),
      y: Math.max(0, bbox.y - margin),
      width: bbox.width + margin * 2,
      height: bbox.height + margin * 2,
    }
  }

  private classifyDispute(candidates: ReconcileCandidate[]): DisputedRegion['disputeType'] {
    const texts = candidates.map(c => c.text)

    // Check if it's a character-level mismatch (same length, different chars)
    const lengths = texts.map(t => t.length)
    if (lengths.every(l => l === lengths[0])) {
      return 'character_mismatch'
    }

    // Check if one text is a subset of another (extra/missing content)
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (texts[i].includes(texts[j]) || texts[j].includes(texts[i])) {
          return texts[i].length > texts[j].length ? 'extra_content' : 'missing_content'
        }
      }
    }

    return 'word_mismatch'
  }

  private classifyDisputeSeverity(decision: ReconcileDecision): DisputedRegion['severity'] {
    // Higher confidence difference = lower severity (clearer winner)
    // More candidates = higher severity (more disagreement)

    if (decision.confidence > 0.9) return 'low'
    if (decision.confidence > 0.7) return 'medium'
    if (decision.confidence > 0.5) return 'high'
    return 'critical'
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick reconcile with default options
 */
export function reconcileResults(
  docId: string,
  results: OCRResult[],
  options?: Partial<ReconcileOptions>
): ReconcileResult {
  const reconciler = new Reconciler({ docId, ...options })
  return reconciler.reconcile(results)
}

// ============================================================================
// EXPORTS
// ============================================================================

// Reconciler class is already exported at definition
export type { ReconcileOptions, AlignedTokenGroup }
