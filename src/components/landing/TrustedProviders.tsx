import { Building2 } from 'lucide-react'

/**
 * TrustedProviders - Shows supported Turkish insurance providers
 * Creates credibility by showing users that the platform works with providers they know.
 */

const FEATURED_PROVIDERS = [
  'Allianz',
  'AXA',
  'Anadolu',
  'Aksigorta',
  'Mapfre',
  'Sompo',
  'Zurich',
  'HDI',
  'Groupama',
  'Ergo',
]

export function TrustedProviders() {
  return (
    <div className="py-6 md:py-8 bg-slate-50 border-y border-gray-200">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-4 md:mb-6">
          <Building2 size={18} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-600">
            Works with major Turkish insurers
          </span>
        </div>

        {/* Provider badges - horizontal scrolling on mobile, wrap on desktop */}
        <div className="relative overflow-hidden">
          {/* Gradient fade edges for mobile scroll */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-50 to-transparent z-10 pointer-events-none md:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-50 to-transparent z-10 pointer-events-none md:hidden" />

          {/* Scrolling on mobile, flex-wrap on desktop */}
          <div className="flex gap-2.5 md:gap-3 overflow-x-auto md:overflow-visible md:flex-wrap md:justify-center pb-1 scrollbar-hide px-2 -mx-2 md:mx-0 md:px-0">
            {FEATURED_PROVIDERS.map((provider) => (
              <div
                key={provider}
                className="flex-shrink-0 px-3.5 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 rounded-full text-sm font-semibold text-gray-800 shadow-sm hover:shadow-md hover:border-gray-400 transition-all whitespace-nowrap"
              >
                {provider}
              </div>
            ))}
            {/* "and more" badge */}
            <div className="flex-shrink-0 px-3.5 py-1.5 md:px-4 md:py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 rounded-full text-sm font-semibold text-blue-700 whitespace-nowrap">
              +more
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact inline version for use in Hero section
 */
export function TrustedProvidersInline() {
  const topProviders = FEATURED_PROVIDERS.slice(0, 6)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">Works with:</span>
      {topProviders.map((provider) => (
        <span
          key={provider}
          className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-600"
        >
          {provider}
        </span>
      ))}
      <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-600">
        +4 more
      </span>
    </div>
  )
}
