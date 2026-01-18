/**
 * Admin Authentication Context
 * Manages admin auth state throughout the admin panel
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import * as adminApi from './api'
import type { AdminUser } from './types'

interface AdminAuthState {
  user: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AdminAuthContextType extends AdminAuthState {
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  })

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = adminApi.getAccessToken()
      if (!token) {
        setState(prev => ({ ...prev, isLoading: false }))
        return
      }

      const result = await adminApi.getCurrentUser()
      if (result.success && result.data) {
        setState({
          user: result.data,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        })
      } else {
        adminApi.clearTokens()
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        })
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    const result = await adminApi.login(email, password)

    if (result.success && result.data) {
      setState({
        user: result.data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
      return true
    } else {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: result.error || 'Login failed',
      }))
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    await adminApi.logout()
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    })
  }, [])

  const refreshUser = useCallback(async () => {
    const result = await adminApi.getCurrentUser()
    if (result.success && result.data) {
      setState(prev => ({ ...prev, user: result.data! }))
    }
  }, [])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  return (
    <AdminAuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext)
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  }
  return context
}

// Protected route wrapper
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAdminAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redirect to login
    window.location.href = '/admin/login'
    return null
  }

  return <>{children}</>
}

// Super admin only wrapper
export function RequireSuperAdmin({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { user } = useAdminAuth()

  if (user?.role !== 'super_admin') {
    return fallback ? <>{fallback}</> : (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">This feature requires super admin privileges.</p>
      </div>
    )
  }

  return <>{children}</>
}
