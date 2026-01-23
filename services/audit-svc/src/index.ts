/**
 * Audit Service
 *
 * Generates compliance audit bundles for OCR pipeline outputs.
 *
 * Features:
 * - Audit bundle generation with all artifacts
 * - Cryptographic checksums (SHA-256)
 * - Pipeline trace logging
 * - Retention policy enforcement
 * - KVKK/GDPR compliance metadata
 */

import crypto from 'crypto'
import type {
  ExtractionResult,
  ReconcileResult,
  NormalizeResult,
  ValidationGateResult,
} from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    auditBucket: process.env.AUDIT_BUCKET || 'audit-bundles',
    artifactBucket: process.env.ARTIFACT_BUCKET || 'ocr-artifacts',
  },
  retention: {
    auditBundleDays: 365 * 7, // 7 years for insurance compliance
    rawOcrDays: 90,
    piiVaultDays: 365 * 2, // 2 years per KVKK
  },
  signing: {
    algorithm: 'sha256',
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface AuditBundleRequest {
  docId: string
  tenantId: string
}

export interface AuditBundle {
  bundleId: string
  docId: string
  tenantId: string
  createdAt: string
  version: string
  artifacts: AuditArtifact[]
  checksums: Record<string, string>
  pipelineTrace: PipelineTrace
  compliance: ComplianceMetadata
  signature: string
}

export interface AuditArtifact {
  id: string
  type: ArtifactType
  key: string
  checksum: string
  size: number
  createdAt: string
  retentionUntil: string
}

export type ArtifactType =
  | 'original_pdf'
  | 'rendered_page'
  | 'ocr_raw'
  | 'reconciled_text'
  | 'normalized_text'
  | 'extracted_fields'
  | 'validation_report'
  | 'pii_vault'

export interface PipelineTrace {
  stages: PipelineStage[]
  totalDurationMs: number
  startedAt: string
  completedAt: string
  workflowId: string
  runId: string
}

export interface PipelineStage {
  name: string
  status: 'completed' | 'failed' | 'skipped'
  durationMs: number
  startedAt: string
  inputs: string[]
  outputs: string[]
  metadata?: Record<string, unknown>
}

export interface ComplianceMetadata {
  kvkkCompliant: boolean
  gdprCompliant: boolean
  piiRedacted: boolean
  piiVaultKey?: string
  consentRecorded: boolean
  dataSubjectId?: string
  processingLawfulBasis: string
  retentionPolicy: {
    category: string
    retentionDays: number
    deleteAfter: string
  }
}

// ============================================================================
// AUDIT BUNDLE GENERATOR
// ============================================================================

export class AuditBundleGenerator {
  /**
   * Generate a complete audit bundle for a document
   */
  async generateBundle(request: AuditBundleRequest): Promise<{
    key: string
    checksums: Record<string, string>
  }> {
    const { docId, tenantId } = request
    const bundleId = `audit-${docId}-${Date.now()}`

    // Collect all artifacts
    const artifacts = await this.collectArtifacts(docId)

    // Generate checksums for all artifacts
    const checksums: Record<string, string> = {}
    for (const artifact of artifacts) {
      checksums[artifact.id] = artifact.checksum
    }

    // Get pipeline trace
    const pipelineTrace = await this.getPipelineTrace(docId)

    // Get compliance metadata
    const compliance = await this.getComplianceMetadata(docId, tenantId)

    // Create bundle
    const bundle: AuditBundle = {
      bundleId,
      docId,
      tenantId,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
      artifacts,
      checksums,
      pipelineTrace,
      compliance,
      signature: '', // Will be set after signing
    }

    // Sign the bundle
    bundle.signature = this.signBundle(bundle)

    // Store the bundle
    const bundleKey = await this.storeBundle(bundle)

    return {
      key: bundleKey,
      checksums,
    }
  }

  /**
   * Collect all artifacts for a document
   */
  private async collectArtifacts(docId: string): Promise<AuditArtifact[]> {
    const artifacts: AuditArtifact[] = []
    const now = new Date()

    // Original PDF
    const pdfKey = `${docId}/original.pdf`
    const pdfExists = await this.artifactExists(pdfKey)
    if (pdfExists) {
      artifacts.push(await this.createArtifact(
        'original_pdf',
        pdfKey,
        config.retention.auditBundleDays
      ))
    }

    // Rendered pages
    for (let page = 1; page <= 20; page++) { // Max 20 pages
      const pageKey = `${docId}/pages/${page}/300.png`
      const exists = await this.artifactExists(pageKey)
      if (exists) {
        artifacts.push(await this.createArtifact(
          'rendered_page',
          pageKey,
          config.retention.rawOcrDays
        ))
      } else {
        break // No more pages
      }
    }

    // OCR raw results
    for (const engine of ['abbyy', 'gcp_docai', 'azure_di', 'tesseract']) {
      const ocrKey = `${docId}/ocr/${engine}/raw.json`
      const exists = await this.artifactExists(ocrKey)
      if (exists) {
        artifacts.push(await this.createArtifact(
          'ocr_raw',
          ocrKey,
          config.retention.rawOcrDays
        ))
      }
    }

    // Reconciled text
    const reconciledKey = `${docId}/reconciled.json`
    if (await this.artifactExists(reconciledKey)) {
      artifacts.push(await this.createArtifact(
        'reconciled_text',
        reconciledKey,
        config.retention.auditBundleDays
      ))
    }

    // Normalized text
    const normalizedKey = `${docId}/normalized.txt`
    if (await this.artifactExists(normalizedKey)) {
      artifacts.push(await this.createArtifact(
        'normalized_text',
        normalizedKey,
        config.retention.auditBundleDays
      ))
    }

    // Extracted fields
    const extractedKey = `${docId}/extracted.json`
    if (await this.artifactExists(extractedKey)) {
      artifacts.push(await this.createArtifact(
        'extracted_fields',
        extractedKey,
        config.retention.auditBundleDays
      ))
    }

    // Validation report
    const validationKey = `${docId}/validation.json`
    if (await this.artifactExists(validationKey)) {
      artifacts.push(await this.createArtifact(
        'validation_report',
        validationKey,
        config.retention.auditBundleDays
      ))
    }

    // PII vault (if exists)
    const piiKey = `${docId}/pii_vault.enc`
    if (await this.artifactExists(piiKey)) {
      artifacts.push(await this.createArtifact(
        'pii_vault',
        piiKey,
        config.retention.piiVaultDays
      ))
    }

    return artifacts
  }

  /**
   * Create an artifact record
   */
  private async createArtifact(
    type: ArtifactType,
    key: string,
    retentionDays: number
  ): Promise<AuditArtifact> {
    const data = await this.fetchArtifact(key)
    const checksum = this.calculateChecksum(data)
    const now = new Date()

    return {
      id: `artifact-${crypto.randomUUID()}`,
      type,
      key,
      checksum,
      size: data.length,
      createdAt: now.toISOString(),
      retentionUntil: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  /**
   * Get pipeline trace from logs
   */
  private async getPipelineTrace(docId: string): Promise<PipelineTrace> {
    // In production, this would fetch from a logging system like Elasticsearch
    // or from Temporal workflow history

    const now = new Date()
    const startTime = new Date(now.getTime() - 30000) // 30 seconds ago

    return {
      stages: [
        {
          name: 'ingest',
          status: 'completed',
          durationMs: 500,
          startedAt: startTime.toISOString(),
          inputs: ['original.pdf'],
          outputs: ['ingest_complete'],
        },
        {
          name: 'detect',
          status: 'completed',
          durationMs: 2000,
          startedAt: new Date(startTime.getTime() + 500).toISOString(),
          inputs: ['ingest_complete'],
          outputs: ['locale:tr-TR', 'policyType:motor_kasko'],
        },
        {
          name: 'render',
          status: 'completed',
          durationMs: 5000,
          startedAt: new Date(startTime.getTime() + 2500).toISOString(),
          inputs: ['original.pdf'],
          outputs: ['pages/1/300.png', 'pages/2/300.png'],
        },
        {
          name: 'preprocess',
          status: 'completed',
          durationMs: 3000,
          startedAt: new Date(startTime.getTime() + 7500).toISOString(),
          inputs: ['pages/*/300.png'],
          outputs: ['pages/*/binarized.png', 'pages/*/deskewed.png'],
        },
        {
          name: 'layout',
          status: 'completed',
          durationMs: 2000,
          startedAt: new Date(startTime.getTime() + 10500).toISOString(),
          inputs: ['pages/*/300.png'],
          outputs: ['regions.json'],
        },
        {
          name: 'ocr',
          status: 'completed',
          durationMs: 8000,
          startedAt: new Date(startTime.getTime() + 12500).toISOString(),
          inputs: ['pages/*/binarized.png'],
          outputs: ['ocr/abbyy/raw.json', 'ocr/gcp_docai/raw.json'],
          metadata: { engines: ['abbyy', 'gcp_docai'] },
        },
        {
          name: 'reconcile',
          status: 'completed',
          durationMs: 1500,
          startedAt: new Date(startTime.getTime() + 20500).toISOString(),
          inputs: ['ocr/*/raw.json'],
          outputs: ['reconciled.json'],
          metadata: { agreementRatio: 0.92 },
        },
        {
          name: 'normalize',
          status: 'completed',
          durationMs: 1000,
          startedAt: new Date(startTime.getTime() + 22000).toISOString(),
          inputs: ['reconciled.json'],
          outputs: ['normalized.txt'],
          metadata: { transformCount: 45 },
        },
        {
          name: 'validate',
          status: 'completed',
          durationMs: 500,
          startedAt: new Date(startTime.getTime() + 23000).toISOString(),
          inputs: ['normalized.txt'],
          outputs: ['validation.json'],
          metadata: { qualityScore: 0.89 },
        },
        {
          name: 'extract',
          status: 'completed',
          durationMs: 2000,
          startedAt: new Date(startTime.getTime() + 23500).toISOString(),
          inputs: ['normalized.txt'],
          outputs: ['extracted.json'],
          metadata: { fieldCount: 18 },
        },
      ],
      totalDurationMs: 25500,
      startedAt: startTime.toISOString(),
      completedAt: now.toISOString(),
      workflowId: `ocr-pipeline-${docId}`,
      runId: crypto.randomUUID(),
    }
  }

  /**
   * Get compliance metadata
   */
  private async getComplianceMetadata(
    docId: string,
    tenantId: string
  ): Promise<ComplianceMetadata> {
    // In production, fetch from compliance database
    const now = new Date()

    return {
      kvkkCompliant: true,
      gdprCompliant: true,
      piiRedacted: true,
      piiVaultKey: `${docId}/pii_vault.enc`,
      consentRecorded: true,
      dataSubjectId: 'anon', // Would be actual ID in production
      processingLawfulBasis: 'legitimate_interest', // or 'consent', 'contract', etc.
      retentionPolicy: {
        category: 'insurance_document',
        retentionDays: config.retention.auditBundleDays,
        deleteAfter: new Date(
          now.getTime() + config.retention.auditBundleDays * 24 * 60 * 60 * 1000
        ).toISOString(),
      },
    }
  }

  /**
   * Sign the bundle
   */
  private signBundle(bundle: Omit<AuditBundle, 'signature'>): string {
    // In production, use asymmetric signing with HSM
    const content = JSON.stringify({
      bundleId: bundle.bundleId,
      docId: bundle.docId,
      tenantId: bundle.tenantId,
      createdAt: bundle.createdAt,
      checksums: bundle.checksums,
    })

    return crypto
      .createHmac(config.signing.algorithm, process.env.SIGNING_KEY || 'dev-key')
      .update(content)
      .digest('hex')
  }

  /**
   * Calculate SHA-256 checksum
   */
  private calculateChecksum(data: Buffer): string {
    return crypto
      .createHash(config.signing.algorithm)
      .update(data)
      .digest('hex')
  }

  /**
   * Store the audit bundle
   */
  private async storeBundle(bundle: AuditBundle): Promise<string> {
    const key = `${bundle.tenantId}/${bundle.docId}/${bundle.bundleId}.json`
    const url = `${config.storage.endpoint}/${config.storage.auditBucket}/${key}`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.getStorageHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bundle, null, 2),
    })

    if (!response.ok) {
      throw new Error(`Failed to store audit bundle: ${response.statusText}`)
    }

    return key
  }

  /**
   * Verify a bundle's integrity
   */
  async verifyBundle(bundleKey: string): Promise<{
    valid: boolean
    errors: string[]
  }> {
    const errors: string[] = []

    // Fetch bundle
    const bundleData = await this.fetchArtifact(bundleKey)
    const bundle = JSON.parse(bundleData.toString()) as AuditBundle

    // Verify signature
    const expectedSignature = this.signBundle(bundle)
    if (bundle.signature !== expectedSignature) {
      errors.push('Bundle signature is invalid')
    }

    // Verify artifact checksums
    for (const artifact of bundle.artifacts) {
      try {
        const data = await this.fetchArtifact(artifact.key)
        const actualChecksum = this.calculateChecksum(data)
        if (actualChecksum !== artifact.checksum) {
          errors.push(`Checksum mismatch for ${artifact.key}`)
        }
      } catch (error) {
        errors.push(`Failed to verify ${artifact.key}: ${(error as Error).message}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  private async artifactExists(key: string): Promise<boolean> {
    const url = `${config.storage.endpoint}/${config.storage.artifactBucket}/${key}`

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: this.getStorageHeaders(),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async fetchArtifact(key: string): Promise<Buffer> {
    // Determine bucket based on key pattern
    const bucket = key.includes('audit-') ? config.storage.auditBucket : config.storage.artifactBucket
    const url = `${config.storage.endpoint}/${bucket}/${key}`

    const response = await fetch(url, {
      headers: this.getStorageHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch artifact ${key}: ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  private getStorageHeaders(): Record<string, string> {
    const auth = Buffer.from(
      `${config.storage.accessKey}:${config.storage.secretKey}`
    ).toString('base64')

    return {
      Authorization: `Basic ${auth}`,
    }
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

import express from 'express'

const app = express()
app.use(express.json())

const generator = new AuditBundleGenerator()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    retention: config.retention,
  })
})

// Generate audit bundle
app.post('/bundle', async (req, res) => {
  try {
    const request = req.body as AuditBundleRequest
    const result = await generator.generateBundle(request)
    res.json(result)
  } catch (error) {
    console.error('[Audit] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Verify audit bundle
app.post('/verify', async (req, res) => {
  try {
    const { bundleKey } = req.body
    const result = await generator.verifyBundle(bundleKey)
    res.json(result)
  } catch (error) {
    console.error('[Audit] Verify error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Get bundle
app.get('/bundle/:tenantId/:docId/:bundleId', async (req, res) => {
  try {
    const { tenantId, docId, bundleId } = req.params
    const key = `${tenantId}/${docId}/${bundleId}.json`

    const response = await fetch(
      `${config.storage.endpoint}/${config.storage.auditBucket}/${key}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${config.storage.accessKey}:${config.storage.secretKey}`).toString('base64')}` } }
    )

    if (!response.ok) {
      return res.status(404).json({ error: 'Bundle not found' })
    }

    const bundle = await response.json()
    res.json(bundle)
  } catch (error) {
    console.error('[Audit] Get bundle error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

const PORT = process.env.PORT || 4011

app.listen(PORT, () => {
  console.log(`[Audit Service] Listening on port ${PORT}`)
})

export { AuditBundleGenerator }
