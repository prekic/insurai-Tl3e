import { Star } from 'lucide-react'

export function Testimonials() {
  const testimonials = [
    {
      name: 'Ahmet Yilmaz',
      role: 'Insurance Broker',
      company: 'Yilmaz Sigorta',
      content: 'InsurAI has transformed how I analyze policies for my clients. What used to take hours now takes minutes.',
      rating: 5,
    },
    {
      name: 'Elif Demir',
      role: 'Risk Manager',
      company: 'Koc Holding',
      content: 'The AI-powered analysis catches details that I might have missed. Invaluable for our corporate policies.',
      rating: 5,
    },
    {
      name: 'Mehmet Ozturk',
      role: 'Individual User',
      company: '',
      content: 'Finally, I can understand my insurance policies without needing a law degree. Highly recommended!',
      rating: 5,
    },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl mb-6 tracking-tight">
            Trusted by <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">thousands</span>
          </h2>
          <p className="text-xl text-gray-600">
            See what our users have to say about InsurAI.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, i) => (
            <div key={i} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 border border-gray-100 shadow-lg">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, j) => (
                  <Star key={j} className="text-yellow-400 fill-yellow-400" size={20} />
                ))}
              </div>
              <p className="text-gray-700 mb-6 italic">&ldquo;{testimonial.content}&rdquo;</p>
              <div>
                <p className="font-semibold text-gray-900">{testimonial.name}</p>
                <p className="text-sm text-gray-500">{testimonial.role}{testimonial.company && `, ${testimonial.company}`}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
