/**
 * Consent Manager
 * KVKK/GDPR compliant consent tracking and management
 */

import type {
  ConsentType,
  ConsentRecord,
  UserConsentStatus,
  ConsentRequirement,
} from '@/types/privacy'

// =============================================================================
// Consent Requirements
// =============================================================================

/**
 * Current consent requirements with versions
 */
export const CONSENT_REQUIREMENTS: ConsentRequirement[] = [
  {
    type: 'terms_of_service',
    required: true,
    category: ['identity', 'contact', 'usage'],
    purpose: 'Acceptance of terms and conditions for using the service',
    purposeTr: 'Hizmet kullanım şartlarının kabulü',
    legalBasis: 'contract',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'privacy_policy',
    required: true,
    category: ['identity', 'contact', 'insurance', 'documents', 'usage', 'technical'],
    purpose: 'Acknowledgment of how personal data is processed',
    purposeTr: 'Kişisel verilerin nasıl işlendiğinin bilgilendirilmesi',
    legalBasis: 'consent',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'data_processing',
    required: true,
    category: ['insurance', 'documents'],
    purpose: 'Processing of insurance documents for analysis',
    purposeTr: 'Analiz için sigorta belgelerinin işlenmesi',
    legalBasis: 'consent',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'ai_processing',
    required: false,
    category: ['documents', 'insurance'],
    purpose: 'Use of AI/ML to analyze and extract policy information',
    purposeTr: 'Poliçe bilgilerini analiz etmek ve çıkarmak için yapay zeka kullanımı',
    legalBasis: 'consent',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'analytics',
    required: false,
    category: ['usage', 'technical'],
    purpose: 'Usage analytics to improve service quality',
    purposeTr: 'Hizmet kalitesini artırmak için kullanım analitiği',
    legalBasis: 'legitimate_interests',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'marketing_email',
    required: false,
    category: ['contact'],
    purpose: 'Receiving promotional emails and newsletters',
    purposeTr: 'Promosyon e-postaları ve bültenler almak',
    legalBasis: 'consent',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'cookie_essential',
    required: true,
    category: ['technical'],
    purpose: 'Essential cookies for site functionality',
    purposeTr: 'Site işlevselliği için gerekli çerezler',
    legalBasis: 'legitimate_interests',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
  {
    type: 'cookie_analytics',
    required: false,
    category: ['technical', 'usage'],
    purpose: 'Analytics cookies to understand user behavior',
    purposeTr: 'Kullanıcı davranışını anlamak için analitik çerezler',
    legalBasis: 'consent',
    version: '1.0.0',
    effectiveDate: '2024-01-01',
  },
]

// =============================================================================
// Storage
// =============================================================================

const STORAGE_KEY = 'insurai_consents'
const DB_NAME = 'insurai_privacy'
const DB_VERSION = 1
const STORE_NAME = 'consents'

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/**
 * Open IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
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
        store.createIndex('grantedAt', 'grantedAt', { unique: false })
      }
    }
  })
}

// =============================================================================
// Consent Manager Class
// =============================================================================

class ConsentManager {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private memoryCache: Map<string, ConsentRecord[]> = new Map()

  /**
   * Initialize the consent manager
   */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    // Load from localStorage as backup
    this.loadFromLocalStorage()

    if (isIndexedDBAvailable()) {
      try {
        this.db = await openDatabase()
      } catch {
        // IndexedDB not available, use localStorage only
      }
    }
  }

  /**
   * Record a consent grant or revocation
   */
  async recordConsent(params: {
    userId: string
    type: ConsentType
    granted: boolean
    version?: string
    source?: 'web' | 'mobile' | 'api' | 'import'
    metadata?: Record<string, unknown>
  }): Promise<ConsentRecord> {
    await this.initialize()

    const { userId, type, granted, version, source = 'web', metadata } = params

    // Get the requirement for version
    const requirement = CONSENT_REQUIREMENTS.find(r => r.type === type)

    const record: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      type,
      granted,
      grantedAt: Date.now(),
      revokedAt: granted ? undefined : Date.now(),
      version: version ?? requirement?.version ?? '1.0.0',
      source,
      metadata,
    }

    // Hash IP for privacy
    if (typeof navigator !== 'undefined') {
      record.userAgent = navigator.userAgent
    }

    // Store record
    await this.storeRecord(record)

    return record
  }

  /**
   * Revoke a previously granted consent
   */
  async revokeConsent(userId: string, type: ConsentType): Promise<ConsentRecord> {
    return this.recordConsent({
      userId,
      type,
      granted: false,
    })
  }

  /**
   * Grant multiple consents at once (e.g., during signup)
   */
  async grantMultiple(
    userId: string,
    types: ConsentType[],
    source: 'web' | 'mobile' | 'api' | 'import' = 'web'
  ): Promise<ConsentRecord[]> {
    const records: ConsentRecord[] = []

    for (const type of types) {
      const record = await this.recordConsent({
        userId,
        type,
        granted: true,
        source,
      })
      records.push(record)
    }

    return records
  }

  /**
   * Check if user has granted a specific consent
   */
  async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    await this.initialize()

    const records = await this.getUserConsents(userId)
    const typeRecords = records
      .filter(r => r.type === type)
      .sort((a, b) => b.grantedAt - a.grantedAt)

    if (typeRecords.length === 0) return false

    const latest = typeRecords[0]
    return latest.granted && !latest.revokedAt
  }

  /**
   * Check if user has all required consents
   */
  async hasRequiredConsents(userId: string): Promise<{
    hasAll: boolean
    missing: ConsentType[]
  }> {
    await this.initialize()

    const required = CONSENT_REQUIREMENTS.filter(r => r.required)
    const missing: ConsentType[] = []

    for (const req of required) {
      const hasIt = await this.hasConsent(userId, req.type)
      if (!hasIt) {
        missing.push(req.type)
      }
    }

    return {
      hasAll: missing.length === 0,
      missing,
    }
  }

  /**
   * Get user's current consent status
   */
  async getUserConsentStatus(userId: string): Promise<UserConsentStatus> {
    await this.initialize()

    const records = await this.getUserConsents(userId)
    const consents: UserConsentStatus['consents'] = {} as UserConsentStatus['consents']

    // Initialize all consent types as not granted
    for (const req of CONSENT_REQUIREMENTS) {
      consents[req.type] = { granted: false }
    }

    // Process records to get current state
    for (const record of records) {
      if (!consents[record.type]) {
        consents[record.type] = { granted: false }
      }

      // Use the most recent record for each type
      const current = consents[record.type]
      if (!current.grantedAt || record.grantedAt > current.grantedAt) {
        consents[record.type] = {
          granted: record.granted && !record.revokedAt,
          grantedAt: record.grantedAt,
          version: record.version,
        }
      }
    }

    return {
      userId,
      consents,
      lastUpdated: records.length > 0
        ? Math.max(...records.map(r => r.grantedAt))
        : 0,
    }
  }

  /**
   * Get all consent records for a user
   */
  async getUserConsents(userId: string): Promise<ConsentRecord[]> {
    await this.initialize()

    // Check memory cache first
    const cached = this.memoryCache.get(userId)
    if (cached) return cached

    if (!this.db) {
      // Fallback to localStorage
      return this.getFromLocalStorage(userId)
    }

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('userId')
      const request = index.getAll(userId)

      request.onsuccess = () => {
        const records = request.result as ConsentRecord[]
        this.memoryCache.set(userId, records)
        resolve(records)
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get consent history for a specific type
   */
  async getConsentHistory(userId: string, type: ConsentType): Promise<ConsentRecord[]> {
    const records = await this.getUserConsents(userId)
    return records
      .filter(r => r.type === type)
      .sort((a, b) => b.grantedAt - a.grantedAt)
  }

  /**
   * Check if consent needs renewal (new version available)
   */
  async needsRenewal(userId: string, type: ConsentType): Promise<boolean> {
    const requirement = CONSENT_REQUIREMENTS.find(r => r.type === type)
    if (!requirement) return false

    const records = await this.getConsentHistory(userId, type)
    if (records.length === 0) return true

    const latest = records[0]
    if (!latest.granted) return true

    // Check if version has changed
    return latest.version !== requirement.version
  }

  /**
   * Delete all consent records for a user (for account deletion)
   */
  async deleteUserConsents(userId: string): Promise<number> {
    await this.initialize()

    // Clear memory cache
    this.memoryCache.delete(userId)

    if (!this.db) {
      // Clear from localStorage
      return this.deleteFromLocalStorage(userId)
    }

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('userId')
      const request = index.openCursor(IDBKeyRange.only(userId))

      let deleted = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          resolve(deleted)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get consent statistics
   */
  async getStats(): Promise<{
    totalRecords: number
    byType: Record<ConsentType, { granted: number; revoked: number }>
    recentGrants: number
    recentRevocations: number
  }> {
    await this.initialize()

    const records = await this.getAllRecords()
    const byType = {} as Record<ConsentType, { granted: number; revoked: number }>

    // Initialize
    for (const req of CONSENT_REQUIREMENTS) {
      byType[req.type] = { granted: 0, revoked: 0 }
    }

    const now = Date.now()
    const recentWindow = 24 * 60 * 60 * 1000 // 24 hours
    let recentGrants = 0
    let recentRevocations = 0

    for (const record of records) {
      if (!byType[record.type]) {
        byType[record.type] = { granted: 0, revoked: 0 }
      }

      if (record.granted && !record.revokedAt) {
        byType[record.type].granted++
      } else {
        byType[record.type].revoked++
      }

      if (now - record.grantedAt < recentWindow) {
        if (record.granted) recentGrants++
        else recentRevocations++
      }
    }

    return {
      totalRecords: records.length,
      byType,
      recentGrants,
      recentRevocations,
    }
  }

  // Private methods

  private async storeRecord(record: ConsentRecord): Promise<void> {
    // Update memory cache
    const cached = this.memoryCache.get(record.userId) ?? []
    cached.push(record)
    this.memoryCache.set(record.userId, cached)

    // Save to localStorage as backup
    this.saveToLocalStorage(record)

    if (!this.db) return

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.add(record)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  private async getAllRecords(): Promise<ConsentRecord[]> {
    if (!this.db) {
      return this.getAllFromLocalStorage()
    }

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result as ConsentRecord[])
      request.onerror = () => reject(request.error)
    })
  }

  private loadFromLocalStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const records = JSON.parse(stored) as ConsentRecord[]
        for (const record of records) {
          const cached = this.memoryCache.get(record.userId) ?? []
          cached.push(record)
          this.memoryCache.set(record.userId, cached)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private saveToLocalStorage(record: ConsentRecord): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const records = stored ? JSON.parse(stored) as ConsentRecord[] : []
      records.push(record)
      // Keep only last 1000 records
      const trimmed = records.slice(-1000)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      // Storage full or unavailable
    }
  }

  private getFromLocalStorage(userId: string): ConsentRecord[] {
    if (typeof localStorage === 'undefined') return []

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      const records = JSON.parse(stored) as ConsentRecord[]
      return records.filter(r => r.userId === userId)
    } catch {
      return []
    }
  }

  private getAllFromLocalStorage(): ConsentRecord[] {
    if (typeof localStorage === 'undefined') return []

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) as ConsentRecord[] : []
    } catch {
      return []
    }
  }

  private deleteFromLocalStorage(userId: string): number {
    if (typeof localStorage === 'undefined') return 0

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return 0
      const records = JSON.parse(stored) as ConsentRecord[]
      const filtered = records.filter(r => r.userId !== userId)
      const deleted = records.length - filtered.length
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      return deleted
    } catch {
      return 0
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const consentManager = new ConsentManager()

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Initialize consent manager
 */
export async function initializeConsentManager(): Promise<void> {
  await consentManager.initialize()
}

/**
 * Record user consent
 */
export async function recordConsent(
  userId: string,
  type: ConsentType,
  granted: boolean
): Promise<ConsentRecord> {
  return consentManager.recordConsent({ userId, type, granted })
}

/**
 * Check if user has specific consent
 */
export async function hasConsent(userId: string, type: ConsentType): Promise<boolean> {
  return consentManager.hasConsent(userId, type)
}

/**
 * Check if user has all required consents
 */
export async function checkRequiredConsents(userId: string): Promise<{
  hasAll: boolean
  missing: ConsentType[]
}> {
  return consentManager.hasRequiredConsents(userId)
}

/**
 * Get user's consent status
 */
export async function getUserConsentStatus(userId: string): Promise<UserConsentStatus> {
  return consentManager.getUserConsentStatus(userId)
}

/**
 * Get consent requirement details
 */
export function getConsentRequirement(type: ConsentType): ConsentRequirement | undefined {
  return CONSENT_REQUIREMENTS.find(r => r.type === type)
}

/**
 * Get all consent requirements
 */
export function getAllConsentRequirements(): ConsentRequirement[] {
  return [...CONSENT_REQUIREMENTS]
}
