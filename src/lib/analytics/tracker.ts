/**
 * Analytics Tracker
 * Usage metrics collection and tracking
 */

import type {
  AnalyticsEvent,
  EventCategory,
  FeatureName,
  UserAction,
  SessionInfo,
  UsageStats,
  AnalyticsConfig,
} from '@/types/analytics'
import { DEFAULT_ANALYTICS_CONFIG } from '@/types/analytics'

// =============================================================================
// Storage
// =============================================================================

const STORAGE_KEY = 'insurai_analytics'
const SESSION_KEY = 'insurai_session'
const DB_NAME = 'insurai_analytics'
const DB_VERSION = 1
const EVENTS_STORE = 'events'

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Get or create session ID
 */
function getSessionId(timeout: number): string {
  const now = Date.now()

  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) {
      const session = JSON.parse(stored) as { id: string; lastActivity: number }
      if (now - session.lastActivity < timeout) {
        session.lastActivity = now
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
        return session.id
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Create new session
  const newSession = { id: generateId(), lastActivity: now }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession))
  } catch {
    // Storage unavailable
  }
  return newSession.id
}

/**
 * Detect device info
 */
function getDeviceInfo(): SessionInfo['device'] {
  if (typeof navigator === 'undefined') {
    return { type: 'desktop', browser: 'unknown', os: 'unknown' }
  }

  const ua = navigator.userAgent

  // Detect device type
  let type: 'desktop' | 'tablet' | 'mobile' = 'desktop'
  if (/Mobi|Android/i.test(ua)) {
    type = /Tablet|iPad/i.test(ua) ? 'tablet' : 'mobile'
  }

  // Detect browser
  let browser = 'unknown'
  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'

  // Detect OS
  let os = 'unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iOS') || ua.includes('iPhone')) os = 'iOS'

  return { type, browser, os }
}

/**
 * Check if Do Not Track is enabled
 */
function isDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.doNotTrack === '1' || (navigator as { globalPrivacyControl?: string }).globalPrivacyControl === '1'
}

// =============================================================================
// Analytics Tracker Class
// =============================================================================

class AnalyticsTracker {
  private config: AnalyticsConfig = DEFAULT_ANALYTICS_CONFIG
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private eventBuffer: AnalyticsEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private sessionId: string = ''
  private userId: string | undefined
  private currentPage: string = ''
  private sessionStart: number = 0
  private pageViewCount: number = 0
  private eventCount: number = 0

  /**
   * Initialize the tracker
   */
  async initialize(config?: Partial<AnalyticsConfig>): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize(config)
    return this.initPromise
  }

  private async doInitialize(config?: Partial<AnalyticsConfig>): Promise<void> {
    if (config) {
      this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...config }
    }

    // Check Do Not Track
    if (this.config.respectDoNotTrack && isDoNotTrackEnabled()) {
      this.config.enabled = false
      return
    }

    this.sessionId = getSessionId(this.config.sessionTimeout)
    this.sessionStart = Date.now()

    // Try to open IndexedDB
    try {
      this.db = await this.openDatabase()
    } catch {
      // IndexedDB not available, use memory only
    }

    // Start flush timer
    if (this.config.enabled && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush()
      }, this.config.flushInterval)
    }

    // Track session start
    if (this.config.enabled) {
      this.track({
        category: 'user_action',
        action: 'session_start',
        metadata: {
          device: getDeviceInfo(),
        },
      })
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
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

        if (!db.objectStoreNames.contains(EVENTS_STORE)) {
          const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('category', 'category', { unique: false })
          store.createIndex('sessionId', 'sessionId', { unique: false })
        }
      }
    })
  }

  /**
   * Set user ID for tracking
   */
  setUserId(userId: string | undefined): void {
    this.userId = userId
  }

  /**
   * Track a generic event
   */
  track(params: {
    category: EventCategory
    action: string
    label?: string
    value?: number
    metadata?: Record<string, unknown>
  }): void {
    if (!this.config.enabled) return

    // Sample rate check
    if (Math.random() > this.config.sampleRate) return

    const event: AnalyticsEvent = {
      id: generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      category: params.category,
      action: params.action,
      label: params.label,
      value: params.value,
      metadata: params.metadata,
      page: this.currentPage,
    }

    this.eventBuffer.push(event)
    this.eventCount++

    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log('[Analytics]', event)
    }

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.config.batchSize) {
      this.flush()
    }
  }

  /**
   * Track page view
   */
  trackPageView(page: string, title?: string): void {
    if (!this.config.enabled) return

    // Check excluded paths
    if (this.config.excludePaths.some(p => page.startsWith(p))) {
      return
    }

    const previousPage = this.currentPage
    this.currentPage = page
    this.pageViewCount++

    this.track({
      category: 'page_view',
      action: 'view',
      label: title ?? page,
      metadata: {
        page,
        title,
        previousPage,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      },
    })
  }

  /**
   * Track feature usage
   */
  trackFeature(
    feature: FeatureName,
    action: UserAction = 'view',
    options?: { success?: boolean; duration?: number; metadata?: Record<string, unknown> }
  ): void {
    this.track({
      category: 'feature_usage',
      action,
      label: feature,
      value: options?.duration,
      metadata: {
        feature,
        success: options?.success,
        duration: options?.duration,
        ...options?.metadata,
      },
    })
  }

  /**
   * Track user action
   */
  trackAction(
    action: UserAction,
    target: string,
    metadata?: Record<string, unknown>
  ): void {
    this.track({
      category: 'user_action',
      action,
      label: target,
      metadata,
    })
  }

  /**
   * Track error
   */
  trackError(
    error: Error | string,
    context?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : error
    const errorStack = error instanceof Error ? error.stack : undefined

    this.track({
      category: 'error',
      action: 'error',
      label: errorMessage,
      metadata: {
        message: errorMessage,
        stack: errorStack,
        ...context,
      },
    })
  }

  /**
   * Track performance metric
   */
  trackPerformance(
    metric: string,
    value: number,
    unit: 'ms' | 'bytes' | 'count' = 'ms'
  ): void {
    this.track({
      category: 'performance',
      action: metric,
      value,
      metadata: { unit },
    })
  }

  /**
   * Start timing an operation
   */
  startTiming(label: string): () => void {
    const start = performance.now()
    return () => {
      const duration = Math.round(performance.now() - start)
      this.trackPerformance(label, duration, 'ms')
    }
  }

  /**
   * Flush events to storage
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return

    const events = [...this.eventBuffer]
    this.eventBuffer = []

    if (!this.db) {
      // Fallback to localStorage
      this.saveToLocalStorage(events)
      return
    }

    try {
      const db = this.db
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(EVENTS_STORE, 'readwrite')
        const store = transaction.objectStore(EVENTS_STORE)

        for (const event of events) {
          store.add(event)
        }

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
      })
    } catch {
      // Store failed, save to localStorage as backup
      this.saveToLocalStorage(events)
    }
  }

  private saveToLocalStorage(events: AnalyticsEvent[]): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const existing = stored ? JSON.parse(stored) as AnalyticsEvent[] : []
      const combined = [...existing, ...events].slice(-1000) // Keep last 1000
      localStorage.setItem(STORAGE_KEY, JSON.stringify(combined))
    } catch {
      // Storage full or unavailable
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo(): SessionInfo {
    const now = Date.now()
    return {
      id: this.sessionId,
      startedAt: this.sessionStart,
      lastActivityAt: now,
      pageViews: this.pageViewCount,
      events: this.eventCount,
      duration: now - this.sessionStart,
      userId: this.userId,
      device: getDeviceInfo(),
    }
  }

  /**
   * Get usage statistics
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<UsageStats> {
    const events = await this.getAllEvents()

    const start = startDate?.getTime() ?? 0
    const end = endDate?.getTime() ?? Date.now()

    const filtered = events.filter(e => e.timestamp >= start && e.timestamp <= end)

    const sessions = new Set(filtered.map(e => e.sessionId))
    const users = new Set(filtered.filter(e => e.userId).map(e => e.userId))
    const pageViews = filtered.filter(e => e.category === 'page_view')
    const featureEvents = filtered.filter(e => e.category === 'feature_usage')

    // Calculate top pages
    const pageCount = new Map<string, number>()
    for (const event of pageViews) {
      const page = event.page ?? 'unknown'
      pageCount.set(page, (pageCount.get(page) ?? 0) + 1)
    }
    const topPages = Array.from(pageCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, views]) => ({ page, views }))

    // Calculate top features
    const featureCount = new Map<string, number>()
    for (const event of featureEvents) {
      const feature = event.label ?? 'unknown'
      featureCount.set(feature, (featureCount.get(feature) ?? 0) + 1)
    }
    const topFeatures = Array.from(featureCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([feature, usage]) => ({ feature, usage }))

    // Events by category
    const eventsByCategory: Record<string, number> = {
      page_view: 0,
      feature_usage: 0,
      user_action: 0,
      error: 0,
      performance: 0,
      experiment: 0,
    }
    for (const event of filtered) {
      eventsByCategory[event.category] = (eventsByCategory[event.category] ?? 0) + 1
    }

    return {
      period: { start, end },
      totalSessions: sessions.size,
      totalPageViews: pageViews.length,
      totalEvents: filtered.length,
      uniqueUsers: users.size,
      avgSessionDuration: 0, // Would need session end tracking
      topPages,
      topFeatures,
      eventsByCategory: eventsByCategory as Record<EventCategory, number>,
    }
  }

  private async getAllEvents(): Promise<AnalyticsEvent[]> {
    if (!this.db) {
      return this.getFromLocalStorage()
    }

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(EVENTS_STORE, 'readonly')
        const store = transaction.objectStore(EVENTS_STORE)
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result ?? [])
        request.onerror = () => resolve(this.getFromLocalStorage())
      } catch {
        resolve(this.getFromLocalStorage())
      }
    })
  }

  private getFromLocalStorage(): AnalyticsEvent[] {
    if (typeof localStorage === 'undefined') return []

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) as AnalyticsEvent[] : []
    } catch {
      return []
    }
  }

  /**
   * Clear all analytics data
   */
  async clearData(): Promise<void> {
    this.eventBuffer = []
    this.pageViewCount = 0
    this.eventCount = 0

    if (this.db) {
      const db = this.db
      await new Promise<void>((resolve) => {
        try {
          const transaction = db.transaction(EVENTS_STORE, 'readwrite')
          const store = transaction.objectStore(EVENTS_STORE)
          store.clear()
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => resolve()
        } catch {
          resolve()
        }
      })
    }

    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  /**
   * Destroy the tracker
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    this.flush()

    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const analytics = new AnalyticsTracker()

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Initialize analytics
 */
export async function initializeAnalytics(
  config?: Partial<AnalyticsConfig>
): Promise<void> {
  await analytics.initialize(config)
}

/**
 * Track page view
 */
export function trackPageView(page: string, title?: string): void {
  analytics.trackPageView(page, title)
}

/**
 * Track feature usage
 */
export function trackFeature(
  feature: FeatureName,
  action?: UserAction,
  options?: { success?: boolean; duration?: number; metadata?: Record<string, unknown> }
): void {
  analytics.trackFeature(feature, action, options)
}

/**
 * Track user action
 */
export function trackAction(
  action: UserAction,
  target: string,
  metadata?: Record<string, unknown>
): void {
  analytics.trackAction(action, target, metadata)
}

/**
 * Track error
 */
export function trackError(
  error: Error | string,
  context?: Record<string, unknown>
): void {
  analytics.trackError(error, context)
}

/**
 * Start timing an operation
 */
export function startTiming(label: string): () => void {
  return analytics.startTiming(label)
}
