import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileText,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { AnalyzedPolicy } from '@/types/policy'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { sanitizeFileName } from '@/lib/sanitize'
import { extractPolicyFromDocument, isAIConfigured, preloadPdfJs } from '@/lib/ai'
import { useBackendHealth } from '@/hooks/useBackendHealth'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  hasUsedFreeTrial,
  canPerformFreeTrial,
  saveTrialResult,
  getTrialResult,
  getTrialTimeRemaining,
  formatTimeRemaining,
} from '@/lib/free-trial'

type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' | 'trial-used'

interface AnalysisResult {
  policy: AnalyzedPolicy
  fileName: string
  confidence?: number
}

export function TryAnalysis() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const { health } = useBackendHealth()

  const [state, setState] = useState<AnalysisState>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Check for existing trial result on mount
  useEffect(() => {
    const existingResult = getTrialResult()
    if (existingResult) {
      setResult({
        policy: existingResult.policy,
        fileName: existingResult.fileName,
      })
      setState('complete')
    } else if (hasUsedFreeTrial()) {
      setState('trial-used')
    }
  }, [])

  // Preload PDF.js worker
  useEffect(() => {
    preloadPdfJs()
  }, [])

  // If user is logged in, redirect to full upload
  useEffect(() => {
    if (user) {
      navigate('/upload', { replace: true })
    }
  }, [user, navigate])

  const backendReady = health.status === 'healthy'

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      processFile(files[0])
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFile(files[0])
    }
  }

  const processFile = async (file: File) => {
    // Check trial eligibility
    const trialCheck = canPerformFreeTrial()
    if (!trialCheck.canTry) {
      toast.error('Free trial already used', {
        description: trialCheck.reason,
      })
      setState('trial-used')
      return
    }

    // Validate file
    const { valid, errors } = validateFiles([file])
    if (errors.length > 0 || valid.length === 0) {
      const errorInfo = getErrorMessage(errors[0]?.code || 'INVALID_FILE_TYPE')
      toast.error(errorInfo.title, { description: errorInfo.description })
      return
    }

    // Check backend availability
    if (!backendReady || !isAIConfigured()) {
      toast.error('Analysis service unavailable', {
        description: 'Please try again in a moment.',
      })
      return
    }

    // Start analysis
    setSelectedFile(file)
    setState('uploading')
    setProgress(10)
    setProgressMessage('Preparing document...')
    setError(null)

    try {
      // Simulate upload progress
      setProgress(20)
      setProgressMessage('Uploading document...')
      await new Promise((r) => setTimeout(r, 500))

      setState('analyzing')
      setProgress(40)
      setProgressMessage('Extracting text from PDF...')

      // Run extraction
      const extractionResult = await extractPolicyFromDocument(file)

      if (!extractionResult.success) {
        throw new Error(extractionResult.error?.message || 'Failed to analyze policy')
      }

      setProgress(95)
      setProgressMessage('Finalizing analysis...')

      const policy = extractionResult.policy!
      const fileName = sanitizeFileName(file.name)

      // Save to localStorage
      saveTrialResult(policy, fileName)

      setResult({
        policy,
        fileName,
        confidence: policy.aiConfidence,
      })

      setProgress(100)
      setProgressMessage('Analysis complete!')
      setState('complete')

      toast.success('Analysis complete!', {
        description: 'Your policy has been analyzed successfully.',
      })
    } catch (err) {
      console.error('[TryAnalysis] Error:', err)
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setError(message)
      setState('error')
      toast.error('Analysis failed', { description: message })
    }
  }

  const handleSignUp = () => {
    // Navigate to auth with return URL
    navigate('/auth?returnTo=/dashboard&fromTrial=true')
  }

  const handleTryAgain = () => {
    setState('idle')
    setError(null)
    setSelectedFile(null)
    setProgress(0)
  }

  // Render based on state
  if (state === 'trial-used') {
    const timeRemaining = getTrialTimeRemaining()
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Clock className="text-amber-600" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Free Trial Already Used
            </h1>
            <p className="text-gray-600 mb-6">
              You've already analyzed a policy with your free trial.
              {timeRemaining > 0 && (
                <span className="block mt-2 text-sm text-gray-500">
                  Try again in {formatTimeRemaining(timeRemaining)}
                </span>
              )}
            </p>

            <div className="space-y-3">
              <Button
                onClick={handleSignUp}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg"
              >
                <Sparkles size={18} className="mr-2" />
                Sign Up for Unlimited Access
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'complete' && result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Success Header */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="text-emerald-600" size={28} />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900">
                  Analysis Complete!
                </h1>
                <p className="text-gray-600 text-sm mt-1">
                  {result.fileName} • Confidence: {Math.round((result.confidence || 0.85) * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Policy Summary Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
              <h2 className="text-white font-semibold text-lg">Policy Summary</h2>
              <p className="text-slate-300 text-sm">
                {result.policy.typeTr || result.policy.type} • {result.policy.provider}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Key Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Policy Number</div>
                  <div className="font-semibold text-gray-900">{result.policy.policyNumber}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Insured</div>
                  <div className="font-semibold text-gray-900">{result.policy.insuredPerson || 'N/A'}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Premium</div>
                  <div className="font-semibold text-gray-900">
                    ₺{result.policy.premium?.toLocaleString('tr-TR') || 'N/A'}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Coverage</div>
                  <div className="font-semibold text-gray-900">
                    ₺{result.policy.coverage?.toLocaleString('tr-TR') || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Coverage Preview */}
              {result.policy.coverages && result.policy.coverages.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Coverages ({result.policy.coverages.length})</h3>
                  <div className="space-y-2">
                    {result.policy.coverages.slice(0, 3).map((cov, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                        <span className="text-sm text-emerald-800">{cov.nameTr || cov.name}</span>
                        <span className="text-sm font-medium text-emerald-700">
                          {cov.included ? '✓ Included' : `₺${cov.limit?.toLocaleString('tr-TR')}`}
                        </span>
                      </div>
                    ))}
                    {result.policy.coverages.length > 3 && (
                      <p className="text-sm text-gray-500 text-center pt-2">
                        +{result.policy.coverages.length - 3} more coverages
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* AI Insights Preview */}
              {result.policy.aiInsights && result.policy.aiInsights.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                  <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Sparkles size={16} />
                    AI Insight
                  </h3>
                  <p className="text-sm text-blue-800">{result.policy.aiInsights[0]}</p>
                </div>
              )}
            </div>

            {/* Blurred Preview / Signup CTA */}
            <div className="relative">
              {/* Blurred content hint */}
              <div className="p-6 bg-gradient-to-b from-transparent to-gray-100 blur-sm opacity-50">
                <div className="h-20 bg-gray-200 rounded-lg mb-3"></div>
                <div className="h-16 bg-gray-200 rounded-lg"></div>
              </div>

              {/* Overlay CTA */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/80 to-white">
                <div className="text-center p-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="text-blue-600" size={24} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">
                    Sign up to unlock full analysis
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 max-w-sm">
                    Get detailed gap analysis, market comparisons, AI recommendations, and save to your dashboard.
                  </p>
                  <Button
                    onClick={handleSignUp}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg"
                  >
                    <Sparkles size={18} className="mr-2" />
                    Sign Up Free
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <Shield size={14} className="text-emerald-600" />
              <span>KVKK Compliant</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock size={14} className="text-blue-600" />
              <span>Your data is secure</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Idle / Uploading / Analyzing / Error states
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full mb-4">
            <Sparkles size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">Free Analysis - No Sign Up Required</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Try Policy Analysis
          </h1>
          <p className="text-gray-600">
            Upload your insurance policy and see instant AI-powered analysis.
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {state === 'error' ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <XCircle className="text-red-600" size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Analysis Failed</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <Button onClick={handleTryAgain} variant="outline">
                Try Again
              </Button>
            </div>
          ) : state === 'uploading' || state === 'analyzing' ? (
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {selectedFile?.name}
                  </p>
                  <p className="text-sm text-gray-500">{progressMessage}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 text-center">{Math.round(progress)}% complete</p>

              {/* Analyzing animation */}
              {state === 'analyzing' && (
                <div className="mt-6 flex justify-center">
                  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 rounded-full">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="text-sm text-indigo-700 ml-2">AI analyzing your policy...</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`p-8 transition-colors ${
                isDragging ? 'bg-blue-50' : 'bg-white'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <label className="cursor-pointer flex flex-col items-center">
                <div
                  className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                    isDragging
                      ? 'bg-blue-100 border-2 border-blue-400'
                      : 'bg-gray-100'
                  }`}
                >
                  <Upload
                    size={36}
                    className={isDragging ? 'text-blue-600' : 'text-gray-400'}
                  />
                </div>
                <p className="font-semibold text-gray-900 mb-1">
                  {isDragging ? 'Drop your file here' : 'Upload your policy'}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Drag & drop or click to browse
                </p>
                <p className="text-xs text-gray-400">
                  {FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')} up to {FILE_CONSTRAINTS.MAX_SIZE_MB}MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Footer info */}
          {state === 'idle' && (
            <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Shield size={14} className="text-emerald-500" />
                    <span>Secure</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Sparkles size={14} className="text-blue-500" />
                    <span>AI-Powered</span>
                  </div>
                </div>
                <span className="text-gray-400">1 free analysis</span>
              </div>
            </div>
          )}
        </div>

        {/* Backend status warning */}
        {!backendReady && state === 'idle' && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Service temporarily unavailable</p>
                <p className="text-sm text-amber-700 mt-1">
                  The analysis service is starting up. Please try again in a moment.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Already have account? */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/auth')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
