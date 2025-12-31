/**
 * Analytics Module
 * Usage metrics and A/B testing
 */

// Types
export type {
  EventCategory,
  UserAction,
  FeatureName,
  AnalyticsEvent,
  PageViewEvent,
  FeatureUsageEvent,
  PerformanceEvent,
  ExperimentStatus,
  ExperimentVariant,
  Experiment,
  ExperimentAssignment,
  ExperimentMetric,
  ExperimentResults,
  SessionInfo,
  UsageStats,
  RealtimeMetrics,
  AnalyticsConfig,
} from '@/types/analytics'

export { DEFAULT_ANALYTICS_CONFIG } from '@/types/analytics'

// Tracker
export {
  analytics,
  initializeAnalytics,
  trackPageView,
  trackFeature,
  trackAction,
  trackError,
  startTiming,
} from './tracker'

// Experiments
export {
  experiments,
  createABTest,
  getVariant,
  isInTreatment,
  trackConversion,
} from './experiments'
