/**
 * InsurAI Backend API Server
 *
 * Provides secure proxy endpoints for AI services, keeping API keys server-side.
 * This prevents exposure of sensitive API keys in the browser.
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import aiRoutes from './routes/ai'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.API_PORT || 3001

// Security middleware
app.use(helmet())

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}
app.use(cors(corsOptions))

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', limiter)

// Body parsing
app.use(express.json({ limit: '10mb' }))

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_CLOUD_API_KEY,
    },
  })
})

// AI proxy routes
app.use('/api/ai', aiRoutes)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 InsurAI API server running on port ${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/api/health`)
  console.log('')
  console.log('   Configured providers:')
  console.log(`   - OpenAI:    ${process.env.OPENAI_API_KEY ? '✓' : '✗'}`)
  console.log(`   - Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}`)
  console.log(`   - Google:    ${process.env.GOOGLE_CLOUD_API_KEY ? '✓' : '✗'}`)
})

export default app
