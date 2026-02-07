/**
 * Admin User Management Routes (Super Admin Only)
 *
 * Endpoints: /users (GET, POST), /users/:id (PUT, DELETE)
 */

import { Router, Response } from 'express'
import {
  requireSuperAdmin,
  hashPassword,
  getAdminUserByEmail,
  logAdminAction,
  adminDb,
  qstr,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const router = Router()

/**
 * List all admin users
 * GET /api/admin/users
 */
router.get('/users', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await adminDb.getAdminUsers()

    // Log access
    await logAdminAction(req, 'view', 'admin_users')

    res.json({ success: true, data: users })
  } catch (error) {
    console.error('Failed to list admin users:', error)
    res.status(500).json({ success: false, error: 'Failed to list admin users' })
  }
})

/**
 * Create new admin user
 * POST /api/admin/users
 */
router.post('/users', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, role, displayName, permissions } = req.body

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      })
      return
    }

    // Check if user already exists
    const existing = await getAdminUserByEmail(email)
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'User with this email already exists',
        code: 'USER_EXISTS',
      })
      return
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await adminDb.createAdminUser({
      email: email.toLowerCase(),
      passwordHash,
      role: role || 'admin',
      displayName,
      permissions: permissions || [],
    })

    // Log action
    await logAdminAction(req, 'create', 'admin_user', newUser?.id, undefined, {
      email,
      role: role || 'admin',
    })

    res.json({
      success: true,
      data: newUser,
    })
  } catch (error) {
    console.error('Failed to create admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to create admin user' })
  }
})

/**
 * Update admin user
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)
    const { role, status, displayName, permissions, password } = req.body

    const updates: Record<string, any> = {}
    if (role) updates.role = role
    if (status) updates.status = status
    if (displayName !== undefined) updates.display_name = displayName
    if (permissions) updates.permissions = permissions
    if (password) updates.password_hash = await hashPassword(password)

    const updated = await adminDb.updateAdminUser(id, updates)

    if (!updated) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update', 'admin_user', id, undefined, updates)

    res.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to update admin user' })
  }
})

/**
 * Delete admin user
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = qstr(req.params.id)

    // Prevent self-deletion
    if (id === req.adminUser?.id) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
        code: 'SELF_DELETE_FORBIDDEN',
      })
      return
    }

    const deleted = await adminDb.deleteAdminUser(id)

    if (!deleted) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'delete', 'admin_user', id)

    res.json({ success: true, message: 'User deleted' })
  } catch (error) {
    console.error('Failed to delete admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to delete admin user' })
  }
})

export default router
