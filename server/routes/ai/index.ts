import { Router } from 'express'
import extractionRouter from './extraction.js'
import chatRouter from './chat.js'
import diagnosticsRouter from './diagnostics.js'
import auditJudgeRouter from './audit-judge.js'

const router = Router()

// Mount all AI sub-routers to the same base path
router.use('/', extractionRouter)
router.use('/', chatRouter)
router.use('/', diagnosticsRouter)
router.use('/', auditJudgeRouter)

export default router
