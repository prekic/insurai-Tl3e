import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/supabase/auth-context'
import { PageLoader } from './PageLoader'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isConfigured } = useAuth()
  const location = useLocation()

  // If Supabase is not configured, allow access (demo mode)
  if (!isConfigured) {
    return <>{children}</>
  }

  // Show loading while checking auth state
  if (loading) {
    return <PageLoader />
  }

  // Redirect to auth page if not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
