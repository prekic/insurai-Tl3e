import { Upload, Sparkles, Award } from 'lucide-react'

export function HowItWorks() {
  const steps = [
    {
      icon: Upload,
      title: 'Upload policies',
      description: 'Drop your insurance documents—PDF, Word, or scanned images. We accept any format.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Sparkles,
      title: 'AI analyzes coverage',
      description: 'Our AI extracts limits, deductibles, extensions, and exclusions and explains them in everyday language.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Award,
      title: 'Compare & track',
      description: 'Compare policies side-by-side and set reminders for renewals and key dates.',
      color: 'from-green-500 to-emerald-500',
    },
  ]

  return (
    <section id="how-it-works" className="py-24 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full mb-6">
            <Sparkles className="text-blue-600" size={16} />
            <span className="text-sm font-medium text-blue-900">Simple Process</span>
          </div>
          <h2 className="text-4xl md:text-5xl mb-6 tracking-tight">
            Three steps to <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">benchmark your policies</span>
          </h2>
          <p className="text-xl text-gray-600">
            No jargon, no manuals—just clear coverage in your own language.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={index} className="relative group">
                <div className="relative bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 group-hover:-translate-y-2">
                  <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-gray-900 to-gray-700 text-white rounded-2xl flex items-center justify-center font-bold shadow-xl text-lg">
                    {index + 1}
                  </div>
                  <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${step.color} rounded-2xl mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform`}>
                    <Icon className="text-white" size={28} />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3 text-gray-900">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/3 -right-4 w-8 h-0.5 bg-gradient-to-r from-gray-300 to-transparent" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
