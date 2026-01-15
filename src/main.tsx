import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prevent horizontal scroll on mobile - safety net
// This runs before React renders to ensure no horizontal scroll
if (typeof window !== 'undefined') {
  // Prevent horizontal scroll by resetting scrollLeft
  const preventHorizontalScroll = () => {
    if (window.scrollX > 0) {
      window.scrollTo(0, window.scrollY)
    }
  }

  // Run on scroll to prevent horizontal scrolling
  window.addEventListener('scroll', preventHorizontalScroll, { passive: true })

  // Also run after DOM mutations (in case content changes cause overflow)
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(preventHorizontalScroll)
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    })
  }
}

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
