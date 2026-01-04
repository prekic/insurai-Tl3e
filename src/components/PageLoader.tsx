import { useI18n } from '@/lib/i18n'

export function PageLoader() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-gray-200 rounded-full" />
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin" />
        </div>

        {/* Loading text */}
        <p className="text-gray-600 font-medium">{t.common?.loading ?? 'Loading...'}</p>
      </div>
    </div>
  )
}
