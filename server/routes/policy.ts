import { Router, Request, Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { getSupabaseWithError } from '../middleware/admin-auth.js'
import { logger } from '../lib/logger.js'
import { generalLimiter } from '../middleware/rate-limit.js'

const log = logger.child('Policy')

const router = Router()

// Configure multer for PDF uploads (memory storage, 50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 1,
  },
})

/**
 * POST /api/policy/save-anonymous
 * Persists an anonymously extracted policy and document to the database
 */
router.post(
  '/save-anonymous',
  generalLimiter,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file
      const extractionResultRaw = req.body.extractionResult

      if (!file) {
        res.status(400).json({ success: false, error: 'No PDF file uploaded' })
        return
      }

      if (!extractionResultRaw) {
        res.status(400).json({ success: false, error: 'Missing extractionResult' })
        return
      }

      const extractionResult =
        typeof extractionResultRaw === 'string'
          ? JSON.parse(extractionResultRaw)
          : extractionResultRaw

      const { client: supabase, error: supabaseError } = getSupabaseWithError()
      if (!supabase) {
        log.error('Supabase not configured', { error: supabaseError })
        res.status(500).json({ success: false, error: 'Database not configured' })
        return
      }

      // Extract client metadata
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string
      const locale = req.headers['accept-language']?.split(',')[0] || 'tr'

      const ipString = Array.isArray(ip) ? ip[0] : ip
      const timestamp = Date.now()
      const randomSuffix = crypto.randomUUID().substring(0, 8)
      const fakeEmail = `anon_${timestamp}_${randomSuffix}@anonymous.insurai.local`
      const fullName = `Anonymous Client [${ipString}]`

      // 1. Create a dummy auth.users record using the service role client
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: crypto.randomBytes(32).toString('hex'), // Secure random password they will never use
        email_confirm: true,
        user_metadata: {
          is_anonymous: true,
          location_ip: ipString,
          locale,
          full_name: fullName,
        },
      })

      if (authError || !authData.user) {
        log.error('Failed to create anonymous proxy user', { error: authError?.message })
        res.status(500).json({ success: false, error: 'Failed to create anonymous context' })
        return
      }

      const userId = authData.user.id

      // Note: The public.users row might be created automatically via a Supabase trigger,
      // but in some schemas, we create it manually. Assuming the trigger exists, or we leave it.

      // 2. Upload file to Supabase Storage
      const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${userId}/${timestamp}_${cleanFileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        log.error('Failed to upload document for anonymous user', { error: uploadError.message })
        res.status(500).json({ success: false, error: 'Failed to store document' })
        return
      }
      // 3. Insert the Policy record into the database
      const policyData = {
        user_id: userId,
        policy_data: extractionResult,
        status: 'active',
        // Depending on your database schema, you might need to supply other fields
      }

      const { error: policyInsertError } = await supabase.from('policies').insert(policyData)

      if (policyInsertError) {
        log.error('Failed to insert anonymous policy', { error: policyInsertError.message })
        res.status(500).json({ success: false, error: 'Failed to insert policy' })
        return
      }

      res.status(200).json({
        success: true,
        message: 'Anonymous policy saved successfully',
      })
    } catch (error) {
      log.error('Anonymous policy save failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({
        success: false,
        error: 'Internal server error while saving anonymous policy',
      })
    }
  }
)

export default router
