/**
 * Analytics Types
 * Usage metrics and A/B testing type definitions
 */

// =============================================================================
// Event Types
// =============================================================================

/**
 * Categories of analytics events
 */
export type EventCategory =
  | 'page_view'
  | 'feature_usage'
  | 'user_action'
  | 'error'
  | 'performance'
  | 'experiment'

/**
 * Common user actions to track
 */
export type UserAction =
  | 'click'
  | 'submit'
  | 'upload'
  | 'download'
  | 'search'
  | 'filter'
  | 'sort'
  | 'expand'
  | 'collapse'
  | 'copy'
  | 'share'
  | 'delete'
  | 'edit'
  | 'view'

/**
 * Features to track usage
 */
export type FeatureName =
  | 'policy_upload'
  | 'policy_view'
  | 'policy_compare'
  | 'gap_analysis'
  | 'ai_extraction'
  | 'data_export'
  | 'settings'
  | 'dashboard'
  | 'search'
  | 'filters'

/**
 * Analytics event record
 */
export interface AnalyticsEvent {
  id: string
  timestamp: number
  sessionId: string
  userId?: string
  category: EventCategory
  action: string
  label?: string
  value?: number
  metadata?: Record<string, unknown>
  page?: string
  referrer?: string
  duration?: number
}

/**
 * Page view event
 */
export interface PageViewEvent extends AnalyticsEvent {
  category: 'page_view'
  page: string
  title?: string
  previousPage?: string
}

/**
 * Feature usage event
 */
export interface FeatureUsageEvent extends AnalyticsEvent {
  category: 'feature_usage'
  feature: FeatureName
  success?: boolean
  duration?: number
}

/**
 * Performance metric event
 */
export interface PerformanceEvent extends AnalyticsEvent {
  category: 'performance'
  metric: string
  value: number
  unit: 'ms' | 'bytes' | 'count'
}

// =============================================================================
// A/B Testing Types
// =============================================================================

/**
 * Experiment status
 */
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed'

/**
 * Experiment variant
 */
export interface ExperimentVariant {
  id: string
  name: string
  weight: number // 0-100, percentage allocation
  config?: Record<string, unknown>
}

/**
 * A/B test experiment definition
 */
export interface Experiment {
  id: string
  name: string
  description?: string
  status: ExperimentStatus
  variants: ExperimentVariant[]
  startDate?: number
  endDate?: number
  targetAudience?: {
    percentage: number // 0-100
    filters?: Record<string, unknown>
  }
  metrics: string[] // Metrics to track for this experiment
  createdAt: number
  updatedAt: number
}

/**
 * User's experiment assignment
 */
export interface ExperimentAssignment {
  experimentId: string
  variantId: string
  assignedAt: number
  userId?: string
  sessionId: string
}

/**
 * Experiment result metrics
 */
export interface ExperimentMetric {
  experimentId: string
  variantId: string
  metricName: string
  count: number
  sum: number
  min: number
  max: number
  avg: number
}

/**
 * Experiment results summary
 */
export interface ExperimentResults {
  experimentId: string
  startDate: number
  endDate?: number
  totalParticipants: number
  variantResults: {
    variantId: string
    variantName: string
    participants: number
    metrics: Record<string, ExperimentMetric>
    conversionRate?: number
  }[]
}

// =============================================================================
// Usage Metrics Types
// =============================================================================

/**
 * Session information
 */
export interface SessionInfo {
  id: string
  startedAt: number
  lastActivityAt: number
  pageViews: number
  events: number
  duration: number
  userId?: string
  device?: {
    type: 'desktop' | 'tablet' | 'mobile'
    browser: string
    os: string
  }
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  period: {
    start: number
    end: number
  }
  totalSessions: number
  totalPageViews: number
  totalEvents: number
  uniqueUsers: number
  avgSessionDuration: number
  topPages: { page: string; views: number }[]
  topFeatures: { feature: string; usage: number }[]
  eventsByCategory: Record<EventCategory, number>
}

/**
 * Real-time metrics
 */
export interface RealtimeMetrics {
  activeSessions: number
  eventsLastMinute: number
  eventsLastHour: number
  currentPage: string | null
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  enabled: boolean
  debug: boolean
  sessionTimeout: number // ms of inactivity before new session
  batchSize: number // Events to batch before flush
  flushInterval: number // ms between flushes
  sampleRate: number // 0-1, percentage of events to capture
  excludePaths: string[] // Paths to exclude from tracking
  respectDoNotTrack: boolean
}

/**
 * Default analytics configuration
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: true,
  debug: false,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  batchSize: 10,
  flushInterval: 5000, // 5 seconds
  sampleRate: 1.0, // Track all events
  excludePaths: ['/health', '/api'],
  respectDoNotTrack: true,
}
