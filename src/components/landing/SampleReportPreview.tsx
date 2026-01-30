import { TrendingUp, Shield, AlertTriangle, CheckCircle, Star } from 'lucide-react'

/**
 * SampleReportPreview - Shows a mini preview of what a benchmark analysis report looks like.
 * Used on the landing page to give users a visual idea of the value they'll receive.
 */
export function SampleReportPreview() {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-white" size={18} />
            <span className="text-white font-semibold text-sm">Benchmark Report</span>
          </div>
          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
            <Star size={12} className="text-yellow-300 fill-yellow-300" />
            <span className="text-white text-xs font-medium">Sample</span>
          </div>
        </div>
      </div>

      {/* Score Section */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">B+</span>
          </div>
          <div>
            <div className="text-sm text-gray-500">Overall Score</div>
            <div className="text-2xl font-bold text-gray-900">78/100</div>
            <div className="text-xs text-emerald-600 font-medium">Above market average</div>
          </div>
        </div>
      </div>

      {/* Mini Analysis */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 p-2 bg-emerald-50 rounded-lg">
          <CheckCircle size={16} className="text-emerald-600" />
          <div className="flex-1">
            <div className="text-xs font-medium text-emerald-800">Strong Coverage</div>
            <div className="text-xs text-emerald-600">Collision, theft, fire included</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2 bg-amber-50 rounded-lg">
          <AlertTriangle size={16} className="text-amber-600" />
          <div className="flex-1">
            <div className="text-xs font-medium text-amber-800">Gap Detected</div>
            <div className="text-xs text-amber-600">Missing: Natural disaster coverage</div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg">
          <Shield size={16} className="text-blue-600" />
          <div className="flex-1">
            <div className="text-xs font-medium text-blue-800">AI Recommendation</div>
            <div className="text-xs text-blue-600">Add flood coverage for +12% protection</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-center text-gray-500">
          Full analysis includes 15+ metrics and comparisons
        </p>
      </div>
    </div>
  )
}

/**
 * Compact version for mobile or smaller spaces
 */
export function SampleReportPreviewCompact() {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4">
      <div className="flex items-center gap-4">
        {/* Score Badge */}
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
          <span className="text-white text-xl font-bold">B+</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-900">Sample Report</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Score: 78/100 - Above average</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">3 strengths</span>
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">1 gap</span>
          </div>
        </div>
      </div>
    </div>
  )
}
