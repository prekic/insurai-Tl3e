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
  'Türkiye',
  'Unico',
]

export function TrustedProviders() {
  return (
    <div className="py-8 bg-gray-50 border-y border-gray-200">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Building2 size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-500">
            Supports <span className="text-gray-700 font-semibold">50+</span> Turkish Insurers
          </span>
        </div>

        {/* Provider badges - horizontal scrolling on mobile */}
        <div className="relative overflow-hidden">
          {/* Gradient fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 to-transparent z-10 pointer-events-none" />

          {/* Scrolling container */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide px-4 -mx-4">
            {FEATURED_PROVIDERS.map((provider) => (
              <div
                key={provider}
                className="flex-shrink-0 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
              >
                {provider}
              </div>
            ))}
            {/* "and more" badge */}
            <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-full text-sm font-medium text-blue-700">
              +38 more
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
        +44 more
      </span>
    </div>
  )
}
