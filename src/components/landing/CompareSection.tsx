import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function CompareSection() {
  return (
    <section className="py-24 bg-gradient-to-br from-blue-600 to-indigo-700">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-4xl md:text-5xl text-white mb-6 tracking-tight">
          Ready to understand your policies?
        </h2>
        <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
          Upload your first policy and see the power of AI-driven insurance analysis.
        </p>
        <Link
          to="/upload?autoOpen=true"
          className="inline-flex items-center gap-3 px-8 py-4 bg-white text-blue-600 rounded-xl hover:shadow-lg transition-all font-semibold text-lg group"
        >
          Get Started Free
          <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
        </Link>
        <p className="text-blue-200 mt-6 text-sm">No credit card required</p>
      </div>
    </section>
  )
}
