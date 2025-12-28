import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n } from './lib/i18n'
import { PolicyProvider } from './lib/policy-context'
import { LandingPage } from './components/LandingPage'
import { PolicyUpload } from './components/PolicyUpload'
import { PolicyDashboard } from './components/PolicyDashboard'
import { PolicyDetailView } from './components/PolicyDetailView'
import { PolicyChat } from './components/PolicyChat'
import { GlobalNavigation } from './components/GlobalNavigation'
import { MyAccount } from './components/MyAccount'
import { Settings } from './components/Settings'
import { HelpCenter } from './components/HelpCenter'
import { AllSamplesDemo } from './components/AllSamplesDemo'
import { PageTransition } from './components/animations/AnimatedComponents'

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
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`${t.a11y.nowViewing}: ${getPageTitle()}`}
      </div>

      <Toaster position="top-right" richColors />

      {/* Global Navigation - Show on all pages except landing */}
      {!isLandingPage && <GlobalNavigation />}

      <main id="main-content" tabIndex={-1}>
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
          </Routes>
        </AnimatePresence>
      </main>
    </ErrorBoundary>
  )
}

// Export routes for use in other components
export { ROUTES }
