import { FileText, Languages, ShieldCheck, Clock } from 'lucide-react'

export function Stats() {
  const capabilities = [
    { icon: FileText, label: 'Policy Types Supported', value: '7', detail: 'Kasko, Trafik, DASK, Health, Life, Home, Business' },
    { icon: Languages, label: 'Languages', value: 'TR / EN', detail: 'Full Turkish and English support' },
    { icon: ShieldCheck, label: 'Coverage Checks', value: '15+', detail: 'Gaps, limits, exclusions, compliance' },
    { icon: Clock, label: 'Analysis Time', value: '<60s', detail: 'From upload to full benchmark report' },
  ]

  return (
    <section className="py-12 bg-white border-y border-gray-100">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {capabilities.map((cap, i) => (
            <div key={i} className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-50 rounded-xl mb-2">
                <cap.icon size={20} className="text-blue-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-gray-900">{cap.value}</div>
              <p className="text-sm font-medium text-gray-700 mt-1">{cap.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">{cap.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
