import { ArrowRight, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/supabase/auth-context'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function CompareSection() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const uploadPath = user ? '/upload?autoOpen=true' : '/try'

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-blue-600 to-indigo-700">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-2xl sm:text-4xl md:text-5xl text-white mb-4 md:mb-6 tracking-tight">
          {t.landing.ctaTitle}
        </h2>
        <p className="text-base md:text-xl text-blue-100 mb-8 md:mb-10 max-w-2xl mx-auto">
          {t.landing.ctaDescription}
        </p>
        <Link
          to={uploadPath}
          className="inline-flex items-center gap-3 px-6 py-3.5 md:px-8 md:py-4 bg-white text-blue-600 rounded-xl hover:shadow-lg transition-all font-semibold text-base md:text-lg group"
        >
          <Upload size={20} />
          {t.landing.analyzeCtaButton}
          <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
        </Link>
        <p className="text-blue-200 mt-4 md:mt-6 text-sm">{t.landing.freeNoSignup}</p>
      </div>
    </section>
  )
}
