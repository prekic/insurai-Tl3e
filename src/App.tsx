import { useEffect, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n } from './lib/i18n'
import { onSyncComplete } from './lib/pwa'
import { PolicyProvider } from './lib/policy-context'
import { AuthProvider } from './lib/supabase/auth-context'
import { AdminAuthProvider } from './lib/admin/context'
import { GlobalNavigation } from './components/GlobalNavigation'
import { PageTransition } from './components/animations/AnimatedComponents'
import { PageLoader } from './components/PageLoader'
import { ProtectedRoute } from './components/ProtectedRoute'

// LandingPage loaded eagerly — it's the entry point, must render without Suspense CLS
import { LandingPage } from './components/LandingPage'
import { lazyRetry } from './utils/lazyRetry'

// Lazy-loaded route components for code splitting
const PolicyUpload = lazyRetry(
  () => import('./components/PolicyUpload').then((m) => ({ default: m.PolicyUpload })),
  'PolicyUpload'
)
const PolicyDashboard = lazyRetry(
  () => import('./components/PolicyDashboard').then((m) => ({ default: m.PolicyDashboard })),
  'PolicyDashboard'
)
const PolicyDetailView = lazyRetry(
  () => import('./components/PolicyDetailView').then((m) => ({ default: m.PolicyDetailView })),
  'PolicyDetailView'
)
const PolicyChat = lazyRetry(
  () => import('./components/PolicyChat').then((m) => ({ default: m.PolicyChat })),
  'PolicyChat'
)
const MyAccount = lazyRetry(
  () => import('./components/MyAccount').then((m) => ({ default: m.MyAccount })),
  'MyAccount'
)
const Settings = lazyRetry(
  () => import('./components/Settings').then((m) => ({ default: m.Settings })),
  'Settings'
)
const HelpCenter = lazyRetry(
  () => import('./components/HelpCenter').then((m) => ({ default: m.HelpCenter })),
  'HelpCenter'
)
const AllSamplesDemo = lazyRetry(
  () => import('./components/AllSamplesDemo').then((m) => ({ default: m.AllSamplesDemo })),
  'AllSamplesDemo'
)
const ComparePolicies = lazyRetry(
  () => import('./components/ComparePolicies').then((m) => ({ default: m.ComparePolicies })),
  'ComparePolicies'
)
const NotFound = lazyRetry(
  () => import('./components/NotFound').then((m) => ({ default: m.NotFound })),
  'NotFound'
)
const AuthPage = lazyRetry(
  () => import('./components/AuthPage').then((m) => ({ default: m.AuthPage })),
  'AuthPage'
)
const TryAnalysis = lazyRetry(
  () => import('./components/TryAnalysis').then((m) => ({ default: m.TryAnalysis })),
  'TryAnalysis'
)
const SharedResult = lazyRetry(
  () => import('./components/SharedResult').then((m) => ({ default: m.SharedResult })),
  'SharedResult'
)
const UnsubscribePage = lazyRetry(
  () => import('./components/UnsubscribePage').then((m) => ({ default: m.UnsubscribePage })),
  'UnsubscribePage'
)
const AdminDashboard = lazyRetry(
  () => import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
  'AdminDashboard'
)
const AdminLogin = lazyRetry(
  () => import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })),
  'AdminLogin'
)

// Route configuration
const ROUTES = {
  home: '/',
  auth: '/auth',
  try: '/try', // Free trial analysis (no auth required)
  trialPolicy: '/policy/trial', // Trial analysis result view (no auth required)
  share: '/share/:shareId', // Shared trial result (no auth required)
  unsubscribe: '/unsubscribe', // Email unsubscribe (no auth required)
  upload: '/upload',
  dashboard: '/dashboard',
  policy: '/policy/:id',
  compare: '/compare',
  chat: '/chat',
  account: '/account',
  settings: '/settings',
  help: '/help',
  samples: '/samples',
  admin: '/admin',
  adminLogin: '/admin/login',
} as const

// Main App component wrapped with providers
export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider defaultLocale="tr">
        <AuthProvider>
          <PolicyProvider>
            <AppContent />
          </PolicyProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}

// Inner app content that handles routing
function AppContent() {
  const location = useLocation()
  const { t, isLoading } = useI18n()
  const isLandingPage = location.pathname === '/'
  const isAuthPage = location.pathname === '/auth'
  const isAdminPage = location.pathname.startsWith('/admin')
  const isUnsubscribePage = location.pathname === '/unsubscribe'
  const hideNavigation = isLandingPage || isAuthPage || isAdminPage || isUnsubscribePage

  // Get page title for screen readers
  const getPageTitle = (): string => {
    const path = location.pathname
    if (path === '/') return t.nav.home
    if (path === '/upload') return t.upload.title
    if (path === '/dashboard') return t.nav.dashboard
    if (path.startsWith('/policy/')) return t.policy.policy
    if (path === '/compare') return t.nav.compare
    if (path === '/chat') return t.chat.title
    if (path === '/account') return t.account.title
    if (path === '/settings') return t.settings.title
    if (path === '/help') return t.help.title
    if (path === '/samples') return t.policy.policies
    return t.nav.home
  }

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Show toast when background sync completes (e.g., offline-queued uploads replay)
  useEffect(() => {
    const unsubscribe = onSyncComplete(({ synced }) => {
      if (synced > 0) {
        const label = synced === 1 ? t.upload.analysisComplete : t.upload.analysisComplete
        toast.success(label, {
          description: synced === 1 ? t.upload.savedToCloud : `${synced} ${t.upload.savedToCloud}`,
        })
      }
    })
    return unsubscribe
  }, [t.upload.analysisComplete, t.upload.savedToCloud])

  return (
    <ErrorBoundary>
      {/* Skip to main content link for keyboard users */}
      <a href="#main-content" className="skip-to-main">
        {t.a11y.skipToContent}
      </a>

      {/* Screen reader announcement for page changes */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {`${t.a11y.nowViewing}: ${getPageTitle()}`}
      </div>

      <Toaster position="top-right" richColors />

      {/* Global Navigation - Show on all pages except landing and auth */}
      {!hideNavigation && <GlobalNavigation />}

      <main id="main-content" tabIndex={-1} className="w-full max-w-[100vw] overflow-x-hidden">
        {isLoading ? (
          <PageLoader />
        ) : (
          <Suspense fallback={<PageLoader />}>
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/auth"
                element={
                  <PageTransition>
                    <AuthPage />
                  </PageTransition>
                }
              />
              <Route
                path="/try"
                element={
                  <PageTransition>
                    <TryAnalysis />
                  </PageTransition>
                }
              />
              <Route
                path="/policy/trial"
                element={
                  <PageTransition>
                    <PolicyDetailView />
                  </PageTransition>
                }
              />
              <Route
                path="/share/:shareId"
                element={
                  <PageTransition>
                    <SharedResult />
                  </PageTransition>
                }
              />
              <Route
                path="/unsubscribe"
                element={
                  <PageTransition>
                    <UnsubscribePage />
                  </PageTransition>
                }
              />
              <Route
                path="/upload"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <PolicyUpload />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <PolicyDashboard />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/policy/:id"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <PolicyDetailView />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/compare"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <ComparePolicies />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <PolicyChat />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <MyAccount />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <Settings />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/help"
                element={
                  <PageTransition>
                    <HelpCenter />
                  </PageTransition>
                }
              />
              <Route
                path="/samples"
                element={
                  <PageTransition>
                    <AllSamplesDemo />
                  </PageTransition>
                }
              />
              {/* Admin Routes - separate auth, no standard navigation */}
              <Route
                path="/admin/login"
                element={
                  <AdminAuthProvider>
                    <AdminLogin />
                  </AdminAuthProvider>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <AdminAuthProvider>
                    <AdminDashboard />
                  </AdminAuthProvider>
                }
              />
              {/* 404 catch-all route - must be last */}
              <Route
                path="*"
                element={
                  <PageTransition>
                    <NotFound />
                  </PageTransition>
                }
              />
            </Routes>
          </Suspense>
        )}
      </main>
    </ErrorBoundary>
  )
}

// Export routes for use in other components
export { ROUTES }
