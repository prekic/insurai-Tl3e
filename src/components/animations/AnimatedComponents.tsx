// Animated components — CSS-only, no framer-motion dependency.
// All animations are opacity-based to avoid CLS (Cumulative Layout Shift).
// This keeps framer-motion out of the main entry chunk; AuthPage imports it
// directly and is already lazy-loaded.

import { ReactNode, useRef, useEffect, useState } from 'react'

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <div
      className="w-full max-w-[100vw] overflow-x-hidden"
      style={{ animation: 'fadeIn 0.3s ease both' }}
    >
      {children}
    </div>
  )
}

interface StaggeredListProps {
  children: ReactNode[]
  staggerDelay?: number
}

export function StaggeredList({ children, staggerDelay = 0.1 }: StaggeredListProps) {
  return (
    <div className="space-y-6">
      {children.map((child, index) => (
        <div
          key={index}
          style={{ animation: `fadeIn 0.4s ease ${index * staggerDelay}s both` }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

interface AnimatedButtonProps {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function AnimatedButton({ children, onClick, className }: AnimatedButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`${className ?? ''} transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]`}
    >
      {children}
    </button>
  )
}

interface ScaleOnHoverProps {
  children: ReactNode
}

export function ScaleOnHover({ children }: ScaleOnHoverProps) {
  return (
    <div className="transition-transform duration-200 hover:scale-105">
      {children}
    </div>
  )
}

interface NumberCounterProps {
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}

export function NumberCounter({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  className = '',
}: NumberCounterProps) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 1500
    const steps = 60
    const increment = value / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current = Math.min(step * increment, value)
      setDisplayValue(current)

      if (step >= steps) {
        clearInterval(timer)
        setDisplayValue(value)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return (
    <span className={className}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  )
}

interface FadeInWhenVisibleProps {
  children: ReactNode
}

export function FadeInWhenVisible({ children }: FadeInWhenVisibleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '-100px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={isVisible ? { animation: 'fadeIn 0.5s ease both' } : { opacity: 0 }}
    >
      {children}
    </div>
  )
}

// No-op AnimatePresence — exit animations removed for performance.
// Enter animations are handled by CSS (fadeIn keyframe in index.css).
export function AnimatePresence({ children }: { children: ReactNode }) {
  return <>{children}</>
}
