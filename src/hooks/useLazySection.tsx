import { useState, useEffect, useRef, ReactNode } from 'react'

interface UseLazySectionOptions {
  /** Root margin for intersection observer (default: '100px') */
  rootMargin?: string
  /** Threshold for intersection (default: 0) */
  threshold?: number
}

/**
 * Hook for lazy loading components when they enter the viewport.
 * Improves FCP/LCP by deferring below-the-fold content loading.
 */
export function useLazySection(options: UseLazySectionOptions = {}) {
  const { rootMargin = '100px', threshold = 0 } = options
  const [isInView, setIsInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // If IntersectionObserver is not available, show immediately
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          // Once visible, stop observing
          observer.disconnect()
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [rootMargin, threshold])

  return { ref, isInView }
}

/**
 * A placeholder component shown while lazy content loads
 * Uses Tailwind's animate-pulse for a simple loading state
 */
export function LazySectionPlaceholder({ height = '400px' }: { height?: string }) {
  return (
    <div
      className="bg-gray-100 animate-pulse"
      style={{ minHeight: height }}
    />
  )
}

interface LazySectionProps {
  children: ReactNode
  height?: string
  rootMargin?: string
}

/**
 * Wrapper component for lazy-loading sections
 */
export function LazySection({ children, height = '400px', rootMargin = '200px' }: LazySectionProps) {
  const { ref, isInView } = useLazySection({ rootMargin })

  return (
    <div ref={ref} style={{ minHeight: isInView ? undefined : height }}>
      {isInView ? children : <LazySectionPlaceholder height={height} />}
    </div>
  )
}
