/**
 * Content Security Policy Configuration
 *
 * Centralized CSP settings for InsurAI.
 * Used by both server (helmet) and can be referenced for deployment configs.
 */

/**
 * CSP Directives for InsurAI
 *
 * These settings prevent XSS attacks while allowing necessary resources:
 * - Sentry for error tracking
 * - Supabase for authentication and storage
 * - Google Fonts for typography
 */
export const CSP_DIRECTIVES = {
  // Default fallback for unlisted directives
  'default-src': ["'self'"],

  // JavaScript sources
  'script-src': [
    "'self'",
    // Sentry error tracking scripts
    'https://*.sentry.io',
    'https://*.sentry-cdn.com',
  ],

  // CSS sources
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS and inline styles
    'https://fonts.googleapis.com',
  ],

  // Font sources
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com',
    'data:', // For inline fonts
  ],

  // Image sources
  'img-src': [
    "'self'",
    'data:', // For inline images (base64)
    'blob:', // For PDF rendering
    'https://*.supabase.co', // Supabase storage
  ],

  // XHR/Fetch/WebSocket connections
  'connect-src': [
    "'self'",
    // Supabase (auth, database, realtime)
    'https://*.supabase.co',
    'wss://*.supabase.co',
    // Sentry error reporting
    'https://*.sentry.io',
    'https://*.ingest.sentry.io',
  ],

  // Embedded frames
  'frame-src': ["'self'"],

  // Plugin content (Flash, Java, etc.)
  'object-src': ["'none'"],

  // Base URL for relative URLs
  'base-uri': ["'self'"],

  // Form submission targets
  'form-action': ["'self'"],

  // Web Workers
  'worker-src': ["'self'", 'blob:'],

  // Nested browsing contexts
  'child-src': ["'self'", 'blob:'],

  // Media (audio, video)
  'media-src': ["'self'"],

  // Web app manifest
  'manifest-src': ["'self'"],
} as const

/**
 * Development-only CSP additions
 * These are less secure but required for hot module replacement
 * and local backend API calls
 */
export const CSP_DEV_ADDITIONS = {
  'script-src': ["'unsafe-inline'", "'unsafe-eval'"],
  'connect-src': [
    'http://localhost:*',
    'ws://localhost:*',
    'wss://localhost:*',
    'https://*.app.github.dev', // GitHub Codespaces
  ],
} as const

/**
 * Server-only CSP directives (not supported in meta tags)
 */
export const CSP_SERVER_ONLY = {
  // Prevent embedding in iframes (clickjacking protection)
  'frame-ancestors': ["'none'"],
  // Upgrade HTTP to HTTPS in production
  'upgrade-insecure-requests': [],
} as const

/**
 * Build CSP string for meta tag
 */
export function buildCSPMetaTag(isDev: boolean = false): string {
  const directives: Record<string, string[]> = {}

  // Copy base directives
  for (const [key, values] of Object.entries(CSP_DIRECTIVES)) {
    directives[key] = [...values]
  }

  if (isDev) {
    // Add dev additions
    for (const [key, values] of Object.entries(CSP_DEV_ADDITIONS)) {
      if (directives[key]) {
        directives[key] = [...directives[key], ...values]
      }
    }
  }

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')
}

/**
 * CSP violation report handler
 * Log CSP violations for debugging
 */
export function handleCSPViolation(event: SecurityPolicyViolationEvent): void {
  console.warn('CSP Violation:', {
    blockedURI: event.blockedURI,
    violatedDirective: event.violatedDirective,
    originalPolicy: event.originalPolicy,
    sourceFile: event.sourceFile,
    lineNumber: event.lineNumber,
    columnNumber: event.columnNumber,
  })

  // In production, you could send this to Sentry
  // captureMessage(`CSP Violation: ${event.violatedDirective}`, 'warning')
}

/**
 * Set up CSP violation listener
 * Call this in main.tsx to monitor violations
 */
export function setupCSPViolationListener(): void {
  if (typeof document !== 'undefined') {
    document.addEventListener('securitypolicyviolation', handleCSPViolation)
  }
}
