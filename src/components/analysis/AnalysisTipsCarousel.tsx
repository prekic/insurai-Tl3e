import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n'

/**
 * Rotating tips/facts displayed during the long analysis wait.
 * Tips are educational and honest — they reinforce platform credibility
 * rather than acting as filler.
 *
 * Tips rotate every 5 seconds. Single-line, fixed height (no CLS).
 */
export function AnalysisTipsCarousel() {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)

  // Stable list of tips. Add new ones to translations and append here.
  const tips = [
    t.tryAnalysis.tips.tip1,
    t.tryAnalysis.tips.tip2,
    t.tryAnalysis.tips.tip3,
    t.tryAnalysis.tips.tip4,
    t.tryAnalysis.tips.tip5,
  ]

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % tips.length)
    }, 5000)
    return () => clearInterval(id)
  }, [tips.length])

  return (
    <div className="mt-6 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg min-h-[3rem] flex items-center">
      {/* Key change forces remount → fresh fadeIn animation per tip */}
      <p
        key={index}
        className="text-xs sm:text-sm text-gray-700 leading-relaxed"
        style={{ animation: 'fadeIn 0.5s ease both' }}
      >
        {tips[index]}
      </p>
    </div>
  )
}
