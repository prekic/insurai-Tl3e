import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  Share2,
  Check,
  Mail,
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
  saveTrialEmail,
  getTrialEmail,
  getShareUrl,
} from '@/lib/free-trial'
import {
  trackTrialPageView,
  trackTrialUploadStarted,
  trackTrialAnalysisStarted,
  trackTrialAnalysisCompleted,
  trackTrialAnalysisFailed,
  trackTrialEmailCaptured,
  trackTrialShareCopied,
  trackTrialSignupClicked,
} from '@/lib/analytics'

type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' | 'trial-used'

interface AnalysisResult {
  policy: AnalyzedPolicy
  fileName: string
  confidence?: number
}

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
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Track page view on mount
  useEffect(() => {
    trackTrialPageView()
  }, [])

  // Check for existing trial result on mount
  useEffect(() => {
    const existingResult = getTrialResult()
    if (existingResult) {
      setResult({
        policy: existingResult.policy,
        fileName: existingResult.fileName,
      })
      setState('complete')
      // Restore email if saved
      const savedEmail = getTrialEmail()
      if (savedEmail) {
        setEmail(savedEmail)
        setEmailSubmitted(true)
      }
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

  // Separate function for processing file from state to avoid circular deps
  const processFileFromState = useCallback(async (file: File) => {
    // Check trial eligibility first
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
    if (!isAIConfigured()) {
      toast.error('Analysis service unavailable', {
        description: 'Please try again in a moment.',
      })
      return
    }

    // Track upload started
    trackTrialUploadStarted(file.type, file.size)

    // Start analysis
    setSelectedFile(file)
    setState('uploading')
    setProgress(10)
    setProgressMessage('Preparing document...')
    setError(null)

    // Declare progressInterval outside try block so it's accessible in catch
    let progressInterval: ReturnType<typeof setInterval> | null = null

    try {
      setProgress(20)
      setProgressMessage('Uploading document...')
      await new Promise((r) => setTimeout(r, 300))

      setState('analyzing')
      setProgress(40)
      setProgressMessage('Extracting text from PDF...')

      trackTrialAnalysisStarted()

      // Add timeout to prevent stuck state (90 seconds for larger documents)
      const EXTRACTION_TIMEOUT_MS = 90000
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

      const extractionResult = await Promise.race([
        extractPolicyFromDocument(file),
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

      // Validate policy exists
      if (!extractionResult.policy) {
        throw new Error('Analysis completed but no policy data was extracted')
      }

      setProgress(95)
      setProgressMessage('Finalizing analysis...')

      const policy = extractionResult.policy
      const fileName = sanitizeFileName(file.name)

      saveTrialResult(policy, fileName)

      setResult({
        policy,
        fileName,
        confidence: policy.aiConfidence,
      })

      setProgress(100)
      setProgressMessage('Analysis complete!')
      setState('complete')

      trackTrialAnalysisCompleted(
        policy.type,
        policy.aiConfidence,
        policy.coverages?.length || 0
      )

      toast.success('Analysis complete!', {
        description: 'Your policy has been analyzed successfully.',
      })
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval)
      console.error('[TryAnalysis] Error:', err)
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setError(message)
      setState('error')
      trackTrialAnalysisFailed(message)
      toast.error('Analysis failed', { description: message })
    }
  }, [])

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
      processFileFromState(fileFromState)
    }
  }, [location, backendReady, state, navigate, processFileFromState])

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

    // Track upload started
    trackTrialUploadStarted(file.type, file.size)

    // Start analysis
    setSelectedFile(file)
    setState('uploading')
    setProgress(10)
    setProgressMessage('Preparing document...')
    setError(null)

    // Declare progressInterval outside try block so it's accessible in catch
    let progressInterval: ReturnType<typeof setInterval> | null = null

    try {
      // Simulate upload progress
      setProgress(20)
      setProgressMessage('Uploading document...')
      await new Promise((r) => setTimeout(r, 500))

      setState('analyzing')
      setProgress(40)
      setProgressMessage('Extracting text from PDF...')

      // Track analysis started
      trackTrialAnalysisStarted()

      // Add timeout to prevent stuck state (90 seconds for larger documents)
      const EXTRACTION_TIMEOUT_MS = 90000
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

      // Run extraction with timeout
      const extractionResult = await Promise.race([
        extractPolicyFromDocument(file),
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

      // Validate policy exists
      if (!extractionResult.policy) {
        throw new Error('Analysis completed but no policy data was extracted')
      }

      setProgress(95)
      setProgressMessage('Finalizing analysis...')

      const policy = extractionResult.policy
      const fileName = sanitizeFileName(file.name)

      // Save to localStorage
      saveTrialResult(policy, fileName)

      // Save email if provided
      if (email && !emailSubmitted) {
        saveTrialEmail(email)
        setEmailSubmitted(true)
        trackTrialEmailCaptured()
      }

      setResult({
        policy,
        fileName,
        confidence: policy.aiConfidence,
      })

      setProgress(100)
      setProgressMessage('Analysis complete!')
      setState('complete')

      // Track completion
      trackTrialAnalysisCompleted(
        policy.type,
        policy.aiConfidence,
        policy.coverages?.length || 0
      )

      toast.success('Analysis complete!', {
        description: 'Your policy has been analyzed successfully.',
      })
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval)
      console.error('[TryAnalysis] Error:', err)
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setError(message)
      setState('error')
      trackTrialAnalysisFailed(message)
      toast.error('Analysis failed', { description: message })
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

  const handleShareCopy = async () => {
    const shareUrl = getShareUrl()
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      trackTrialShareCopied()
      toast.success('Link copied!', {
        description: 'Share this link with your colleagues.',
      })
      setTimeout(() => setShareCopied(false), 3000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleEmailSubmit = () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email')
      return
    }
    saveTrialEmail(email)
    setEmailSubmitted(true)
    trackTrialEmailCaptured()
    toast.success('Email saved!', {
      description: "We'll send you the analysis report.",
    })
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

  if (state === 'complete' && result) {
    const policy = result.policy
    const shareUrl = getShareUrl()
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
              <div className="flex items-center gap-2">
                {shareUrl && (
                  <Button
                    onClick={handleShareCopy}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    {shareCopied ? (
                      <>
                        <Check size={16} className="text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Share2 size={16} />
                        Share
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={() => handleSignUp('header')}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600"
                >
                  Save to Dashboard
                </Button>
              </div>
            </div>
          </div>

          {/* Policy Summary Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
              <h2 className="text-white font-semibold text-lg">Policy Summary</h2>
              <p className="text-slate-300 text-sm">
                {policy.typeTr || policy.type} • {policy.provider}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Key Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Policy Number</div>
                  <div className="font-semibold text-gray-900">{policy.policyNumber}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Insured</div>
                  <div className="font-semibold text-gray-900">{policy.insuredPerson || 'N/A'}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Premium</div>
                  <div className="font-semibold text-gray-900">
                    ₺{policy.premium?.toLocaleString('tr-TR') || 'N/A'}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-500">Coverage</div>
                  <div className="font-semibold text-gray-900">
                    {policy.coverages?.some(c => c.isMarketValue)
                      ? 'Rayiç Değer'
                      : `₺${policy.coverage?.toLocaleString('tr-TR') || 'N/A'}`}
                  </div>
                </div>
              </div>

              {/* Dates */}
              {(policy.startDate || policy.expiryDate) && (
                <div className="grid grid-cols-2 gap-4">
                  {policy.startDate && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-500">Start Date</div>
                      <div className="font-semibold text-gray-900">
                        {new Date(policy.startDate).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                  )}
                  {policy.expiryDate && (
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-500">Expiry Date</div>
                      <div className="font-semibold text-gray-900">
                        {new Date(policy.expiryDate).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Coverages */}
              {policy.coverages && policy.coverages.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Coverages ({policy.coverages.length})
                  </h3>
                  <div className="space-y-2">
                    {policy.coverages.map((cov, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                        <span className="text-sm text-emerald-800">{cov.nameTr || cov.name}</span>
                        <span className="text-sm font-medium text-emerald-700">
                          {cov.isUnlimited
                            ? 'Sınırsız'
                            : cov.isMarketValue
                              ? 'Rayiç Değer'
                              : cov.included && (!cov.limit || cov.limit === 0)
                                ? '✓ Dahil'
                                : `₺${cov.limit?.toLocaleString('tr-TR')}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exclusions */}
              {policy.exclusions && policy.exclusions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Exclusions ({policy.exclusions.length})
                  </h3>
                  <div className="space-y-2">
                    {policy.exclusions.map((exc, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                        <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-800">{exc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All AI Insights */}
              {policy.aiInsights && policy.aiInsights.length > 0 && (
                <div className="p-4 bg-blue-50 rounded-xl">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Sparkles size={16} />
                    AI Insights ({policy.aiInsights.length})
                  </h3>
                  <div className="space-y-2">
                    {policy.aiInsights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-800">{insight.replace(/^[✓✔]\s*/, '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Actions */}
              {policy.riskActions && policy.riskActions.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl">
                  <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Recommended Actions ({policy.riskActions.length})
                  </h3>
                  <div className="space-y-2">
                    {policy.riskActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ArrowRight size={14} className={`mt-0.5 flex-shrink-0 ${
                          action.priority === 'critical' ? 'text-red-600' :
                          action.priority === 'high' ? 'text-orange-600' :
                          'text-amber-600'
                        }`} />
                        <p className="text-sm text-amber-800">{action.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vehicle Info (for Kasko) */}
              {policy.vehicleInfo && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Vehicle Information</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {policy.vehicleInfo.plate && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500">Plate</div>
                        <div className="font-medium text-gray-900">{policy.vehicleInfo.plate}</div>
                      </div>
                    )}
                    {policy.vehicleInfo.make && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500">Make</div>
                        <div className="font-medium text-gray-900">{policy.vehicleInfo.make}</div>
                      </div>
                    )}
                    {policy.vehicleInfo.model && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500">Model</div>
                        <div className="font-medium text-gray-900">{policy.vehicleInfo.model}</div>
                      </div>
                    )}
                    {policy.vehicleInfo.year && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500">Year</div>
                        <div className="font-medium text-gray-900">{policy.vehicleInfo.year}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sign Up CTA Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 mb-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <h3 className="text-white font-bold text-lg mb-1">
                  Save this analysis to your dashboard
                </h3>
                <p className="text-blue-100 text-sm">
                  Create a free account to track policies, compare providers, and get market insights.
                </p>
              </div>
              <Button
                onClick={() => handleSignUp('banner')}
                className="bg-white text-blue-600 hover:bg-blue-50 whitespace-nowrap"
              >
                <Sparkles size={18} className="mr-2" />
                Sign Up Free
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </div>
          </div>

          {/* Email Capture (if not submitted) */}
          {!emailSubmitted && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail className="text-blue-600" size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Get a copy via email</h4>
                    <p className="text-sm text-gray-500">We'll send you this analysis report</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <Button onClick={handleEmailSubmit} variant="outline">
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

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

          {/* Optional Email Input (before analysis) */}
          {state === 'idle' && (
            <div className="px-8 py-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail size={16} className="text-gray-400" />
                  <span>Send me the report (optional)</span>
                </div>
                <div className="flex-1 flex gap-2 w-full sm:w-auto">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
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
