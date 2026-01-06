/**
 * InsurAI Backend API Server
 *
 * Provides secure proxy endpoints for AI services, keeping API keys server-side.
 * This prevents exposure of sensitive API keys in the browser.
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

// Load environment variables first (before Sentry init)
dotenv.config()

import aiRoutes from './routes/ai'
import {
  generalLimiter,
  healthLimiter,
  rateLimitConfig,
} from './middleware/rate-limit'
import {
  initServerSentry,
  sentryRequestHandler,
  sentryErrorHandler,
  captureServerError,
} from './lib/sentry'

// Initialize Sentry for error tracking
initServerSentry()

const app = express()
const PORT = process.env.API_PORT || 4001
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const IS_STAGING = process.env.NODE_ENV === 'staging'

// Sentry request handler must be first middleware
if (IS_PRODUCTION || IS_STAGING) {
  app.use(sentryRequestHandler())
}

// Security middleware with CSP configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
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
          // Development WebSocket (Vite HMR)
          ...(IS_PRODUCTION ? [] : ['ws://localhost:*', 'wss://localhost:*']),
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
      },
      reportOnly: false,
    },
    // Additional security headers
    crossOriginEmbedderPolicy: false, // Disable for Supabase compatibility
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}
app.use(cors(corsOptions))

// Rate limiting - tiered limits for different endpoints
// General API: 100 requests per 15 minutes
// AI endpoints have stricter limits (configured in routes)
app.use('/api/', generalLimiter)

// Body parsing
app.use(express.json({ limit: '10mb' }))

// Health check endpoint (with separate, more permissive limiter)
// In production (SaaS): Hide rate limit details to prevent abuse planning
// In development: Show rate limits for debugging
app.get('/api/health', healthLimiter, (_req, res) => {
  const response: {
    status: string
    timestamp: string
    providers: { openai: boolean; anthropic: boolean; google: boolean }
    rateLimits?: {
      general: { windowMs: number; max: number }
      ai: { windowMs: number; max: number }
      ocr: { windowMs: number; max: number }
    }
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_CLOUD_API_KEY,
    },
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

// AI proxy routes
app.use('/api/ai', aiRoutes)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Sentry error handler must be before other error handlers
if (IS_PRODUCTION || IS_STAGING) {
  app.use(sentryErrorHandler())
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log error (also captured by Sentry in production/staging)
  console.error('Server error:', err)

  // Capture to Sentry if not already handled by sentryErrorHandler
  if (process.env.NODE_ENV === 'development') {
    captureServerError(err)
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 InsurAI API server running on port ${PORT}`)
  // Only show detailed provider configuration in non-production
  // to prevent information leakage about server capabilities
  if (!IS_PRODUCTION) {
    console.log(`   Health check: http://localhost:${PORT}/api/health`)
    console.log('')
    console.log('   Configured providers:')
    console.log(`   - OpenAI:    ${process.env.OPENAI_API_KEY ? '✓' : '✗'}`)
    console.log(`   - Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}`)
    console.log(`   - Google:    ${process.env.GOOGLE_CLOUD_API_KEY ? '✓' : '✗'}`)
  }
})

export default app
