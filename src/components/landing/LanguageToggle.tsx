import { Globe } from 'lucide-react'
import { useState } from 'react'

export function LanguageToggle() {
  const [language, setLanguage] = useState<'local' | 'en'>('local')

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm">
      <Globe size={16} className="text-gray-500" />
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setLanguage('local')}
          className={`min-w-[44px] min-h-[36px] px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            language === 'local'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          TR
        </button>
        <button
          onClick={() => setLanguage('en')}
          className={`min-w-[44px] min-h-[36px] px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            language === 'en'
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
