/**
 * Admin API Routes – Index
 *
 * Combines all admin sub-routers into a single Express Router
 * that is mounted at /api/admin in server/index.ts.
 *
 * Each sub-router registers its own route paths (e.g. /auth/login,
 * /users, /monitoring/metrics) so they are used as-is via `router.use('/', ...)`.
 */

import { Router } from 'express'

import authRouter from './auth.js'
import usersRouter from './users.js'
import operationsRouter from './operations.js'
import promptsRouter from './prompts.js'
import costRouter from './cost.js'
import monitoringRouter from './monitoring.js'
import contentRouter from './content.js'

const router = Router()

router.use('/', authRouter)
router.use('/', usersRouter)
router.use('/', operationsRouter)
router.use('/', promptsRouter)
router.use('/', costRouter)
router.use('/', monitoringRouter)
router.use('/', contentRouter)

export default router
