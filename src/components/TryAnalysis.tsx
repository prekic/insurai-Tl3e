import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Upload, Sparkles, Clock, XCircle, Shield, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { sanitizeFileName } from '@/lib/sanitize'
import { extractPolicyFromDocument, isAIConfigured, preloadPdfJs } from '@/lib/ai'
import { getProxyUrl } from '@/lib/ai/proxy-utils'
import { createProcessingLogger } from '@/lib/processing-logger'
import { createProcessingLog, updateProcessingLog } from '@/lib/processing-log-api'
import { AnalysisProgressCard } from './analysis/AnalysisProgressCard'
import type { DocumentProcessingLog } from '@/types/processing-log'
import { useBackendHealth } from '@/hooks/useBackendHealth'
import { useAuth } from '@/lib/supabase/auth-context'
import { useTranslation } from '@/lib/i18n/i18n-context'
import {
  hasUsedFreeTrial,
  canPerformFreeTrial,
  saveTrialResult,
  getTrialResult,
  getTrialTimeRemaining,
  getTrialUploadsRemaining,
  getTrialMaxUploads,
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
  const extractionInFlightRef = useRef(false)
  const lastFileRef = useRef<File | null>(null)
  const retryCountRef = useRef(0)
  const hardBudgetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      isMounted.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
      if (intervalIdRef.current) clearInterval(intervalIdRef.current)
      if (hardBudgetTimerRef.current) clearTimeout(hardBudgetTimerRef.current)
      // Detach the live-progress listener if still attached
      if (unsubscribeStageRef.current) {
        unsubscribeStageRef.current()
        unsubscribeStageRef.current = null
      }
      // NOTE: We intentionally do NOT abort the extraction on unmount.
      // If the user navigates away during extraction, the fetch continues
      // in the background. When it completes, saveTrialResult() persists
      // the result. When the user returns to /try, the effect at line 73
      // finds the saved result and redirects to /policy/trial.
      // Previously, aborting here killed successful extractions mid-flight.
    }
  }, [])

  const [state, setState] = useState<AnalysisState>('idle')
  // Legacy progress/message state — still set by extraction flow for telemetry
  // but not rendered in UI (replaced by AnalysisProgressCard which derives
  // truthful progress from the live processingLog stage events).
  const [, setProgress] = useState(0)
  const [, setProgressMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Live processing log snapshot for the new pipeline visualization (drives AnalysisProgressCard)
  const [processingLog, setProcessingLog] = useState<DocumentProcessingLog | null>(null)
  // Captured at analysis start for the live elapsed-time chip
  const startTimeRef = useRef<number>(0)
  // Holds the latest unsubscribe so we can detach on completion / unmount
  const unsubscribeStageRef = useRef<(() => void) | null>(null)

  // Track page view on mount
  useEffect(() => {
    trackTrialPageView()
  }, [])

  // Check for existing trial result on mount - redirect to PolicyDetailView
  useEffect(() => {
    const locationState = location.state as LocationState | null
    const hasNewFile = !!locationState?.file

    const exhaustedUploads = hasUsedFreeTrial()

    if (hasNewFile && exhaustedUploads) {
      // User is trying to upload a NEW file, but has exhausted daily uploads.
      setState('trial-used')
      return
    }

    if (hasNewFile && !exhaustedUploads) {
      // User has a new file and still has uploads remaining — let them proceed
      return
    }

    if (exhaustedUploads) {
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

      // Mark extraction as in-flight for visibility change detection
      extractionInFlightRef.current = true
      lastFileRef.current = file

      // Hard wall-time budget — if extraction hasn't resolved by this point,
      // force the error UI. Prevents users from sitting on a frozen
      // "PDF Extraction…" card for >2 minutes when both primary (Document AI)
      // and fallback (pdf.js client-side) paths are stuck retrying. The
      // background extraction may still complete and persist via
      // saveTrialResult(); on next visit the effect at the top of this file
      // picks that up. See findings F0 and the AnalysisProgressCard
      // retryingFallback banner.
      //
      // Budget must exceed the server's worst-case timing
      // (requestBudgetMs 175 s + Doc AI 14-30 s OCR + pipeline overhead).
      // 220 s gives ~30 s of headroom past the server's hard ceiling so we
      // don't kill legitimate extractions that are about to land.
      const HARD_EXTRACTION_BUDGET_MS = 220_000
      if (hardBudgetTimerRef.current) clearTimeout(hardBudgetTimerRef.current)
      hardBudgetTimerRef.current = setTimeout(() => {
        if (!extractionInFlightRef.current || !isMounted.current) return
        console.warn(
          '[TryAnalysis] Hard wall-time budget exceeded after',
          HARD_EXTRACTION_BUDGET_MS,
          'ms — forcing error state'
        )
        extractionInFlightRef.current = false
        try {
          logger.fail('Extraction wall-time budget exceeded', {
            error_type: 'BudgetExceededError',
            source: 'try_analysis',
            budget_ms: HARD_EXTRACTION_BUDGET_MS,
          })
        } catch {
          // Logger may already be in a terminal state; ignore.
        }
        if (unsubscribeStageRef.current) {
          unsubscribeStageRef.current()
          unsubscribeStageRef.current = null
        }
        setError(`${t.tryAnalysis.analysisTimedOut} ${t.tryAnalysis.pleaseWait}`)
        setState('error')
        trackTrialAnalysisFailed('hard_budget_exceeded')
        toast.error(t.tryAnalysis.analysisFailed, {
          description: `${t.tryAnalysis.analysisTimedOut} ${t.tryAnalysis.pleaseWait}`,
        })
      }, HARD_EXTRACTION_BUDGET_MS)

      // Start analysis
      setSelectedFile(file)
      setState('uploading')
      setProgress(10)
      setProgressMessage(t.tryAnalysis.preparingDocument)
      setError(null)
      // Capture start time for the live elapsed-time chip
      startTimeRef.current = Date.now()
      setProcessingLog(null)

      // Create processing logger for admin dashboard tracking
      const logger = createProcessingLogger({
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        user_id: user?.id,
      })

      // Subscribe to live stage transitions so AnalysisProgressCard can render
      // a truthful, multi-stage pipeline visualization. Capture unsubscribe in
      // a ref so we can detach on completion / unmount and avoid leaks.
      const unsubscribe = logger.onStageChange((latest) => {
        if (isMounted.current) setProcessingLog(latest)
      })
      unsubscribeStageRef.current = unsubscribe

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

        // Client timeout: 300s to give the debate pipeline room to finish (long docs ~4.5min).
        // The server enforces its own budget and returns structured timeout errors,
        // so this fires only as a last resort safety net.
        // Default 300_000 — configurable via app_settings ai.trial_extraction_timeout_ms
        let EXTRACTION_TIMEOUT_MS = 300_000
        try {
          const { getAIConfig } = await import('@/lib/config')
          const aiCfg = await getAIConfig()
          EXTRACTION_TIMEOUT_MS = aiCfg.trialExtractionTimeoutMs
        } catch {
          // Keep default
        }
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
        // Create AbortController so previous SSE can be aborted on tab-resume retry
        abortControllerRef.current = new AbortController()
        const extractionResult = await Promise.race([
          extractPolicyFromDocument(file, {
            useFallback: false,
            logger,
            userId: user?.id,
            signal: abortControllerRef.current.signal,
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

        // === CONFIDENCE DIAGNOSTIC CHECKPOINT (TryAnalysis) ===
        // Gated behind LOG_LEVEL=debug (via localStorage) or Vite DEV mode to keep
        // Railway production logs clean. Enable via: localStorage.LOG_LEVEL='debug'.
        if (
          import.meta.env.DEV ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('LOG_LEVEL') === 'debug')
        ) {
          console.warn('[TryAnalysis ConfidenceDiag] Extraction result confidence state:', {
            lowConfidence: isLowConfidence,
            confidenceScore:
              confidenceScore != null ? Math.round(confidenceScore * 100) + '%' : 'not provided',
            policyAiConfidence:
              policy.aiConfidence != null ? Math.round(policy.aiConfidence * 100) + '%' : 'not set',
            aiConfidenceValue: policy.aiConfidence,
            tier: isLowConfidence ? 'LOW_CONFIDENCE_WARNING' : 'FULL_CONFIDENCE',
          })
        }

        // Ensure policy has required fields for display
        const policyWithDefaults = {
          ...policy,
          id: policy.id || 'trial-' + Date.now(),
          fileName,
        }

        // Always save the result locally — even if the user navigated away.
        extractionInFlightRef.current = false
        abortControllerRef.current = null
        if (hardBudgetTimerRef.current) {
          clearTimeout(hardBudgetTimerRef.current)
          hardBudgetTimerRef.current = null
        }
        saveTrialResult(policyWithDefaults, fileName)

        // BACKGROUND SYNC: Fire and forget to the anonymous persistence API
        // This persists the extraction out-of-band so we don't block the UI.
        const formData = new FormData()
        formData.append('file', file)
        formData.append('extractionResult', JSON.stringify(policyWithDefaults))

        fetch(`${getProxyUrl() || ''}/api/policy/save-anonymous`, {
          method: 'POST',
          body: formData,
        }).catch((err) => {
          console.warn('[TryAnalysis] Failed to persist anonymous extraction in background', err)
        })

        // Mark processing as complete
        logger.complete()
        // Detach live-progress listener — extraction is finished
        if (unsubscribeStageRef.current) {
          unsubscribeStageRef.current()
          unsubscribeStageRef.current = null
        }

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
        // Detach live-progress listener on error too
        if (unsubscribeStageRef.current) {
          unsubscribeStageRef.current()
          unsubscribeStageRef.current = null
        }

        extractionInFlightRef.current = false
        abortControllerRef.current = null
        if (hardBudgetTimerRef.current) {
          clearTimeout(hardBudgetTimerRef.current)
          hardBudgetTimerRef.current = null
        }

        // Don't update state or show toasts if component was unmounted
        if (!isMounted.current) return

        console.warn('[TryAnalysis] Extraction error:', err instanceof Error ? err.message : err)
        let message = err instanceof Error ? err.message : t.tryAnalysis.analysisFailed

        // Extract diagnostic fields from enriched error
        const phaseTiming = (err as Error & { clientPhaseTiming?: Record<string, number> })
          ?.clientPhaseTiming
        const errorCode = (err as Error & { errorCode?: string })?.errorCode
        const requestId = (err as Error & { requestId?: string })?.requestId

        // Build a user-facing diagnostic string that helps them understand the failure
        let userDiag = ''
        if (errorCode) {
          const diagLabels: Record<string, string> = {
            NETWORK_ERROR: 'Network connection lost',
            TIMEOUT: 'AI service timed out — the document may be too large',
            CLIENT_FETCH_TIMEOUT: 'Connection timed out — the server took too long',
            CLIENT_TIMEOUT_UMBRELLA: 'Extraction took too long — the server may be busy',
            RATE_LIMIT_EXCEEDED: 'Too many requests — please wait a moment',
            DATA_CONVERSION_ERROR:
              'AI data could not be processed — unexpected format from provider',
            LOW_CONFIDENCE: 'AI confidence too low — results may be incomplete',
            BILLING_ERROR: 'AI service billing issue',
            INVALID_API_KEY: 'AI provider API key is invalid',
            DOCUMENT_TOO_LARGE: 'Document is too large for the AI service',
            PAYLOAD_TOO_LARGE: 'File exceeds the maximum upload size',
            EXTRACTION_TIMEOUT: 'AI analysis timed out — the service may be busy',
            ALL_PROVIDERS_FAILED: 'All AI providers failed — server issue',
            OCR_ERROR:
              'Could not read the document — scanned PDFs and image-only files are not supported yet',
            OCR_FAILED: 'Document text extraction failed — try uploading a text-based PDF',
            AUTH_FAILED: 'Document scanning service configuration issue',
            API_NOT_ENABLED: 'Document scanning service not enabled',
            NO_OCR_CONFIG: 'Document scanning not configured',
          }
          userDiag = diagLabels[errorCode] || `Error code: ${errorCode}`
        }

        // Log full diagnostics to console for developer debugging
        if (errorCode || requestId || phaseTiming) {
          const diagParts: string[] = []
          if (errorCode) diagParts.push(`code=${errorCode}`)
          if (requestId) diagParts.push(`req=${requestId}`)
          if (phaseTiming) {
            const timingEntries = Object.entries(phaseTiming)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}=${Math.round(v)}ms`)
            if (timingEntries.length) diagParts.push(timingEntries.join(', '))
          }
          console.warn('[TryAnalysis] Diagnostics:', diagParts.join(' | '))
        }

        // Build a user-friendly message from diagnostics
        // Timeout detection checks both the enriched error code and raw message
        const isTimeout =
          errorCode === 'TIMEOUT' ||
          errorCode === 'CLIENT_FETCH_TIMEOUT' ||
          errorCode === 'EXTRACTION_TIMEOUT' ||
          errorCode === 'BUDGET_EXHAUSTED' ||
          message.includes('timed out') ||
          message.includes('TIMEOUT') ||
          message.includes('BUDGET_EXHAUSTED')

        if (userDiag) {
          message = isTimeout
            ? `${t.tryAnalysis.analysisTimedOut} ${t.tryAnalysis.pleaseWait}`
            : userDiag
        } else if (isTimeout) {
          message = `${t.tryAnalysis.analysisTimedOut} ${t.tryAnalysis.pleaseWait}`
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

  // Detect mobile tab suspension: when user returns to the tab after backgrounding,
  // the HTTP fetch is likely dead but the promise never resolved. Auto-retry.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!isMounted.current) return

      // Check if a result was saved in the background (extraction may have completed).
      const existingResult = getTrialResult()
      if (existingResult) {
        // Extraction completed while tab was backgrounded — redirect to results
        navigate('/policy/trial', {
          state: { policy: existingResult.policy, isTrialResult: true },
          replace: true,
        })
        return
      }

      // Get the last file for retry
      const file = lastFileRef.current
      if (!file) return

      // Case 1: Extraction was in-flight when suspended — retry automatically
      if (extractionInFlightRef.current && retryCountRef.current < 2) {
        console.warn('[TryAnalysis] Tab resumed during extraction — retrying automatically')
        retryCountRef.current++
        // Abort the previous SSE connection to prevent ERR_CONNECTION_RESET
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        // Clear stale timers from the dead extraction
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
        if (intervalIdRef.current) clearInterval(intervalIdRef.current)
        extractionInFlightRef.current = false
        // Reset state and re-run
        setState('idle')
        setError(null)
        setProgress(0)
        // Small delay to let the browser reconnect network
        setTimeout(() => {
          if (isMounted.current) runExtraction(file)
        }, 1500)
        return
      }

      // Case 2: Extraction timed out while tab was suspended (timer fired before return).
      // The hard budget or client timeout set error state while user was away.
      // Auto-retry once to give it another chance.
      if (retryCountRef.current < 1) {
        console.warn('[TryAnalysis] Tab resumed after extraction timeout — retrying automatically')
        retryCountRef.current++
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
        if (intervalIdRef.current) clearInterval(intervalIdRef.current)
        extractionInFlightRef.current = false
        setState('idle')
        setError(null)
        setProgress(0)
        setTimeout(() => {
          if (isMounted.current) runExtraction(file)
        }, 1500)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [navigate, runExtraction])

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

    // Only process once, when we have a file, backend is ready, and user is NOT logged in.
    // Logged-in users are redirected to /upload by the effect above — processing here
    // would cause a double extraction (one here + one in PolicyUpload after redirect).
    if (
      fileFromState &&
      !processedFromStateRef.current &&
      backendReady &&
      state === 'idle' &&
      !user
    ) {
      processedFromStateRef.current = true
      // Clear location state to prevent reprocessing on refresh
      navigate(location.pathname, { replace: true, state: {} })
      // Start processing the file
      processFile(fileFromState)
    }
  }, [location, backendReady, state, navigate, processFile, user])

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
    const maxUploads = getTrialMaxUploads()
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
              {t.tryAnalysis.dailyLimitReached.replace('{max}', String(maxUploads))}
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
          {getTrialUploadsRemaining() < getTrialMaxUploads() && (
            <p className="text-sm text-amber-600 mt-2">
              {t.tryAnalysis.uploadsRemaining
                .replace('{remaining}', String(getTrialUploadsRemaining()))
                .replace('{max}', String(getTrialMaxUploads()))}
            </p>
          )}
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
            <AnalysisProgressCard
              fileName={selectedFile?.name || ''}
              fileSizeBytes={selectedFile?.size}
              log={processingLog}
              state={state}
              startTimeMs={startTimeRef.current}
            />
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
