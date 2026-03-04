import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from './ui/button'
import { captureError, addBreadcrumb } from '@/lib/sentry'
import { useI18n } from '@/lib/i18n'

interface TranslatedStrings {
  title: string
  description: string
  tryAgain: string
  goHome: string
  errorDetails: string
  inlineError: string
  inlineTryAgain: string
}

const DEFAULT_STRINGS: TranslatedStrings = {
  title: 'Something went wrong',
  description:
    "We're sorry, but something unexpected happened. Please try refreshing the page or go back to the home page.",
  tryAgain: 'Try Again',
  goHome: 'Go Home',
  errorDetails: 'Details',
  inlineError: 'Error',
  inlineTryAgain: 'Try again',
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  strings?: TranslatedStrings
}

interface State {
  hasError: boolean
  error: Error | null
  eventId: string | null
}

export class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, eventId: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // Report to Sentry in production
    const eventId = captureError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: 'AppErrorBoundary',
    })

    if (eventId) {
      this.setState({ eventId })
    }

    // Add breadcrumb for context
    addBreadcrumb('Error boundary triggered', 'error', {
      errorMessage: error.message,
      componentStack: errorInfo.componentStack?.slice(0, 500),
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, eventId: null })
    this.props.onReset?.()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, eventId: null })
    window.location.href = '/'
  }

  render() {
    const s = this.props.strings ?? DEFAULT_STRINGS

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-600" size={32} />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">{s.title}</h1>

            <p className="text-gray-600 mb-6">{s.description}</p>

            {this.state.error && (
              <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm font-mono text-red-600 break-all">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">
                      {s.errorDetails}
                    </summary>
                    <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReset} className="gap-2">
                <RefreshCw size={18} />
                {s.tryAgain}
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="gap-2">
                <Home size={18} />
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
 * i18n-aware ErrorBoundary wrapper that injects translated strings
 */
export function ErrorBoundary({ children, fallback, onReset }: Omit<Props, 'strings'>) {
  const { t } = useI18n()

  const strings: TranslatedStrings = {
    title: t.errorBoundary.title,
    description: t.errorBoundary.description,
    tryAgain: t.errorBoundary.tryAgain,
    goHome: t.errorBoundary.goHome,
    errorDetails: t.errorBoundary.errorDetails,
    inlineError: t.errorBoundary.inlineError,
    inlineTryAgain: t.errorBoundary.inlineTryAgain,
  }

  return (
    <ErrorBoundaryClass strings={strings} fallback={fallback} onReset={onReset}>
      {children}
    </ErrorBoundaryClass>
  )
}

// Smaller inline error component for sections
interface InlineErrorProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function InlineError({ title, message, onRetry }: InlineErrorProps) {
  const { t } = useI18n()
  const displayTitle = title ?? t.errorBoundary.inlineError

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="text-red-600" size={16} />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-red-800">{displayTitle}</h4>
          <p className="text-sm text-red-600 mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 flex items-center gap-1"
            >
              <RefreshCw size={14} />
              {t.errorBoundary.inlineTryAgain}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
