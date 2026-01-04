import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export function PolicyComparisonSection() {
  const policies = [
    { name: 'Policy A', provider: 'Insurer ABC' },
    { name: 'Policy B', provider: 'Insurer XYZ' },
  ]

  const comparisonRows = [
    { label: 'Coverage Limit', values: ['₺500,000', '₺750,000'], trend: [null, 'up'] },
    { label: 'Annual Premium', values: ['₺4,800', '₺4,200'], trend: [null, 'down'] },
    { label: 'Deductible', values: ['₺2,500', '₺1,000'], trend: [null, 'down'] },
    { label: 'Flood Protection', values: ['Included', 'Excluded'], trend: ['up', 'down'] },
    { label: 'Earthquake Coverage', values: ['Included', 'Optional'], trend: ['up', 'neutral'] },
  ]

  const renderTrend = (trend: string | null) => {
    if (trend === 'up') return <TrendingUp className="text-green-500" size={16} />
    if (trend === 'down') return <TrendingDown className="text-red-500" size={16} />
    if (trend === 'neutral') return <Minus className="text-amber-500" size={16} />
    return null
  }

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl mb-6 tracking-tight">
            Compare policies <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">side-by-side</span>
          </h2>
          <p className="text-xl text-gray-600">
            See the differences between your policies at a glance.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          {/* Header */}
          <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
            <div className="p-4 font-semibold text-gray-700">Coverage</div>
            {policies.map((policy, i) => (
              <div key={i} className="p-4 text-center border-l border-gray-200">
                <p className="font-semibold text-gray-900">{policy.name}</p>
                <p className="text-xs text-gray-500">{policy.provider}</p>
              </div>
            ))}
          </div>

          {/* Rows */}
          {comparisonRows.map((row, i) => (
            <div key={i} className="grid grid-cols-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="p-4 text-gray-700">{row.label}</div>
              {row.values.map((value, j) => (
                <div key={j} className="p-4 text-center border-l border-gray-100 flex items-center justify-center gap-2">
                  <span className="font-medium text-gray-900">{value}</span>
                  {renderTrend(row.trend[j])}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
