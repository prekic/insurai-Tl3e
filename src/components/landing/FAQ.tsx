import { useState, useId } from 'react'
import { ChevronDown } from 'lucide-react'

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  const faqs = [
    {
      question: 'What file formats are supported?',
      answer: 'We support PDF, Word documents (DOC, DOCX), and image files (PNG, JPG, JPEG). Our AI can also process scanned documents through OCR.',
    },
    {
      question: 'How accurate is the AI analysis?',
      answer: 'Our AI achieves 98% accuracy on standard policy documents. We use multiple AI models to cross-verify extracted data and flag any uncertainties.',
    },
    {
      question: 'Is my data secure?',
      answer: 'Yes, we use bank-level encryption (AES-256) for all documents. Your files are processed securely and never shared with third parties.',
    },
    {
      question: 'Which insurance types are supported?',
      answer: 'We support all major Turkish insurance types including Kasko, Traffic (Trafik), Home (Konut), Health (Saglik), DASK, Life, and Commercial policies.',
    },
    {
      question: 'Can I compare policies from different insurers?',
      answer: 'Absolutely! You can upload policies from any Turkish insurance company and compare them side-by-side with our AI-powered analysis.',
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
    <section className="py-24 bg-white" aria-labelledby="faq-heading">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 id="faq-heading" className="text-4xl md:text-5xl mb-6 tracking-tight">
            Frequently asked <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">questions</span>
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to know about InsurAI.
          </p>
        </div>

        <div
          className="max-w-3xl mx-auto space-y-4"
          role="region"
          aria-label="Frequently asked questions"
        >
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i
            const buttonId = `${baseId}-button-${i}`
            const panelId = `${baseId}-panel-${i}`

            return (
              <div
                key={i}
                className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden"
              >
                <h3>
                  <button
                    id={buttonId}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    className="w-full flex items-center justify-between p-6 text-left focus-ring rounded-t-2xl"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                  >
                    <span className="font-semibold text-gray-900">{faq.question}</span>
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
                  className={isOpen ? 'px-6 pb-6 text-gray-600' : ''}
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
