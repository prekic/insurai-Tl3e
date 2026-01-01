import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Initialize error tracking first (before anything else can error)
import { initSentry } from './lib/sentry'
initSentry()

// Set up CSP violation monitoring
import { setupCSPViolationListener } from './lib/security/csp'
setupCSPViolationListener()

// Validate environment on startup
import { validateEnvironment } from './lib/env'
validateEnvironment()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
