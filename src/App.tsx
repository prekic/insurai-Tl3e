import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n } from './lib/i18n'
import { PolicyProvider } from './lib/policy-context'
import { AuthProvider } from './lib/supabase/auth-context'
import { GlobalNavigation } from './components/GlobalNavigation'
import { PageTransition } from './components/animations/AnimatedComponents'
import { PageLoader } from './components/PageLoader'
import { ProtectedRoute } from './components/ProtectedRoute'

// Lazy-loaded route components for code splitting
const LandingPage = lazy(() =>
  import('./components/LandingPage').then((m) => ({ default: m.LandingPage }))
)
const PolicyUpload = lazy(() =>
  import('./components/PolicyUpload').then((m) => ({ default: m.PolicyUpload }))
)
const PolicyDashboard = lazy(() =>
  import('./components/PolicyDashboard').then((m) => ({ default: m.PolicyDashboard }))
)
const PolicyDetailView = lazy(() =>
  import('./components/PolicyDetailView').then((m) => ({ default: m.PolicyDetailView }))
)
const PolicyChat = lazy(() =>
  import('./components/PolicyChat').then((m) => ({ default: m.PolicyChat }))
)
const MyAccount = lazy(() =>
  import('./components/MyAccount').then((m) => ({ default: m.MyAccount }))
)
const Settings = lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
)
const HelpCenter = lazy(() =>
  import('./components/HelpCenter').then((m) => ({ default: m.HelpCenter }))
)
const AllSamplesDemo = lazy(() =>
  import('./components/AllSamplesDemo').then((m) => ({ default: m.AllSamplesDemo }))
)
const ComparePolicies = lazy(() =>
  import('./components/ComparePolicies').then((m) => ({ default: m.ComparePolicies }))
)
const NotFound = lazy(() =>
  import('./components/NotFound').then((m) => ({ default: m.NotFound }))
)
const AuthPage = lazy(() =>
  import('./components/AuthPage').then((m) => ({ default: m.AuthPage }))
)
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
)
const AdminLogin = lazy(() =>
  import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin }))
)

// Route configuration
const ROUTES = {
  home: '/',
  auth: '/auth',
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
  const { t } = useI18n()
  const isLandingPage = location.pathname === '/'
  const isAuthPage = location.pathname === '/auth'
  const isAdminPage = location.pathname.startsWith('/admin')
  const hideNavigation = isLandingPage || isAuthPage || isAdminPage

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
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <PageTransition>
                    <LandingPage />
                  </PageTransition>
                }
              />
              <Route
                path="/auth"
                element={
                  <PageTransition>
                    <AuthPage />
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
                element={<AdminLogin />}
              />
              <Route
                path="/admin/*"
                element={<AdminDashboard />}
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
          </AnimatePresence>
        </Suspense>
      </main>
    </ErrorBoundary>
  )
}

// Export routes for use in other components
export { ROUTES }
