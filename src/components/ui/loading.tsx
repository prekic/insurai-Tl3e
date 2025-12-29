import { Loader2, FileText, Shield, Sparkles } from 'lucide-react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
}

/**
 * Simple spinner component
 */
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <Loader2
      className={`animate-spin text-blue-600 ${sizeClasses[size]} ${className}`}
      aria-label="Loading"
    />
  )
}

/**
 * Full page loading state
 */
export function PageLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Spinner size="xl" />
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  )
}

/**
 * Card/section loading skeleton
 */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}

/**
 * Policy card loading skeleton
 */
export function PolicyCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-5 bg-gray-200 rounded w-3/4" />
        </div>
        <div className="space-y-1">
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-5 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    </div>
  )
}

/**
 * Dashboard stats loading skeleton
 */
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-6 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Table loading skeleton
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded flex-1" />
          ))}
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-gray-100 p-4">
          <div className="flex gap-4">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div key={colIndex} className="h-4 bg-gray-200 rounded flex-1" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * AI processing loading state
 */
export function AIProcessingLoader({ stage = 'analyzing' }: { stage?: 'uploading' | 'analyzing' | 'extracting' }) {
  const stages = {
    uploading: { icon: FileText, message: 'Uploading document...', color: 'text-blue-600' },
    analyzing: { icon: Sparkles, message: 'AI is analyzing your document...', color: 'text-purple-600' },
    extracting: { icon: Shield, message: 'Extracting policy data...', color: 'text-green-600' },
  }

  const { icon: Icon, message, color } = stages[stage]

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
          <Icon className={`w-8 h-8 ${color}`} />
        </div>
        <div className="absolute -bottom-1 -right-1">
          <Spinner size="sm" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-gray-900">{message}</p>
        <p className="text-sm text-gray-500">This may take a few moments</p>
      </div>
      <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full animate-progress" />
      </div>
    </div>
  )
}

/**
 * Inline loading indicator
 */
export function InlineLoader({ text = 'Loading' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gray-600">
      <Spinner size="sm" />
      <span>{text}</span>
    </span>
  )
}

/**
 * Button loading state
 */
export function ButtonLoader() {
  return <Loader2 className="w-4 h-4 animate-spin" />
}

// Add progress animation to global styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes progress {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 100%; }
    }
    .animate-progress {
      animation: progress 2s ease-in-out infinite;
    }
  `
  if (!document.querySelector('style[data-loading-styles]')) {
    style.setAttribute('data-loading-styles', '')
    document.head.appendChild(style)
  }
}
