import { Router } from 'express'
import extractionRouter from './extraction.js'
import chatRouter from './chat.js'
import diagnosticsRouter from './diagnostics.js'

const router = Router()

// Mount all AI sub-routers to the same base path
router.use('/', extractionRouter)
router.use('/', chatRouter)
router.use('/', diagnosticsRouter)

export default router
