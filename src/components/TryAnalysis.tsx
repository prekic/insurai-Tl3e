import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Upload, FileText, Sparkles, Clock, XCircle, Shield, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { sanitizeFileName } from '@/lib/sanitize'
import { extractPolicyFromDocument, isAIConfigured, preloadPdfJs } from '@/lib/ai'
import { getProxyUrl } from '@/lib/ai/proxy-utils'
import { createProcessingLogger } from '@/lib/processing-logger'
import { createProcessingLog, updateProcessingLog } from '@/lib/processing-log-api'
import { useBackendHealth } from '@/hooks/useBackendHealth'
import { useAuth } from '@/lib/supabase/auth-context'
import { useTranslation } from '@/lib/i18n/i18n-context'
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
  const { t } = useTranslation()
  const isMounted = useRef(true)
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      isMounted.current = false
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
      if (intervalIdRef.current) clearInterval(intervalIdRef.current)
      // NOTE: We intentionally do NOT abort the extraction on unmount.
      // If the user navigates away during extraction, the fetch continues
      // in the background. When it completes, saveTrialResult() persists
      // the result. When the user returns to /try, the effect at line 73
      // finds the saved result and redirects to /policy/trial.
      // Previously, aborting here killed successful extractions mid-flight.
    }
  }, [])

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
    const locationState = location.state as LocationState | null
    const hasNewFile = !!locationState?.file

    const existingResult = getTrialResult()
    const usedTrial = hasUsedFreeTrial() || existingResult

    if (hasNewFile && usedTrial) {
      // User is trying to upload a NEW file, but has already used their trial.
      // Show them the "trial used" screen so they can sign up, instead of
      // instantly redirecting them to their OLD cached result.
      setState('trial-used')
      return
    }

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
  }, [navigate, location.state])

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
          state: { files: [fileFromState], autoProcess: true },
        })
      } else {
        navigate('/upload', { replace: true })
      }
    }
  }, [user, navigate, location.state])

  const backendReady = health.status === 'healthy'

  // Core extraction logic shared by both entry points (file from state, file from user selection)
  const runExtraction = useCallback(
    async (file: File) => {
      // Track upload started
      trackTrialUploadStarted(file.type, file.size)

      // Start analysis
      setSelectedFile(file)
      setState('uploading')
      setProgress(10)
      setProgressMessage(t.tryAnalysis.preparingDocument)
      setError(null)

      // Create processing logger for admin dashboard tracking
      const logger = createProcessingLogger({
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        user_id: user?.id,
      })

      // Set up persistence callback (same pattern as PolicyUpload)
      let logCreatePromise: Promise<boolean> | null = null
      logger.setPersistCallback(async (log) => {
        try {
          if (!logCreatePromise) {
            logCreatePromise = (async () => {
              const result = await createProcessingLog(log)
              return !!result
            })()
            await logCreatePromise
          } else {
            await logCreatePromise
            await updateProcessingLog(log.document_id, log)
          }
        } catch (err) {
          console.error('[TryAnalysis] Failed to persist processing log:', err)
        }
      })

      // Start upload stage
      logger.startStage('upload', {
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        source: 'try_analysis',
      })

      let progressInterval: ReturnType<typeof setInterval> | null = null

      try {
        // Pre-flight health check — fail fast if server is down instead of waiting 120s
        const proxyUrl = getProxyUrl()
        if (proxyUrl) {
          try {
            const healthResp = await fetch(`${proxyUrl}/api/health`, {
              signal: AbortSignal.timeout(5000),
            })
            if (!healthResp.ok) {
              throw new Error(t.tryAnalysis.serviceUnavailable)
            }
          } catch (healthErr) {
            if (
              healthErr instanceof Error &&
              healthErr.message === t.tryAnalysis.serviceUnavailable
            ) {
              throw healthErr
            }
            // Network error or timeout on health check — server is unreachable
            throw new Error(
              `${t.tryAnalysis.serviceUnavailable}. ${t.tryAnalysis.serviceStartingUp}`
            )
          }
        }

        setProgress(20)
        setProgressMessage(t.tryAnalysis.uploadingDocument)
        await new Promise((r) => setTimeout(r, 400))

        logger.completeStage({ output: { upload_complete: true } })

        setState('analyzing')
        setProgress(40)
        setProgressMessage(t.tryAnalysis.extractingText)

        trackTrialAnalysisStarted()

        // Client timeout: 150s to give the server's 105s budget room to respond.
        // The server enforces its own budget and returns structured timeout errors,
        // so this fires only as a last resort safety net.
        const EXTRACTION_TIMEOUT_MS = 150_000
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutIdRef.current = setTimeout(() => {
            const timeoutError = new Error(t.tryAnalysis.analysisTimedOut) as Error & {
              errorCode?: string
            }
            timeoutError.errorCode = 'CLIENT_TIMEOUT_UMBRELLA'
            reject(timeoutError)
          }, EXTRACTION_TIMEOUT_MS)
        })

        // Update progress during extraction — more frequent updates for better UX
        progressInterval = setInterval(() => {
          if (!isMounted.current) return
          setProgress((prev) => {
            if (prev < 85) return prev + 3
            return prev
          })
          setProgressMessage((prev) => {
            const messages = [
              t.tryAnalysis.extractingText,
              t.tryAnalysis.analyzingStructure,
              t.tryAnalysis.processingWithAI,
              t.tryAnalysis.processingWithAI,
              t.tryAnalysis.almostThere,
            ]
            const currentIndex = messages.indexOf(prev)
            if (currentIndex < messages.length - 1) {
              return messages[currentIndex + 1]
            }
            return prev
          })
        }, 8000) // Update every 8 seconds
        intervalIdRef.current = progressInterval

        // Run extraction with timeout - useFallback: false to surface real errors instead of mock data
        const extractionResult = await Promise.race([
          extractPolicyFromDocument(file, {
            useFallback: false,
            logger,
            userId: user?.id,
          }),
          timeoutPromise,
        ])

        if (progressInterval) clearInterval(progressInterval)

        // Handle null/undefined result
        if (!extractionResult) {
          throw new Error(t.tryAnalysis.noResponse)
        }

        if (!extractionResult.success) {
          // Preserve timing info in the error for diagnostic display
          const errMsg = extractionResult.error?.message || 'Failed to analyze policy'
          const timing = extractionResult.clientPhaseTiming
          if (timing) {
            console.warn('[TryAnalysis] Extraction failed - pipeline timing:', timing)
          }
          const enrichedError = new Error(errMsg) as Error & {
            clientPhaseTiming?: Record<string, number>
            errorCode?: string
            requestId?: string
          }
          enrichedError.clientPhaseTiming = timing
          // Server/proxy returned error code takes precedence, then internal/semantic code
          enrichedError.errorCode = extractionResult.errorCode || extractionResult.error?.code
          enrichedError.requestId = extractionResult.requestId
          throw enrichedError
        }

        // Reject fallback/sample data - user expects real AI results
        if ('source' in extractionResult && extractionResult.source === 'fallback') {
          console.warn(
            '[TryAnalysis] Extraction returned fallback sample data instead of real AI results'
          )
          throw new Error(t.tryAnalysis.aiExtractionFailed)
        }

        // Validate policy exists
        if (!extractionResult.policy) {
          throw new Error(t.tryAnalysis.noDataExtracted)
        }

        const policy = extractionResult.policy
        const fileName = sanitizeFileName(file.name)

        // Check for low confidence warning
        const isLowConfidence =
          'lowConfidence' in extractionResult && extractionResult.lowConfidence === true
        const confidenceScore =
          'confidenceScore' in extractionResult
            ? (extractionResult.confidenceScore as number)
            : undefined

        // Ensure policy has required fields for display
        const policyWithDefaults = {
          ...policy,
          id: policy.id || 'trial-' + Date.now(),
          fileName,
        }

        // Always save the result — even if the user navigated away.
        // When they return to /try, the saved result will be found and displayed.
        saveTrialResult(policyWithDefaults, fileName)

        // Mark processing as complete
        logger.complete()

        trackTrialAnalysisCompleted(policy.type, policy.aiConfidence, policy.coverages?.length || 0)

        // If component was unmounted (user navigated away), skip UI updates
        // but the result is already saved above so nothing is lost.
        if (!isMounted.current) return

        setProgress(95)
        setProgressMessage(t.tryAnalysis.finalizingAnalysis)

        setProgress(100)
        setProgressMessage(t.tryAnalysis.analysisComplete)

        if (isLowConfidence) {
          toast.warning(t.tryAnalysis.lowConfidenceTitle, {
            description: `Confidence: ${confidenceScore ? Math.round(confidenceScore * 100) : '?'}%. Some extracted data may be inaccurate.`,
          })
        } else {
          toast.success(t.tryAnalysis.analysisComplete, {
            description: t.tryAnalysis.analysisSuccessDesc,
          })
        }

        // Navigate to PolicyDetailView with the result
        navigate('/policy/trial', {
          state: {
            policy: policyWithDefaults,
            isTrialResult: true,
            lowConfidence: isLowConfidence,
            confidenceScore,
          },
          replace: true,
        })
      } catch (err) {
        if (progressInterval) clearInterval(progressInterval)

        // Don't update state or show toasts if component was unmounted
        if (!isMounted.current) return

        console.warn('[TryAnalysis] Extraction error:', err instanceof Error ? err.message : err)
        let message = err instanceof Error ? err.message : t.tryAnalysis.analysisFailed

        // Extract diagnostic fields from enriched error
        const phaseTiming = (err as Error & { clientPhaseTiming?: Record<string, number> })
          ?.clientPhaseTiming
        const errorCode = (err as Error & { errorCode?: string })?.errorCode
        const requestId = (err as Error & { requestId?: string })?.requestId

        // Build diagnostic suffix: [code=X | req=Y | provider_ms=Z, total_ms=W]
        const diagParts: string[] = []
        if (errorCode) diagParts.push(`code=${errorCode}`)
        if (requestId) diagParts.push(`req=${requestId}`)
        if (phaseTiming) {
          const timingEntries = Object.entries(phaseTiming)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}=${Math.round(v)}ms`)
          if (timingEntries.length) diagParts.push(timingEntries.join(', '))
        }
        const diagString = diagParts.length > 0 ? ` [${diagParts.join(' | ')}]` : ''

        // Make timeout errors more user-friendly with retry guidance, keep diagnostics
        const isTimeout =
          message.includes('timed out') ||
          message.includes('TIMEOUT') ||
          message.includes('BUDGET_EXHAUSTED')
        if (isTimeout) {
          message = `${t.tryAnalysis.analysisTimedOut} ${t.tryAnalysis.pleaseWait}${diagString}`
        } else {
          message = `${message}${diagString}`
        }

        // Log the failure for admin visibility
        logger.fail(message, {
          error_type: err instanceof Error ? err.name : 'UnknownError',
          source: 'try_analysis',
          ...(phaseTiming && { pipeline_timing: phaseTiming }),
        })

        setError(message)
        setState('error')
        trackTrialAnalysisFailed(message)
        toast.error(t.tryAnalysis.analysisFailed, { description: message })
      }
    },
    [navigate, t, user?.id]
  )

  // Validate file and check eligibility before running extraction
  const processFile = useCallback(
    (file: File) => {
      // Check trial eligibility
      const trialCheck = canPerformFreeTrial()
      if (!trialCheck.canTry) {
        toast.error(t.tryAnalysis.trialAlreadyUsed, {
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
        toast.error(t.tryAnalysis.serviceUnavailableToast, {
          description: t.tryAnalysis.pleaseWait,
        })
        return
      }

      runExtraction(file)
    },
    [backendReady, runExtraction, t]
  )

  // Process file passed from landing page UploadWidget via router state
  useEffect(() => {
    const locationState = location.state as LocationState | null
    const fileFromState = locationState?.file

    // Only process once, when we have a file and backend is ready
    if (fileFromState && !processedFromStateRef.current && backendReady && state === 'idle') {
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
              {t.tryAnalysis.trialAlreadyUsedTitle}
            </h1>
            <p className="text-gray-600 mb-6">
              {t.tryAnalysis.trialAlreadyUsedDesc}
              {timeRemaining > 0 && (
                <span className="block mt-2 text-sm text-gray-500">
                  {t.tryAnalysis.tryAgainIn} {formatTimeRemaining(timeRemaining)}
                </span>
              )}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => handleSignUp('trial_used')}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg"
              >
                <Sparkles size={18} className="mr-2" />
                {t.tryAnalysis.signUpUnlimited}
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                {t.tryAnalysis.backToHome}
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
            <span className="text-sm font-medium text-emerald-700">
              {t.tryAnalysis.freeAnalysisBadge}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.tryAnalysis.title}</h1>
          <p className="text-gray-600">{t.tryAnalysis.subtitle}</p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {state === 'error' ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <XCircle className="text-red-600" size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {t.tryAnalysis.analysisFailedTitle}
              </h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <Button onClick={handleTryAgain} variant="outline">
                {t.tryAnalysis.tryAgain}
              </Button>
            </div>
          ) : state === 'uploading' || state === 'analyzing' ? (
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{selectedFile?.name}</p>
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
              <p className="text-sm text-gray-500 text-center">
                {Math.round(progress)}
                {t.tryAnalysis.percentComplete}
              </p>

              {/* Analyzing animation */}
              {state === 'analyzing' && (
                <div className="mt-6 flex justify-center">
                  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 rounded-full">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="text-sm text-indigo-700 ml-2">
                      {t.tryAnalysis.aiAnalyzing}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`p-8 transition-colors ${isDragging ? 'bg-blue-50' : 'bg-white'}`}
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
                    isDragging ? 'bg-blue-100 border-2 border-blue-400' : 'bg-gray-100'
                  }`}
                >
                  <Upload size={36} className={isDragging ? 'text-blue-600' : 'text-gray-400'} />
                </div>
                <p className="font-semibold text-gray-900 mb-1">
                  {isDragging ? t.tryAnalysis.dropFileHere : t.tryAnalysis.uploadYourPolicy}
                </p>
                <p className="text-sm text-gray-500 mb-4">{t.tryAnalysis.dragDropOrClick}</p>
                <p className="text-xs text-gray-400">
                  {FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')} up to{' '}
                  {FILE_CONSTRAINTS.MAX_SIZE_MB}MB
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
                    <span>{t.tryAnalysis.secure}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Sparkles size={14} className="text-blue-500" />
                    <span>{t.tryAnalysis.aiPowered}</span>
                  </div>
                </div>
                <span className="text-gray-400">{t.tryAnalysis.oneFreeAnalysis}</span>
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
                <p className="font-medium text-amber-800">{t.tryAnalysis.serviceUnavailable}</p>
                <p className="text-sm text-amber-700 mt-1">{t.tryAnalysis.serviceStartingUp}</p>
              </div>
            </div>
          </div>
        )}

        {/* Already have account? */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            {t.tryAnalysis.alreadyHaveAccount}{' '}
            <button
              onClick={() => navigate('/auth')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {t.auth.signIn}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
