import { Globe } from 'lucide-react'
import { useI18n } from '@/lib/i18n/i18n-context'

export function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm">
      <Globe size={16} className="text-gray-500" />
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setLocale('tr')}
          className={`min-w-[44px] min-h-[36px] px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            locale === 'tr'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          TR
        </button>
        <button
          onClick={() => setLocale('en')}
          className={`min-w-[44px] min-h-[36px] px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            locale === 'en'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  )
}
