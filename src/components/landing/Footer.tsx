import { Shield, Mail, Phone, MapPin } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Shield className="text-white" size={20} />
              </div>
              <span className="font-bold text-xl">InsurAI</span>
            </div>
            <p className="text-slate-400 text-sm">
              {t.landing.footerDescription}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-4">{t.landing.footerProduct}</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerFeatures}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerPricing}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerApi}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerIntegrations}</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold mb-4">{t.landing.footerCompany}</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerAbout}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerBlog}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerCareers}</a></li>
              <li><a href="#" className="hover:text-white transition-colors">{t.landing.footerContact}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">{t.landing.footerContact}</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex items-center gap-2">
                <Mail size={16} />
                <span>info@insurai.com</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={16} />
                <span>+90 212 555 0123</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin size={16} />
                <span>{t.landing.footerLocation}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {t.landing.footerCopyright}
          </p>
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition-colors">{t.landing.footerPrivacy}</a>
            <a href="#" className="hover:text-white transition-colors">{t.landing.footerTerms}</a>
            <a href="#" className="hover:text-white transition-colors">{t.landing.footerCookies}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
