import '@testing-library/jest-dom'
import type {
  AuditEvent,
  AuditEventType,
  AuditEventCategory,
  AuditSeverity,
} from '@/types/security'

// =============================================================================
// Console Noise Suppression
// =============================================================================
// Silence diagnostic console.warn/error output from the extraction pipeline
// during tests. This removes ~1000+ lines of [PolicyExtractor],
// etc. noise while preserving:
//   - [ClauseResolver] — intentional safety-guard output
//   - Vitest spy-intercepted calls (tests using vi.spyOn still see output)
//   - Genuine unexpected errors (anything not matching known prefixes)

const SUPPRESSED_PREFIXES = [
  '[PolicyExtractor]',
  '[Document AI]',
  '[Turkish Validation]',
  '[Table Parser]',
  '[convertToAnalyzedPolicy]',
  '[ProcessingLog]',
  '[TryAnalysis',
  'AI provider',
  'All AI providers failed',
  'AI text processing failed',
  'Clean-room processing failed',
  'Text processing failed',
  'Turkish pattern validation failed',
  'Table coverage parsing failed',
  'Successfully fetched',
  'Warning: Required "glyf"',
]

const ALLOWED_PREFIXES = ['[ClauseResolver]']

function isSuppressed(args: unknown[]): boolean {
  const first = args[0]
  if (typeof first !== 'string') return false

  // Suppress React 18 act() warnings which are noisy and harmless in these specific test suites
  if (
    first.includes('Warning: An update to') &&
    first.includes('inside a test was not wrapped in act')
  ) {
    return true
  }

  // Never suppress allowed prefixes
  if (ALLOWED_PREFIXES.some((p) => first.startsWith(p))) return false
  // Suppress known noisy prefixes
  return SUPPRESSED_PREFIXES.some((p) => first.startsWith(p) || first.includes(p))
}

const originalWarn = console.warn
const originalError = console.error

console.warn = (...args: unknown[]) => {
  if (!isSuppressed(args)) originalWarn(...args)
}
console.error = (...args: unknown[]) => {
  if (!isSuppressed(args)) originalError(...args)
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to determine category from event type
 */
function getCategoryFromType(type: AuditEventType): AuditEventCategory {
  const prefix = type.split('.')[0]
  const categoryMap: Record<string, AuditEventCategory> = {
    auth: 'auth',
    policy: 'policy',
    document: 'document',
    ai: 'ai',
    export: 'export',
    search: 'search',
    settings: 'settings',
    security: 'security',
    error: 'error',
  }
  return categoryMap[prefix] || 'error'
}

/**
 * Helper to determine severity from event type
 */
function getSeverityFromType(type: AuditEventType): AuditSeverity {
  if (type.includes('failed') || type.includes('error') || type.includes('exceeded')) {
    return 'error'
  }
  if (type.includes('suspicious') || type.includes('warning')) {
    return 'warning'
  }
  return 'info'
}

/**
 * Creates a complete mock AuditEvent with all required properties
 * Use this helper in tests instead of incomplete object literals
 */
export function createMockAuditEvent(
  overrides: Partial<AuditEvent> & { type: AuditEventType }
): AuditEvent {
  const timestamp = overrides.timestamp ?? Date.now()
  const type = overrides.type

  return {
    id: overrides.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    category: overrides.category ?? getCategoryFromType(type),
    severity: overrides.severity ?? getSeverityFromType(type),
    timestamp,
    timestampISO: overrides.timestampISO ?? new Date(timestamp).toISOString(),
    userId: overrides.userId,
    sessionId: overrides.sessionId,
    ipHash: overrides.ipHash,
    userAgent: overrides.userAgent,
    details: overrides.details ?? {},
    durationMs: overrides.durationMs,
    resourceId: overrides.resourceId,
    resourceType: overrides.resourceType,
    success: overrides.success ?? !type.includes('failed'),
    errorMessage: overrides.errorMessage,
    errorCode: overrides.errorCode,
  }
}

// Make helper available globally for tests
;(globalThis as any).createMockAuditEvent = createMockAuditEvent

// =============================================================================
// DOM Mocks
// =============================================================================

// Mock window.scrollTo - jsdom doesn't implement it
Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
})

// Mock window.scroll - similar to scrollTo
Object.defineProperty(window, 'scroll', {
  value: () => {},
  writable: true,
})

// Mock Element.scrollIntoView - commonly used in UI components
Element.prototype.scrollIntoView = () => {}

// Mock matchMedia - used by responsive components and framer-motion
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock ResizeObserver - used by many UI libraries
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
