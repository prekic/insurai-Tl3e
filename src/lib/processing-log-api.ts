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

    const data = await response.json()
    if (data.success) {
      return data.data
    }
    console.error('[ProcessingLogAPI] Create failed:', data.error)
    return null
  } catch (error) {
    console.error('[ProcessingLogAPI] Create error:', error)
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
  try {
    const response = await fetch(`${API_BASE}/api/ai/processing-log/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    const data = await response.json()
    if (data.success) {
      return data.data
    }
    console.error('[ProcessingLogAPI] Update failed:', data.error)
    return null
  } catch (error) {
    console.error('[ProcessingLogAPI] Update error:', error)
    return null
  }
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
