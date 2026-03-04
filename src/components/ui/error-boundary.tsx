import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from './button'
import { useI18n } from '@/lib/i18n'

interface TranslatedStrings {
  title: string
  description: string
  tryAgain: string
  goHome: string
  errorDetails: string
}

const DEFAULT_STRINGS: TranslatedStrings = {
  title: 'Something went wrong',
  description: 'We encountered an unexpected error. Please try again or return to the homepage.',
  tryAgain: 'Try Again',
  goHome: 'Go Home',
  errorDetails: 'Error Details',
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  strings?: TranslatedStrings
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the whole app
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error to console in development
    console.error('Error caught by ErrorBoundary:', error, errorInfo)

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  render(): ReactNode {
    const s = this.props.strings ?? DEFAULT_STRINGS

    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Error Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">{s.title}</h2>
              <p className="text-gray-600">{s.description}</p>
            </div>

            {/* Error Details (Development Only) */}
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left bg-gray-50 rounded-lg p-4 text-sm">
                <summary className="cursor-pointer font-medium text-gray-700 flex items-center gap-2">
                  <Bug size={16} />
                  {s.errorDetails}
                </summary>
                <pre className="mt-2 text-red-600 whitespace-pre-wrap break-words overflow-auto max-h-48">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} className="gap-2">
                <RefreshCw size={16} />
                {s.tryAgain}
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home size={16} />
                {s.goHome}
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook-friendly error boundary wrapper for async errors
 */
interface AsyncErrorBoundaryProps {
  children: ReactNode
  resetKey?: string | number
}

export function AsyncErrorBoundary({ children, resetKey }: AsyncErrorBoundaryProps) {
  const { t } = useI18n()
  const strings: TranslatedStrings = {
    title: t.errorBoundary.title,
    description: t.errorBoundary.description,
    tryAgain: t.errorBoundary.tryAgain,
    goHome: t.errorBoundary.goHome,
    errorDetails: t.errorBoundary.errorDetails,
  }
  return (
    <ErrorBoundary key={resetKey} strings={strings}>
      {children}
    </ErrorBoundary>
  )
}

/**
 * Page error fallback UI — functional component that uses useI18n
 */
function PageErrorFallback() {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">{t.errorBoundary.pageError}</h1>
          <p className="text-gray-600">{t.errorBoundary.pageErrorDesc}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => window.location.reload()} size="lg" className="gap-2">
            <RefreshCw size={18} />
            {t.errorBoundary.reloadPage}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => (window.location.href = '/')}
            className="gap-2"
          >
            <Home size={18} />
            {t.errorBoundary.backToHome}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Page-level error boundary with full-screen fallback
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={<PageErrorFallback />}>{children}</ErrorBoundary>
}
