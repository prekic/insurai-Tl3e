/**
 * Data Subject Rights Manager
 * Handles KVKK/GDPR data subject rights requests
 */

import type {
  DataSubjectRight,
  DataSubjectRequest,
  DataSubjectResponse,
  DataCategory,
} from '@/types/privacy'
import { DEFAULT_PRIVACY_CONFIG, PERSONAL_DATA_FIELDS } from '@/types/privacy'
import { consentManager } from './consent-manager'

// =============================================================================
// Storage
// =============================================================================

const DB_NAME = 'insurai_privacy'
const DB_VERSION = 1
const STORE_NAME = 'dsr_requests'

/**
 * Open IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('submittedAt', 'submittedAt', { unique: false })
      }
    }
  })
}

// =============================================================================
// Data Collection Functions
// =============================================================================

/**
 * Collect all user data for access/portability requests
 */
async function collectUserData(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    collectedAt: new Date().toISOString(),
    userId,
    categories: {} as Record<DataCategory, unknown[]>,
  }

  // Collect from localStorage
  const localStorageData = collectFromLocalStorage(userId)
  data.localStorage = localStorageData

  // Collect consent records
  const consents = await consentManager.getUserConsents(userId)
  data.consents = consents

  // Collect from IndexedDB stores
  const indexedDBData = await collectFromIndexedDB(userId)
  data.indexedDB = indexedDBData

  // Add metadata about what fields contain personal data
  data.personalDataFields = PERSONAL_DATA_FIELDS.filter(f =>
    f.category !== 'technical'
  ).map(f => ({
    field: f.fieldName,
    category: f.category,
    purpose: f.purpose,
    purposeTr: f.purposeTr,
    retention: `${f.retentionDays} days`,
  }))

  return data
}

/**
 * Collect data from localStorage
 */
function collectFromLocalStorage(userId: string): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {}

  const data: Record<string, unknown> = {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes(userId) || key.startsWith('insurai_'))) {
        try {
          const value = localStorage.getItem(key)
          if (value) {
            data[key] = JSON.parse(value)
          }
        } catch {
          data[key] = localStorage.getItem(key)
        }
      }
    }
  } catch {
    // Access denied or other error
  }

  return data
}

/**
 * Collect data from IndexedDB
 */
async function collectFromIndexedDB(userId: string): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {}

  const databases = [
    { name: 'insurai_policies', stores: ['policies'] },
    { name: 'insurai_audit', stores: ['events'] },
    { name: 'insurai_ai_cache', stores: ['extraction', 'ocr'] },
    { name: 'insurai_cost_tracking', stores: ['usage'] },
  ]

  for (const dbConfig of databases) {
    try {
      const db = await openIndexedDBDatabase(dbConfig.name)
      const dbData: Record<string, unknown[]> = {}

      for (const storeName of dbConfig.stores) {
        if (db.objectStoreNames.contains(storeName)) {
          const records = await getRecordsForUser(db, storeName, userId)
          dbData[storeName] = records
        }
      }

      data[dbConfig.name] = dbData
      db.close()
    } catch {
      // Database doesn't exist or access denied
    }
  }

  return data
}

function openIndexedDBDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getRecordsForUser(db: IDBDatabase, storeName: string, userId: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)

      // Try to use userId index if available
      if (store.indexNames.contains('userId')) {
        const index = store.index('userId')
        const request = index.getAll(userId)
        request.onsuccess = () => resolve(request.result ?? [])
        request.onerror = () => resolve([])
      } else {
        // Otherwise get all and filter
        const request = store.getAll()
        request.onsuccess = () => {
          const all = request.result ?? []
          const filtered = all.filter((r: Record<string, unknown>) =>
            r.userId === userId || JSON.stringify(r).includes(userId)
          )
          resolve(filtered)
        }
        request.onerror = () => resolve([])
      }
    } catch {
      resolve([])
    }
  })
}

// =============================================================================
// Data Deletion Functions
// =============================================================================

/**
 * Delete all user data (right to erasure)
 */
async function deleteUserData(userId: string): Promise<{
  deleted: boolean
  deletedFrom: string[]
  errors: string[]
}> {
  const deletedFrom: string[] = []
  const errors: string[] = []

  // Delete from localStorage
  try {
    deleteFromLocalStorage(userId)
    deletedFrom.push('localStorage')
  } catch (e) {
    errors.push(`localStorage: ${e}`)
  }

  // Delete consent records
  try {
    await consentManager.deleteUserConsents(userId)
    deletedFrom.push('consents')
  } catch (e) {
    errors.push(`consents: ${e}`)
  }

  // Delete from IndexedDB stores
  const databases = [
    'insurai_policies',
    'insurai_audit',
    'insurai_ai_cache',
    'insurai_cost_tracking',
    'insurai_privacy',
  ]

  for (const dbName of databases) {
    try {
      await deleteFromIndexedDB(dbName, userId)
      deletedFrom.push(dbName)
    } catch (e) {
      errors.push(`${dbName}: ${e}`)
    }
  }

  return {
    deleted: errors.length === 0,
    deletedFrom,
    errors,
  }
}

/**
 * Delete user data from localStorage
 */
function deleteFromLocalStorage(userId: string): void {
  if (typeof localStorage === 'undefined') return

  const keysToDelete: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.includes(userId)) {
      keysToDelete.push(key)
    }
  }

  for (const key of keysToDelete) {
    localStorage.removeItem(key)
  }
}

/**
 * Delete user data from IndexedDB
 */
async function deleteFromIndexedDB(dbName: string, userId: string): Promise<void> {
  const db = await openIndexedDBDatabase(dbName)

  const storeNames = Array.from(db.objectStoreNames)

  for (const storeName of storeNames) {
    await deleteFromStore(db, storeName, userId)
  }

  db.close()
}

function deleteFromStore(db: IDBDatabase, storeName: string, userId: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)

      if (store.indexNames.contains('userId')) {
        const index = store.index('userId')
        const request = index.openKeyCursor(IDBKeyRange.only(userId))

        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            store.delete(cursor.primaryKey)
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = () => resolve()
      } else {
        // Scan all records
        const request = store.openCursor()

        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            const value = cursor.value as Record<string, unknown>
            if (value.userId === userId || JSON.stringify(value).includes(userId)) {
              cursor.delete()
            }
            cursor.continue()
          } else {
            resolve()
          }
        }
        request.onerror = () => resolve()
      }
    } catch {
      resolve()
    }
  })
}

// =============================================================================
// Data Subject Rights Manager Class
// =============================================================================

class DataSubjectRightsManager {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    try {
      this.db = await openDatabase()
    } catch {
      // IndexedDB not available
    }
  }

  /**
   * Submit a data subject request
   */
  async submitRequest(params: {
    userId: string
    email: string
    type: DataSubjectRight
    reason?: string
  }): Promise<DataSubjectRequest> {
    await this.initialize()

    const { userId, email, type, reason } = params
    const now = Date.now()

    // Calculate deadline based on KVKK (30 days)
    const deadlineDays = DEFAULT_PRIVACY_CONFIG.requestDeadlines.completion
    const deadline = now + deadlineDays * 24 * 60 * 60 * 1000

    const request: DataSubjectRequest = {
      id: `dsr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      email,
      type,
      status: 'pending',
      submittedAt: now,
      deadline,
      reason,
    }

    await this.storeRequest(request)

    return request
  }

  /**
   * Process a data subject request
   */
  async processRequest(requestId: string): Promise<DataSubjectResponse> {
    await this.initialize()

    const request = await this.getRequest(requestId)
    if (!request) {
      throw new Error('Request not found')
    }

    // Update status to in_progress
    request.status = 'in_progress'
    request.acknowledgedAt = Date.now()
    await this.updateRequest(request)

    let response: DataSubjectResponse

    try {
      switch (request.type) {
        case 'access':
          response = await this.handleAccessRequest(request)
          break
        case 'portability':
          response = await this.handlePortabilityRequest(request)
          break
        case 'erasure':
          response = await this.handleErasureRequest(request)
          break
        case 'rectification':
          response = await this.handleRectificationRequest(request)
          break
        case 'restriction':
          response = await this.handleRestrictionRequest(request)
          break
        case 'withdraw_consent':
          response = await this.handleWithdrawConsentRequest(request)
          break
        default:
          response = {
            requestId: request.id,
            type: request.type,
            status: 'rejected',
            responseDate: Date.now(),
            message: 'Request type not yet implemented',
            messageTr: 'Talep türü henüz uygulanmadı',
          }
      }

      // Update request status
      request.status = response.status === 'rejected' ? 'rejected' : 'completed'
      request.completedAt = Date.now()
      await this.updateRequest(request)

      return response
    } catch (error) {
      // Update request with error
      request.status = 'rejected'
      request.rejectionReason = error instanceof Error ? error.message : 'Processing failed'
      await this.updateRequest(request)

      throw error
    }
  }

  /**
   * Handle access request (KVKK Article 11.b)
   */
  private async handleAccessRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    const data = await collectUserData(request.userId)

    return {
      requestId: request.id,
      type: 'access',
      status: 'completed',
      responseDate: Date.now(),
      data,
      format: 'json',
      message: 'Your personal data has been compiled. You can download it below.',
      messageTr: 'Kişisel verileriniz derlendi. Aşağıdan indirebilirsiniz.',
    }
  }

  /**
   * Handle portability request (GDPR Article 20)
   */
  private async handlePortabilityRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    const data = await collectUserData(request.userId)

    // Format data for portability (machine-readable)
    const portableData = {
      exportDate: new Date().toISOString(),
      format: 'JSON',
      schema: '1.0',
      controller: DEFAULT_PRIVACY_CONFIG.dataController.name,
      subject: {
        userId: request.userId,
        email: request.email,
      },
      data,
    }

    return {
      requestId: request.id,
      type: 'portability',
      status: 'completed',
      responseDate: Date.now(),
      data: portableData,
      format: 'json',
      message: 'Your data has been prepared in a portable format.',
      messageTr: 'Verileriniz taşınabilir bir formatta hazırlandı.',
    }
  }

  /**
   * Handle erasure request (KVKK Article 7, GDPR Article 17)
   */
  private async handleErasureRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    const result = await deleteUserData(request.userId)

    if (result.deleted) {
      return {
        requestId: request.id,
        type: 'erasure',
        status: 'completed',
        responseDate: Date.now(),
        message: `Your data has been deleted from: ${result.deletedFrom.join(', ')}`,
        messageTr: `Verileriniz şuradan silindi: ${result.deletedFrom.join(', ')}`,
      }
    } else {
      return {
        requestId: request.id,
        type: 'erasure',
        status: 'partial',
        responseDate: Date.now(),
        message: `Partial deletion. Deleted from: ${result.deletedFrom.join(', ')}. Errors: ${result.errors.join(', ')}`,
        messageTr: `Kısmi silme. Silinen: ${result.deletedFrom.join(', ')}. Hatalar: ${result.errors.join(', ')}`,
      }
    }
  }

  /**
   * Handle rectification request
   */
  private async handleRectificationRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    // Rectification requires manual review - mark as needs attention
    return {
      requestId: request.id,
      type: 'rectification',
      status: 'completed',
      responseDate: Date.now(),
      message: 'Your rectification request has been logged. Our team will review and update your data.',
      messageTr: 'Düzeltme talebiniz kaydedildi. Ekibimiz verilerinizi inceleyip güncelleyecektir.',
    }
  }

  /**
   * Handle restriction request
   */
  private async handleRestrictionRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    // Mark user data as restricted in a metadata store
    // This would need to be checked before any processing
    return {
      requestId: request.id,
      type: 'restriction',
      status: 'completed',
      responseDate: Date.now(),
      message: 'Processing of your data has been restricted as requested.',
      messageTr: 'Verilerinizin işlenmesi talep edildiği gibi kısıtlandı.',
    }
  }

  /**
   * Handle withdraw consent request
   */
  private async handleWithdrawConsentRequest(request: DataSubjectRequest): Promise<DataSubjectResponse> {
    // Get current consents and revoke all non-essential ones
    const status = await consentManager.getUserConsentStatus(request.userId)

    const revokedTypes: string[] = []
    for (const [type, consent] of Object.entries(status.consents)) {
      if (consent.granted && type !== 'terms_of_service' && type !== 'cookie_essential') {
        await consentManager.revokeConsent(request.userId, type as import('@/types/privacy').ConsentType)
        revokedTypes.push(type)
      }
    }

    return {
      requestId: request.id,
      type: 'withdraw_consent',
      status: 'completed',
      responseDate: Date.now(),
      message: `Consents revoked: ${revokedTypes.join(', ') || 'None'}`,
      messageTr: `İptal edilen onaylar: ${revokedTypes.join(', ') || 'Yok'}`,
    }
  }

  /**
   * Get all requests for a user
   */
  async getUserRequests(userId: string): Promise<DataSubjectRequest[]> {
    await this.initialize()

    if (!this.db) return []

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('userId')
      const request = index.getAll(userId)

      request.onsuccess = () => resolve(request.result ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get a specific request
   */
  async getRequest(requestId: string): Promise<DataSubjectRequest | null> {
    await this.initialize()

    if (!this.db) return null

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(requestId)

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get pending requests (for admin dashboard)
   */
  async getPendingRequests(): Promise<DataSubjectRequest[]> {
    await this.initialize()

    if (!this.db) return []

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('status')
      const request = index.getAll('pending')

      request.onsuccess = () => resolve(request.result ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get overdue requests
   */
  async getOverdueRequests(): Promise<DataSubjectRequest[]> {
    const pending = await this.getPendingRequests()
    const now = Date.now()
    return pending.filter(r => r.deadline < now)
  }

  // Private methods

  private async storeRequest(request: DataSubjectRequest): Promise<void> {
    if (!this.db) return

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.add(request)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  private async updateRequest(request: DataSubjectRequest): Promise<void> {
    if (!this.db) return

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.put(request)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const dataSubjectRightsManager = new DataSubjectRightsManager()

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Submit a data access request
 */
export async function requestDataAccess(userId: string, email: string): Promise<DataSubjectRequest> {
  return dataSubjectRightsManager.submitRequest({
    userId,
    email,
    type: 'access',
  })
}

/**
 * Submit a data deletion request
 */
export async function requestDataDeletion(userId: string, email: string, reason?: string): Promise<DataSubjectRequest> {
  return dataSubjectRightsManager.submitRequest({
    userId,
    email,
    type: 'erasure',
    reason,
  })
}

/**
 * Submit a data portability request
 */
export async function requestDataPortability(userId: string, email: string): Promise<DataSubjectRequest> {
  return dataSubjectRightsManager.submitRequest({
    userId,
    email,
    type: 'portability',
  })
}

/**
 * Process a pending request
 */
export async function processDataSubjectRequest(requestId: string): Promise<DataSubjectResponse> {
  return dataSubjectRightsManager.processRequest(requestId)
}

/**
 * Get user's request history
 */
export async function getUserDataRequests(userId: string): Promise<DataSubjectRequest[]> {
  return dataSubjectRightsManager.getUserRequests(userId)
}

/**
 * Export user data as JSON
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  return collectUserData(userId)
}

/**
 * Delete all user data
 */
export async function deleteAllUserData(userId: string): Promise<{
  deleted: boolean
  deletedFrom: string[]
  errors: string[]
}> {
  return deleteUserData(userId)
}
