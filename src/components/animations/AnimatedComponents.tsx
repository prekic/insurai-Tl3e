import { motion, AnimatePresence } from 'framer-motion'
import { ReactNode, useEffect, useState } from 'react'

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

interface StaggeredListProps {
  children: ReactNode[]
  staggerDelay?: number
}

export function StaggeredList({ children, staggerDelay = 0.1 }: StaggeredListProps) {
  return (
    <motion.div className="space-y-6">
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * staggerDelay, duration: 0.4 }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

interface AnimatedButtonProps {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function AnimatedButton({ children, onClick, className }: AnimatedButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={className}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {children}
    </motion.button>
  )
}

interface ScaleOnHoverProps {
  children: ReactNode
}

export function ScaleOnHover({ children }: ScaleOnHoverProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {children}
    </motion.div>
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
  className = ''
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence }
