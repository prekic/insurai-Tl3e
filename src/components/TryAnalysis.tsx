import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Upload,
  FileText,
  Sparkles,
  Clock,
  XCircle,
  Shield,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
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
import {
  trackTrialPageView,
  trackTrialUploadStarted,
  trackTrialAnalysisStarted,
  trackTrialAnalysisCompleted,
  trackTrialAnalysisFailed,
  trackTrialSignupClicked,
} from '@/lib/analytics'

type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' | 'trial-used'

interface LocationState {
  file?: File
}

export function TryAnalysis() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const { health } = useBackendHealth()
  const processedFromStateRef = useRef(false)

  const [state, setState] = useState<AnalysisState>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Track page view on mount
  useEffect(() => {
    trackTrialPageView()
  }, [])

  // Check for existing trial result on mount - redirect to PolicyDetailView
  useEffect(() => {
    const existingResult = getTrialResult()
    if (existingResult) {
      // Redirect to PolicyDetailView with the saved result
      navigate('/policy/trial', {
        state: {
          policy: existingResult.policy,
          isTrialResult: true,
        },
        replace: true,
      })
    } else if (hasUsedFreeTrial()) {
      setState('trial-used')
    }
  }, [navigate])

  // Preload PDF.js worker
  useEffect(() => {
    preloadPdfJs()
  }, [])

  // If user is logged in, redirect to full upload (with any file that was passed)
  useEffect(() => {
    if (user) {
      // Get file from location state if present
      const locationState = location.state as LocationState | null
      const fileFromState = locationState?.file

      if (fileFromState) {
        // Pass file along to upload page
        navigate('/upload', {
          replace: true,
          state: { files: [fileFromState], autoProcess: true }
        })
      } else {
        navigate('/upload', { replace: true })
      }
    }
  }, [user, navigate, location.state])

  const backendReady = health.status === 'healthy'

  // Core extraction logic shared by both entry points (file from state, file from user selection)
  const runExtraction = useCallback(async (file: File) => {
    // Track upload started
    trackTrialUploadStarted(file.type, file.size)

    // Start analysis
    setSelectedFile(file)
    setState('uploading')
    setProgress(10)
    setProgressMessage('Preparing document...')
    setError(null)

    let progressInterval: ReturnType<typeof setInterval> | null = null

    try {
      setProgress(20)
      setProgressMessage('Uploading document...')
      await new Promise((r) => setTimeout(r, 400))

      setState('analyzing')
      setProgress(40)
      setProgressMessage('Extracting text from PDF...')

      trackTrialAnalysisStarted()

      // Add timeout to prevent stuck state (120 seconds to accommodate Document AI OCR + AI provider fallback)
      const EXTRACTION_TIMEOUT_MS = 120000
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Analysis timed out. The document may be too large or complex. Please try a smaller document.'))
        }, EXTRACTION_TIMEOUT_MS)
      })

      // Update progress during extraction
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 85) return prev + 5
          return prev
        })
        setProgressMessage((prev) => {
          const messages = [
            'Extracting text from PDF...',
            'Analyzing document structure...',
            'Processing with AI...',
            'Almost there...',
          ]
          const currentIndex = messages.indexOf(prev)
          if (currentIndex < messages.length - 1) {
            return messages[currentIndex + 1]
          }
          return prev
        })
      }, 10000) // Update every 10 seconds

      // Run extraction with timeout - useFallback: false to surface real errors instead of mock data
      const extractionResult = await Promise.race([
        extractPolicyFromDocument(file, { useFallback: false }),
        timeoutPromise,
      ])

      if (progressInterval) clearInterval(progressInterval)

      // Handle null/undefined result
      if (!extractionResult) {
        throw new Error('Failed to analyze policy - no response received')
      }

      if (!extractionResult.success) {
        throw new Error(extractionResult.error?.message || 'Failed to analyze policy')
      }

      // Reject fallback/sample data - user expects real AI results
      if ('source' in extractionResult && extractionResult.source === 'fallback') {
        console.warn('[TryAnalysis] Extraction returned fallback sample data instead of real AI results')
        throw new Error('AI extraction could not process this document. Please try again or use a different document.')
      }

      // Validate policy exists
      if (!extractionResult.policy) {
        throw new Error('Analysis completed but no policy data was extracted')
      }

      setProgress(95)
      setProgressMessage('Finalizing analysis...')

      const policy = extractionResult.policy
      const fileName = sanitizeFileName(file.name)

      // Ensure policy has required fields for display
      const policyWithDefaults = {
        ...policy,
        id: policy.id || 'trial-' + Date.now(),
        fileName,
      }

      saveTrialResult(policyWithDefaults, fileName)

      setProgress(100)
      setProgressMessage('Analysis complete!')

      trackTrialAnalysisCompleted(
        policy.type,
        policy.aiConfidence,
        policy.coverages?.length || 0
      )

      toast.success('Analysis complete!', {
        description: 'Your policy has been analyzed successfully.',
      })

      // Navigate to PolicyDetailView with the result
      navigate('/policy/trial', {
        state: {
          policy: policyWithDefaults,
          isTrialResult: true,
        },
        replace: true,
      })
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval)
      console.warn('[TryAnalysis] Extraction error:', err instanceof Error ? err.message : err)
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setError(message)
      setState('error')
      trackTrialAnalysisFailed(message)
      toast.error('Analysis failed', { description: message })
    }
  }, [navigate])

  // Validate file and check eligibility before running extraction
  const processFile = useCallback((file: File) => {
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

    runExtraction(file)
  }, [backendReady, runExtraction])

  // Process file passed from landing page UploadWidget via router state
  useEffect(() => {
    const locationState = location.state as LocationState | null
    const fileFromState = locationState?.file

    // Only process once, when we have a file and backend is ready
    if (
      fileFromState &&
      !processedFromStateRef.current &&
      backendReady &&
      state === 'idle'
    ) {
      processedFromStateRef.current = true
      // Clear location state to prevent reprocessing on refresh
      navigate(location.pathname, { replace: true, state: {} })
      // Start processing the file
      processFile(fileFromState)
    }
  }, [location, backendReady, state, navigate, processFile])

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

  const handleSignUp = (source: 'header' | 'banner' | 'trial_used' = 'banner') => {
    trackTrialSignupClicked(source)
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
              You&apos;ve already analyzed a policy with your free trial.
              {timeRemaining > 0 && (
                <span className="block mt-2 text-sm text-gray-500">
                  Try again in {formatTimeRemaining(timeRemaining)}
                </span>
              )}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => handleSignUp('trial_used')}
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

  // Idle / Uploading / Analyzing / Error states
  // Note: 'complete' state now navigates to PolicyDetailView
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
