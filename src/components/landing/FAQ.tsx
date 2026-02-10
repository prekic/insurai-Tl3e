import { useState, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function FAQ() {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  const faqs = [
    {
      question: t.landing.faqQ1,
      answer: t.landing.faqA1,
    },
    {
      question: t.landing.faqQ2,
      answer: t.landing.faqA2,
    },
    {
      question: t.landing.faqQ3,
      answer: t.landing.faqA3,
    },
    {
      question: t.landing.faqQ4,
      answer: t.landing.faqA4,
    },
    {
      question: t.landing.faqQ5,
      answer: t.landing.faqA5,
    },
  ]

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (index < faqs.length - 1) {
          const nextButton = document.getElementById(`${baseId}-button-${index + 1}`)
          nextButton?.focus()
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (index > 0) {
          const prevButton = document.getElementById(`${baseId}-button-${index - 1}`)
          prevButton?.focus()
        }
        break
      case 'Home':
        e.preventDefault()
        document.getElementById(`${baseId}-button-0`)?.focus()
        break
      case 'End':
        e.preventDefault()
        document.getElementById(`${baseId}-button-${faqs.length - 1}`)?.focus()
        break
    }
  }

  return (
    <section className="py-14 md:py-24 bg-white" aria-labelledby="faq-heading">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
          <h2 id="faq-heading" className="text-2xl sm:text-4xl md:text-5xl mb-3 md:mb-6 tracking-tight">
            {t.landing.faq}
          </h2>
          <p className="text-base md:text-xl text-gray-600">
            {t.landing.faqSubtitle}
          </p>
        </div>

        <div
          className="max-w-3xl mx-auto space-y-3 md:space-y-4"
          role="region"
          aria-label={t.landing.faq}
        >
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i
            const buttonId = `${baseId}-button-${i}`
            const panelId = `${baseId}-panel-${i}`

            return (
              <div
                key={i}
                className="bg-gray-50 rounded-xl md:rounded-2xl border border-gray-100 overflow-hidden"
              >
                <h3>
                  <button
                    id={buttonId}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    className="w-full flex items-center justify-between p-4 md:p-6 text-left focus-ring rounded-t-xl md:rounded-t-2xl"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                  >
                    <span className="font-semibold text-gray-900 text-sm md:text-base">{faq.question}</span>
                    <ChevronDown
                      className={`text-gray-500 transition-transform flex-shrink-0 ml-4 ${isOpen ? 'rotate-180' : ''}`}
                      size={20}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className={isOpen ? 'px-4 pb-4 md:px-6 md:pb-6 text-sm md:text-base text-gray-600' : ''}
                >
                  {isOpen && faq.answer}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
