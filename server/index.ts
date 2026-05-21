/**
 * InsurAI Backend API Server
 *
 * Provides secure proxy endpoints for AI services, keeping API keys server-side.
 * This prevents exposure of sensitive API keys in the browser.
 */

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Server } from 'http'
import ws from 'ws'

// Polyfill WebSocket for Node.js < 22 — required by @supabase/realtime-js
// Railway uses Node.js 20 which lacks native WebSocket
globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables first (before Sentry init)
// dotenv.config() loads .env for local dev. On Railway (NODE_ENV=production)
// we also load .env.production for config values not set as Railway dashboard vars.
const envPath = process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
dotenv.config({ path: envPath })
dotenv.config()

import aiRoutes from './routes/ai/index.js'
import adminRoutes from './routes/admin/index.js'
import pdfRoutes from './routes/pdf.js'
import emailRoutes from './routes/email.js'
import fxRoutes from './routes/fx.js'
import settingsRoutes from './routes/settings.js'
import webhookRoutes from './routes/webhooks.js'
import policyRoutes from './routes/policy.js'

import driftRoutes from './routes/drift.js'
import translationRoutes from './routes/translations.js'
import configRoutes from './routes/config.js'
import notificationRoutes from './routes/notifications.js'
import { configureWebPush } from './services/notification-service.js'
import { generalLimiter, healthLimiter, rateLimitConfig } from './middleware/rate-limit.js'
import { authenticateAdmin } from './middleware/admin-auth.js'
import { initServerSentry, setupSentryErrorHandler, captureServerError } from './lib/sentry.js'
import logger from './lib/logger.js'
import { apiMetrics } from './middleware/api-metrics.js'
import { initializeDefaultAlertRules } from './middleware/monitoring.js'
import { probeAdminNotifications } from './services/admin-notification-service.js'
import {
  bootProviderCheck,
  startPeriodicHealthCheck,
  setDiagnosticsImports,
  setStatusSink,
} from './services/provider-health-monitor.js'

const log = logger.child('Server')

// Initialize Sentry for error tracking
initServerSentry()

const app = express()

// Trust proxy for Railway/cloud deployments (required for rate limiting to work correctly)
// This tells Express to trust X-Forwarded-For headers from reverse proxies
app.set('trust proxy', 1)

// Railway sets PORT automatically, fallback to API_PORT or 4001
const PORT = process.env.PORT || process.env.API_PORT || 4001
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Server configuration
const SERVER_CONFIG = {
  // Request timeout in milliseconds (default: 30 seconds, AI requests: 2 minutes)
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
  AI_REQUEST_TIMEOUT: parseInt(process.env.AI_REQUEST_TIMEOUT || '300000', 10),
  // Graceful shutdown timeout (how long to wait for connections to close)
  SHUTDOWN_TIMEOUT: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10),
  // Keep-alive timeout (must be greater than load balancer timeout)
  KEEP_ALIVE_TIMEOUT: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '305000', 10),
  // Headers timeout (must be greater than keep-alive timeout)
  HEADERS_TIMEOUT: parseInt(process.env.HEADERS_TIMEOUT || '306000', 10),
}

// Server instance for graceful shutdown
let server: Server

// Track active connections for graceful shutdown
const activeConnections = new Set<import('net').Socket>()

// Note: Sentry v10+ auto-instruments Express, no request handler needed

/**
 * Request timeout middleware
 * Sets a timeout on all requests to prevent hanging connections
 */
function requestTimeout(timeoutMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Set the request timeout
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({
          error: IS_PRODUCTION ? 'Request timed out' : 'Request timeout exceeded',
          code: 'REQUEST_TIMEOUT',
          ...(IS_PRODUCTION ? {} : { timeoutMs }),
        })
      }
    })
    next()
  }
}

// Apply default request timeout to all routes
app.use(requestTimeout(SERVER_CONFIG.REQUEST_TIMEOUT))

// Gzip/brotli compression — reduces transfer size for all text responses.
// Railway's envoy proxy also compresses, but this ensures compression
// regardless of deployment platform and improves local testing accuracy.
app.use(compression())

// Security middleware with CSP configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          // PDF.js worker from CDN
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'blob:', // PDF.js creates blob URLs for workers
          // Sentry for error tracking
          'https://*.sentry.io',
          'https://*.sentry-cdn.com',
          // Allow inline scripts in development (Vite HMR)
          ...(IS_PRODUCTION ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Tailwind and inline styles
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          // Supabase storage
          'https://*.supabase.co',
        ],
        connectSrc: [
          "'self'",
          // Backend API proxy
          process.env.FRONTEND_URL || 'http://localhost:5173',
          // Supabase
          'https://*.supabase.co',
          'wss://*.supabase.co',
          // Sentry
          'https://*.sentry.io',
          'https://*.ingest.sentry.io',
          // PDF.js worker modules
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          // Google Fonts (for service worker fetch)
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
          // Development WebSocket (Vite HMR)
          ...(IS_PRODUCTION ? [] : ['ws://localhost:*', 'wss://localhost:*']),
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        workerSrc: ["'self'", 'blob:', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        childSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
      },
      reportOnly: false,
    },
    // Additional security headers
    strictTransportSecurity: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false, // Disable for Supabase compatibility
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

// Serve static files in production (before CORS to avoid blocking)
if (IS_PRODUCTION) {
  const distPath = path.join(__dirname, '..', '..', 'dist')

  // Hashed assets (/assets/*) — cache aggressively (1 year), filenames change on each build
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), {
      maxAge: '365d',
      immutable: true,
      etag: false,
    })
  )

  // Non-hashed files (index.html, sw.js, manifest.json, icons) — never cache
  // index.html must always be fresh because it references hashed chunk filenames
  app.use(
    express.static(distPath, {
      maxAge: 0,
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        }
      },
    })
  )
}

// CORS configuration
// Support multiple origins for local dev, Codespaces, and Railway
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  // localhost origins only in non-production environments
  ...(IS_PRODUCTION ? [] : ['http://localhost:5173', 'http://localhost:3000']),
]

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true)
      return
    }
    // Allow Codespaces domains (*.app.github.dev)
    if (origin.endsWith('.app.github.dev')) {
      callback(null, true)
      return
    }
    // Allow Railway domains (*.up.railway.app)
    if (origin.endsWith('.up.railway.app')) {
      callback(null, true)
      return
    }
    // Allow configured origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    // In development, allow all origins
    if (!IS_PRODUCTION) {
      callback(null, true)
      return
    }
    callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
  credentials: true,
}
app.use(cors(corsOptions))

// Rate limiting - tiered limits for different endpoints
// General API: 100 requests per 15 minutes
// AI endpoints have stricter limits (configured in routes)
app.use('/api/', generalLimiter)

// Body parsing — increased to 50MB for multipage OCR payloads
// express.json sends 413 for oversized bodies; we handle it below.
app.use(express.json({ limit: '50mb' }))

// 413 Payload Too Large handler — express.json() rejects before routes fire,
// so we catch the error here via Express error middleware for user-friendly messages.
app.use(
  (
    err: Error & { type?: string; body?: any },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err.type === 'entity.too.large') {
      log.warn('Payload too large', {
        limit: '50mb',
        actual: (err as any).body?.length ?? 'unknown',
      })
      return res.status(413).json({
        error: 'Upload too large — the file or extracted text exceeds the maximum payload size.',
        code: 'PAYLOAD_TOO_LARGE',
        details: 'Maximum payload size is 50MB. Try a smaller PDF or reduce the number of pages.',
      })
    }
    next(err)
  }
)

// API metrics collection — records request timing, status, and provider info
// Must be after body parsing (needs req.body for provider detection)
app.use('/api/', apiMetrics)

// Health check endpoint (with separate, more permissive limiter)
// In production (SaaS): Hide rate limit details to prevent abuse planning
// In development: Show rate limits for debugging
app.get('/api/health', healthLimiter, async (_req, res) => {
  // Verify database connectivity (lightweight query)
  let dbHealthy = false
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, serviceKey)
      const { error } = await supabase.from('app_settings').select('key').limit(1)
      dbHealthy = !error
    }
  } catch {
    dbHealthy = false
  }

  const response: {
    status: string
    timestamp: string
    providers: { openai: boolean; anthropic: boolean; google: boolean; deepseek: boolean }
    database: boolean
    rateLimits?: {
      general: { windowMs: number; max: number }
      ai: { windowMs: number; max: number }
      ocr: { windowMs: number; max: number }
    }
  } = {
    status: dbHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    providers: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_CLOUD_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
    },
    database: dbHealthy,
  }

  // Only expose rate limit configuration in non-production environments
  if (!IS_PRODUCTION) {
    response.rateLimits = {
      general: {
        windowMs: rateLimitConfig.general.windowMs,
        max: rateLimitConfig.general.max,
      },
      ai: {
        windowMs: rateLimitConfig.ai.windowMs,
        max: rateLimitConfig.ai.max,
      },
      ocr: {
        windowMs: rateLimitConfig.ocr.windowMs,
        max: rateLimitConfig.ocr.max,
      },
    }
  }

  res.json(response)
})

// AI proxy routes (with longer timeout for AI processing)
app.use('/api/ai', requestTimeout(SERVER_CONFIG.AI_REQUEST_TIMEOUT), aiRoutes)

// Admin dashboard API routes
app.use('/api/admin', adminRoutes)

// Admin settings API routes (configuration management) — requires admin auth
app.use('/api/admin/settings', authenticateAdmin, settingsRoutes)

// Admin webhooks API routes (settings change notifications) — requires admin auth
app.use('/api/admin/webhooks', authenticateAdmin, webhookRoutes)

// Admin config drift detection routes — requires admin auth
app.use('/api/admin/drift', authenticateAdmin, driftRoutes)

// PDF extraction routes (with longer timeout for large files)
app.use('/api/pdf', requestTimeout(SERVER_CONFIG.AI_REQUEST_TIMEOUT), pdfRoutes)

// Policy routes (saves, proxy users, anonymous)
app.use('/api/policy', policyRoutes)

// FX (Currency conversion) routes
app.use('/api/fx', fxRoutes)

// Email notification routes
app.use('/api/email', emailRoutes)

// Translation routes (public GET + admin CRUD)
app.use('/api/translations', translationRoutes)

// Public config proxy (Plan B from runbook 08) — frontend reads app_settings
// here instead of directly from Supabase REST, eliminating the Cloudflare-edge
// 503 OPTIONS-preflight failure mode.
app.use('/api/config', configRoutes)

// Push notification subscription routes (Web Push API / VAPID)
app.use('/api/notifications', notificationRoutes)

// 404 handler for API routes only
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Handle client-side routing in production - serve index.html for all other routes
if (IS_PRODUCTION) {
  const distPath = path.join(__dirname, '..', '..', 'dist')

  // Return 404 for missing static assets instead of serving index.html
  // This prevents 'text/html is not a valid JavaScript MIME type' errors
  // when the browser requests stale JS/CSS chunk filenames after a deployment
  const STATIC_ASSET_RE = /\.(?:js|css|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|json)$/
  app.get(STATIC_ASSET_RE, (_req, res) => {
    res.status(404).end()
  })

  // Express 5: '*' is no longer a universal wildcard. Use regex for SPA catch-all.
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Setup Sentry error handling (must be before other error handlers)
setupSentryErrorHandler(app)

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log error (also captured by Sentry in production/staging)
  log.error('Unhandled server error', { message: err.message, stack: err.stack })

  // Capture to Sentry if not already handled by sentryErrorHandler
  if (process.env.NODE_ENV === 'development') {
    captureServerError(err)
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// Validate required environment variables before starting
const REQUIRED_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
}

const missingEnv = Object.entries(REQUIRED_ENV)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missingEnv.length > 0) {
  log.warn(
    `Missing environment variables: ${missingEnv.join(', ')} — some features will be unavailable`
  )
}

if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  log.warn(
    'No AI provider configured (OPENAI_API_KEY or ANTHROPIC_API_KEY) — extraction will not work'
  )
}

// Configure Web Push VAPID for browser push notifications
configureWebPush()

// Ensure monitoring alert rules are initialized
initializeDefaultAlertRules()

// Verify admin_notifications writability at boot (fire-and-forget; never throws).
// Surfaces RLS / env-var / migration-not-applied issues as a clear log line at startup
// instead of letting them hide until the first alert fires.
probeAdminNotifications().catch(() => {
  // probeAdminNotifications already logs internally; nothing more to do here.
})

// ── Provider Health Monitoring ──────────────────────────────────────────────
// Run boot-time provider health check (non-blocking) and start periodic checks.
// Uses dynamic import to avoid circular deps (extraction.ts imports from alert-service).
// Wire diagnostics status sink AND set up client imports BEFORE boot check
import('../server/routes/ai/extraction.js')
  .then((extraction) => {
    setDiagnosticsImports({
      getOpenAIClient: extraction.getOpenAIClient,
      getAnthropicClient: extraction.getAnthropicClient,
      getDeepSeekClient: extraction.getDeepSeekClient,
      getGeminiClient: extraction.getGeminiClient,
      getGCPCredentialsPath: extraction.getGCPCredentialsPath,
      getDocumentAIAccessToken: extraction.getDocumentAIAccessToken,
    })

    // Wire the diagnostics endpoint's status update function
    import('../server/routes/ai/diagnostics.js')
      .then((diag) => {
        setStatusSink(diag.updateProviderStatus)
      })
      .catch((err: unknown) => {
        console.error(
          '[index] Failed to wire diagnostics status sink:',
          err instanceof Error ? err.message : String(err)
        )
        log.warn('Provider health status sink not wired', {
          error: err instanceof Error ? err.message : String(err),
        })
      })

    // Run boot check after a brief delay to let the server stabilise
    setTimeout(() => {
      bootProviderCheck()
    }, 5_000)

    // Start periodic checks every 15 minutes
    startPeriodicHealthCheck(15 * 60 * 1000)
  })
  .catch((err: unknown) => {
    // import failure — log via a synchronous logger (the standard one is already imported)
    console.error(
      '[index] Failed to wire provider health monitor:',
      err instanceof Error ? err.message : String(err)
    )
    log.warn('Provider health monitor not wired — dynamic import failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  })

// Start server
// eslint-disable-next-line prefer-const -- server declared above for graceful shutdown handling
server = app.listen(PORT, () => {
  log.info(`InsurAI API server running on port ${PORT}`)
  // Only show detailed provider configuration in non-production
  // to prevent information leakage about server capabilities
  if (!IS_PRODUCTION) {
    log.info('Health check endpoint', { url: `http://localhost:${PORT}/api/health` })
    log.info('Configured providers', {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_CLOUD_API_KEY,
    })
    log.info('Server configuration', {
      requestTimeoutMs: SERVER_CONFIG.REQUEST_TIMEOUT,
      aiRequestTimeoutMs: SERVER_CONFIG.AI_REQUEST_TIMEOUT,
      shutdownTimeoutMs: SERVER_CONFIG.SHUTDOWN_TIMEOUT,
    })
  }
})

// Configure server timeouts
server.timeout = SERVER_CONFIG.KEEP_ALIVE_TIMEOUT
server.keepAliveTimeout = SERVER_CONFIG.KEEP_ALIVE_TIMEOUT
server.headersTimeout = SERVER_CONFIG.HEADERS_TIMEOUT

// Track connections for graceful shutdown
server.on('connection', (socket) => {
  activeConnections.add(socket)
  socket.on('close', () => {
    activeConnections.delete(socket)
  })
})

/**
 * Graceful shutdown handler
 * Ensures all active requests complete before shutting down
 */
let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress')
    return
  }

  isShuttingDown = true
  log.info('Starting graceful shutdown', { signal })

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      log.error('Error closing server', { message: err.message })
      process.exit(1)
    }
  })

  // Set a timeout for graceful shutdown
  const shutdownTimeout = setTimeout(() => {
    log.error('Graceful shutdown timed out, forcing exit', {
      timeoutMs: SERVER_CONFIG.SHUTDOWN_TIMEOUT,
    })
    // Force close remaining connections
    activeConnections.forEach((socket) => {
      socket.destroy()
    })
    process.exit(1)
  }, SERVER_CONFIG.SHUTDOWN_TIMEOUT)

  // Wait for all connections to close
  const checkConnections = setInterval(() => {
    if (activeConnections.size === 0) {
      clearInterval(checkConnections)
      clearTimeout(shutdownTimeout)
      log.info('All connections closed. Server shutdown complete.')
      process.exit(0)
    } else if (!IS_PRODUCTION) {
      log.debug('Waiting for connections to close', { remaining: activeConnections.size })
    }
  }, 1000)

  // Signal to load balancers that we're shutting down
  // by returning 503 for health checks
  app.get('/api/health', (_req, res) => {
    res.status(503).json({
      status: 'shutting_down',
      message: 'Server is shutting down',
    })
  })
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { message: error.message, stack: error.stack })
  captureServerError(error)
  gracefulShutdown('uncaughtException')
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', { reason: String(reason), promise: String(promise) })
  if (reason instanceof Error) {
    captureServerError(reason)
  }
  // Don't exit on unhandled rejection in production, just log it
  if (!IS_PRODUCTION) {
    gracefulShutdown('unhandledRejection')
  }
})

export default app
export { server, gracefulShutdown, SERVER_CONFIG }
