/**
 * Processing Log API Client
 *
 * Client-side API for persisting and retrieving processing logs.
 */

import env from './env'
import type { DocumentProcessingLog, ProcessingStageRecord } from '@/types/processing-log'

const API_BASE = env.proxyUrl || ''

/**
 * Create a new processing log
 */
export async function createProcessingLog(
  log: Omit<DocumentProcessingLog, 'id' | 'created_at' | 'updated_at'>
): Promise<DocumentProcessingLog | null> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/processing-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    })

    if (!response.ok) {
      console.error('[ProcessingLogAPI] Create HTTP error:', response.status, response.statusText)
      return null
    }

    const data = await response.json()
    if (data.success) {
      return data.data
    }
    console.error('[ProcessingLogAPI] Create failed:', data.error, { documentId: log.document_id })
    return null
  } catch (error) {
    console.error('[ProcessingLogAPI] Create error:', error, {
      documentId: log.document_id,
      apiBase: API_BASE,
    })
    return null
  }
}

/**
 * Update an existing processing log
 */
export async function updateProcessingLog(
  documentId: string,
  updates: Partial<DocumentProcessingLog>
): Promise<DocumentProcessingLog | null> {
  const maxRetries = 3
  const baseDelayMs = 500 // Exponential: 500ms → 1s → 2s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/api/ai/processing-log/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      // Retry with exponential backoff on 404 — the CREATE may not have committed yet
      if (response.status === 404 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) // 500ms → 1000ms → 2000ms
        console.warn(
          `[ProcessingLogAPI] Update 404 for ${documentId}, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (!response.ok) {
        console.error(
          '[ProcessingLogAPI] Update HTTP error:',
          response.status,
          response.statusText,
          {
            documentId,
          }
        )
        return null
      }

      const data = await response.json()
      if (data.success) {
        return data.data
      }
      console.error('[ProcessingLogAPI] Update failed:', data.error, { documentId })
      return null
    } catch (error) {
      console.error('[ProcessingLogAPI] Update error:', error, { documentId })
      return null
    }
  }

  return null
}

/**
 * Add a stage to a processing log
 */
export async function addProcessingStage(
  documentId: string,
  stage: ProcessingStageRecord
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/processing-log/${documentId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stage),
    })

    const data = await response.json()
    return data.success
  } catch (error) {
    console.error('[ProcessingLogAPI] Add stage error:', error)
    return false
  }
}

/**
 * Get a processing log by document ID
 */
export async function getProcessingLog(documentId: string): Promise<DocumentProcessingLog | null> {
  try {
    const response = await fetch(`${API_BASE}/api/ai/processing-log/${documentId}`)

    const data = await response.json()
    if (data.success) {
      return data.data
    }
    return null
  } catch (error) {
    console.error('[ProcessingLogAPI] Get error:', error)
    return null
  }
}
