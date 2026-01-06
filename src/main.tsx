import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Initialize error tracking first (before anything else can error)
import { initSentry } from './lib/sentry'
initSentry()

// Initialize Core Web Vitals monitoring
import { initWebVitals } from './lib/performance'
initWebVitals()

// Set up CSP violation monitoring
import { setupCSPViolationListener } from './lib/security/csp'
setupCSPViolationListener()

// Validate environment on startup
import { validateEnvironment } from './lib/env'
validateEnvironment()

// Initialize PWA and service worker for offline support
// Only in production to avoid caching issues during development
if (import.meta.env.PROD) {
  import('./lib/pwa').then(({ initializePWA }) => {
    initializePWA({
      swPath: '/sw.js',
      swScope: '/',
      enableOfflineAnalytics: true,
      enableBackgroundSync: true,
      cacheStrategy: 'aggressive',
    })
  })
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
