import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n } from './lib/i18n'
import { PolicyProvider } from './lib/policy-context'
import { GlobalNavigation } from './components/GlobalNavigation'
import { PageTransition } from './components/animations/AnimatedComponents'
import { PageLoader } from './components/PageLoader'

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
const NotFound = lazy(() =>
  import('./components/NotFound').then((m) => ({ default: m.NotFound }))
)

// Route configuration
const ROUTES = {
  home: '/',
  upload: '/upload',
  dashboard: '/dashboard',
  policy: '/policy/:id',
  chat: '/chat',
  account: '/account',
  settings: '/settings',
  help: '/help',
  samples: '/samples',
} as const

// Main App component wrapped with providers
export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <PolicyProvider>
          <AppContent />
        </PolicyProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}

// Inner app content that handles routing
function AppContent() {
  const location = useLocation()
  const { t } = useI18n()
  const isLandingPage = location.pathname === '/'

  // Get page title for screen readers
  const getPageTitle = (): string => {
    const path = location.pathname
    if (path === '/') return t.nav.home
    if (path === '/upload') return t.upload.title
    if (path === '/dashboard') return t.nav.dashboard
    if (path.startsWith('/policy/')) return t.policy.policy
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

      {/* Global Navigation - Show on all pages except landing */}
      {!isLandingPage && <GlobalNavigation />}

      <main id="main-content" tabIndex={-1}>
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
                path="/upload"
                element={
                  <PageTransition>
                    <PolicyUpload />
                  </PageTransition>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <PageTransition>
                    <PolicyDashboard />
                  </PageTransition>
                }
              />
              <Route
                path="/policy/:id"
                element={
                  <PageTransition>
                    <PolicyDetailView />
                  </PageTransition>
                }
              />
              <Route
                path="/chat"
                element={
                  <PageTransition>
                    <PolicyChat />
                  </PageTransition>
                }
              />
              <Route
                path="/account"
                element={
                  <PageTransition>
                    <MyAccount />
                  </PageTransition>
                }
              />
              <Route
                path="/settings"
                element={
                  <PageTransition>
                    <Settings />
                  </PageTransition>
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
