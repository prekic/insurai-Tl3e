import { NumberCounter } from '../animations/AnimatedComponents'

export function Stats() {
  const stats = [
    { value: 2300, suffix: '+', label: 'Policies Analyzed' },
    { value: 15, suffix: 'K+', label: 'Happy Users' },
    { value: 98, suffix: '%', label: 'Accuracy Rate' },
    { value: 24, suffix: '/7', label: 'AI Support' },
  ]

  return (
    <section className="py-16 bg-white border-y border-gray-100">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-gray-900">
                <NumberCounter value={stat.value} suffix={stat.suffix} decimals={0} />
              </div>
              <p className="text-gray-600 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
