import { Quote } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function Testimonials() {
  const { t } = useTranslation()

  const testimonials = [
    {
      author: t.landing.testimonial1Author,
      quote: t.landing.testimonial1Quote,
    },
    {
      author: t.landing.testimonial2Author,
      quote: t.landing.testimonial2Quote,
    },
    {
      author: t.landing.testimonial3Author,
      quote: t.landing.testimonial3Quote,
    },
  ]

  return (
    <section className="py-16 md:py-24 bg-white" aria-labelledby="testimonials-title">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-10 md:mb-16">
          <h2 id="testimonials-title" className="text-3xl md:text-5xl mb-4 md:mb-6 tracking-tight">
            {t.landing.testimonialsTitle}{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {t.landing.testimonialsHighlight}
            </span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600">{t.landing.testimonialsSubtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, i) => (
            <div
              key={i}
              className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-lg relative flex flex-col h-full"
            >
              <div
                className="absolute -top-5 -left-2 text-indigo-100 opacity-50"
                aria-hidden="true"
              >
                <Quote size={80} className="fill-current" />
              </div>
              <div className="relative z-10 flex-grow">
                <p className="text-gray-700 text-base md:text-lg italic leading-relaxed mb-6">
                  {testimonial.quote}
                </p>
              </div>
              <div className="relative z-10 mt-auto border-t border-gray-100 pt-4">
                <p className="font-semibold text-gray-900">{testimonial.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
