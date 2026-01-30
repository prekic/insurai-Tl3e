import { Upload } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/supabase/auth-context'

/**
 * StickyMobileCTA - A floating CTA button that appears on mobile
 * after the user scrolls past a certain point.
 *
 * This keeps the primary conversion action always accessible on mobile devices.
 */
export function StickyMobileCTA() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(false)

  // Route to /try for anonymous users, /upload for logged-in users
  const uploadPath = user ? '/upload?autoOpen=true' : '/try'

  useEffect(() => {
    // Show the sticky CTA after scrolling 600px (approximately past the hero)
    const handleScroll = () => {
      const scrollY = window.scrollY
      const shouldShow = scrollY > 600
      setIsVisible(shouldShow)
    }

    // Initial check
    handleScroll()

    // Add scroll listener with passive for performance
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const handleClick = () => {
    navigate(uploadPath)
  }

  // Only render on mobile (md breakpoint hides it via CSS)
  // The button is hidden by default and shown when isVisible is true
  return (
    <div
      className={`
        fixed bottom-6 left-4 right-4 z-50
        md:hidden
        transition-all duration-300 ease-out
        ${isVisible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-20 opacity-0 pointer-events-none'
        }
      `}
    >
      <button
        onClick={handleClick}
        className="
          w-full flex items-center justify-center gap-2.5
          px-6 py-4
          bg-gradient-to-r from-blue-600 to-indigo-600
          text-white font-semibold text-base
          rounded-2xl
          shadow-2xl shadow-blue-500/30
          hover:shadow-blue-500/40
          active:scale-[0.98]
          transition-all duration-200
        "
        aria-label="Analyze your policy for free"
      >
        <Upload size={20} />
        <span>Analyze Your Policy Free</span>
      </button>

      {/* Trust indicator below button */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs text-gray-500">Free instant analysis</span>
      </div>
    </div>
  )
}
