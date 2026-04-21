import { Router } from 'express'
import extractionRouter from './extraction'
import chatRouter from './chat'
import diagnosticsRouter from './diagnostics'

const router = Router()

// Mount all AI sub-routers to the same base path
router.use('/', extractionRouter)
router.use('/', chatRouter)
router.use('/', diagnosticsRouter)

export default router
