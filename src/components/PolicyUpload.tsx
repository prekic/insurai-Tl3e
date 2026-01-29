import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Upload, FileText, Check, ArrowLeft, X, Eye, Sparkles, AlertTriangle, RefreshCw, Cloud, Cpu, Zap, ServerCrash, Server, Stethoscope, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import { usePolicies } from '@/lib/policy-context'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { sanitizeFileName, sanitizeId } from '@/lib/sanitize'
import { useAuth } from '@/lib/supabase/auth-context'
import { isSupabaseConfigured, uploadPolicyDocument, createPolicy, type PolicyInsert, type PolicyType as SupabasePolicyType } from '@/lib/supabase'
import { extractPolicyFromDocument, isAIConfigured, preloadPdfJs } from '@/lib/ai'
import { useBackendHealth } from '@/hooks/useBackendHealth'
import { ConflictResolutionDialog } from './ConflictResolutionDialog'
import type { PreUploadCheckResult } from '@/lib/policy-utils'
import {
  checkPolicyBeforeUpload,
  handlePolicyAmendment,
  handleDuplicateResolution,
} from '@/lib/policy-upload-check'
import { createProcessingLogger } from '@/lib/processing-logger'
import { createProcessingLog, updateProcessingLog } from '@/lib/processing-log-api'

/**
 * Convert AnalyzedPolicy to Supabase PolicyInsert format
 */
function convertToSupabasePolicy(policy: AnalyzedPolicy, userId: string): PolicyInsert {
  return {
    id: policy.id,
    user_id: userId,
    policy_number: policy.policyNumber,
    provider: policy.provider,
    type: policy.type as SupabasePolicyType,
    type_tr: policy.typeTr,
    coverage: policy.coverage,
    premium: policy.premium,
    deductible: policy.deductible,
    start_date: policy.startDate,
    expiry_date: policy.expiryDate,
    status: policy.status,
    insured_person: policy.insuredPerson || 'Unknown',
    location: policy.location || null,
    document_type: policy.documentType,
    upload_date: policy.uploadDate,
    logo: policy.logo || null,
    raw_data: {
      coverages: policy.coverages,
      exclusions: policy.exclusions,
      specialConditions: policy.specialConditions,
      insuranceLine: policy.insuranceLine,
      aiConfidence: policy.aiConfidence,
      aiInsights: policy.aiInsights,
      marketComparison: policy.marketComparison,
      riskScore: policy.riskScore,
      gapAnalysis: policy.gapAnalysis,
      riskActions: policy.riskActions,
      gapActions: policy.gapActions,
      extractedText: policy.extractedText,
      processedText: policy.processedText,
    },
  }
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'

interface UploadedFile {
  id: string
  file: File
  status: UploadState
  progress: number
  policy?: AnalyzedPolicy
  error?: string
  extractionSource?: 'ai' | 'fallback' | 'ocr'
  aiConfidence?: number
  /** Conflict detected during pre-upload check */
  conflict?: PreUploadCheckResult
  /** Whether this file is awaiting conflict resolution */
  awaitingResolution?: boolean
}

/** State for the conflict resolution dialog */
interface ConflictDialogState {
  isOpen: boolean
  fileId: string | null
  conflict: PreUploadCheckResult | null
  newPolicy: AnalyzedPolicy | null
  isLoading: boolean
}

export function PolicyUpload() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addPolicies, refreshPolicies } = usePolicies()
  const { user, isConfigured: authConfigured } = useAuth()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const { health, checkHealth, runDiagnostics } = useBackendHealth()
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false)
  const filesReceivedRef = useRef(false)

  // Conflict resolution dialog state
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState>({
    isOpen: false,
    fileId: null,
    conflict: null,
    newPolicy: null,
    isLoading: false,
  })

  const useSupabase = authConfigured && isSupabaseConfigured() && !!user
  const backendReady = health.status === 'healthy'
  // In production (SaaS), hide technical details from end users
  const IS_PRODUCTION = import.meta.env.PROD

  // Track if we're in autoOpen mode (to show minimal UI until dialog opens)
  const isAutoOpen = searchParams.get('autoOpen') === 'true'
  const [autoOpenTriggered, setAutoOpenTriggered] = useState(false)

  // Auto-open file dialog if autoOpen query param is present
  useEffect(() => {
    if (isAutoOpen && fileInputRef.current && !autoOpenTriggered) {
      // Mark as triggered immediately to prevent re-triggering
      setAutoOpenTriggered(true)
      // Small delay to ensure the component is fully rendered
      const timer = setTimeout(() => {
        fileInputRef.current?.click()
        // Remove the autoOpen param from URL without adding history entry
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('autoOpen')
        const newUrl = newSearchParams.toString() ? `/upload?${newSearchParams.toString()}` : '/upload'
        navigate(newUrl, { replace: true })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isAutoOpen, autoOpenTriggered, searchParams, navigate])

  // Listen for files passed from GlobalNavigation
   
  useEffect(() => {
    // Check if files were passed via navigation state
    const state = location.state as { filesReady?: boolean } | null
    if (state?.filesReady && !filesReceivedRef.current) {
      filesReceivedRef.current = true

      // Listen for the custom event with actual file objects
      const handleFilesSelected = (e: CustomEvent<File[]>) => {
        const selectedFiles = e.detail
        if (selectedFiles && selectedFiles.length > 0) {
          addFiles(selectedFiles)
        }
        // Clean up session storage
        sessionStorage.removeItem('pendingUploadFiles')
        // Clear the navigation state
        navigate(location.pathname, { replace: true, state: null })
      }

      window.addEventListener('filesSelected', handleFilesSelected as EventListener)

      // Cleanup
      return () => {
        window.removeEventListener('filesSelected', handleFilesSelected as EventListener)
      }
    }
  }, [location, navigate])

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true)
    toast.info('Running diagnostics...', {
      description: 'Testing API key validity with each provider',
    })

    const result = await runDiagnostics()
    setIsRunningDiagnostics(false)

    if (result) {
      if (result.summary.anyProviderValid) {
        toast.success('Diagnostics complete', {
          description: result.summary.recommendation,
        })
      } else {
        toast.error('Diagnostics failed', {
          description: result.summary.recommendation,
          duration: 10000,
        })
      }
    } else {
      toast.error('Could not run diagnostics', {
        description: 'Backend server may not be reachable',
      })
    }
  }

  // Preload pdf.js in the background when component mounts
  // This reduces perceived load time when user uploads a file
  useEffect(() => {
    preloadPdfJs()
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const addFiles = async (newFiles: File[]) => {
    // Validate files first
    const { valid, errors } = validateFiles(newFiles)

    // Show error toasts for invalid files
    errors.forEach((error) => {
      const errorInfo = getErrorMessage(error.code)
      toast.error(errorInfo.title, {
        description: error.details || errorInfo.description,
        duration: 5000,
      })
    })

    // If no valid files, return early
    if (valid.length === 0) {
      return
    }

    // Show success toast if some files were valid
    if (errors.length > 0 && valid.length > 0) {
      toast.info(`${valid.length} file(s) accepted`, {
        description: `${errors.length} file(s) were rejected due to validation errors.`,
      })
    }

    const uploadedFiles: UploadedFile[] = valid.map((file) => ({
      id: `file-${Date.now()}-${Math.random()}`,
      file,
      status: 'uploading' as UploadState,
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...uploadedFiles])

    // Process each file
    for (const uploadedFile of uploadedFiles) {
      await processFileAsync(uploadedFile.id, uploadedFile.file)
    }
  }

  const processFileAsync = async (fileId: string, file: File) => {
    // Create processing logger for tracking the document journey
    const logger = createProcessingLogger({
      filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      user_id: user?.id,
    })

    // Use a promise-based lock to prevent race conditions
    // First call creates, all others wait then update
    let createPromise: Promise<boolean> | null = null

    // Set up persistence callback to save log updates to database
    logger.setPersistCallback(async (log) => {
      try {
        if (!createPromise) {
          // First call - create a promise for the create operation
          console.warn('[ProcessingLog] Creating new log for document:', log.document_id)
          createPromise = (async () => {
            const result = await createProcessingLog(log)
            console.warn('[ProcessingLog] Create result:', result ? 'success' : 'failed')
            return !!result
          })()
          await createPromise
        } else {
          // Wait for create to finish, then update
          console.warn('[ProcessingLog] Updating log for document:', log.document_id, 'stages:', log.stages.length)
          await createPromise
          await updateProcessingLog(log.document_id, log)
        }
      } catch (err) {
        // Log errors in both dev and prod for debugging
        console.error('[ProcessingLogger] Failed to persist log:', err)
      }
    })

    try {
      // ========== UPLOAD STAGE ==========
      logger.startStage('upload', {
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
      })

      // Update to uploading state with progress
      for (let i = 0; i <= 100; i += 25) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: i } : f
          )
        )
      }

      logger.completeStage({
        output: { upload_complete: true },
      })

      // Switch to analyzing state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: 'analyzing', progress: 100 } : f
        )
      )

      // Use real AI extraction - pass the logger for tracking
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        logger,  // Pass logger to track extraction stages
      })

      if (!result.success) {
        throw new Error(result.error.message)
      }

      const { policy, source, extractedData } = result

      // ========== DUPLICATE CHECK STAGE ==========
      logger.startStage('duplicate_check', {
        policy_number: policy.policyNumber,
        provider: policy.provider,
        insured_person: policy.insuredPerson,
      })

      // Check for conflicts before saving (only if using Supabase)
      let conflictResult: PreUploadCheckResult = { type: 'noConflict' }
      if (useSupabase && user) {
        try {
          conflictResult = await checkPolicyBeforeUpload(policy)
        } catch (checkError) {
          // Log in development only
          if (import.meta.env.DEV) {
            console.warn('Failed to check for conflicts:', checkError)
          }
          // Continue with no conflict (fail open)
        }
      }

      logger.completeStage({
        output: {
          conflict_type: conflictResult.type,
          has_conflict: conflictResult.type !== 'noConflict',
          existing_policy_id: conflictResult.type !== 'noConflict' ? conflictResult.existingPolicy?.id : undefined,
        },
      })

      // If conflict detected, show resolution dialog instead of saving immediately
      if (conflictResult.type !== 'noConflict') {
        // Log that we're waiting for conflict resolution
        logger.startStage('conflict_resolution', {
          conflict_type: conflictResult.type,
          existing_policy: conflictResult.existingPolicy?.policyNumber,
        })
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: 'complete',
                  policy,
                  extractionSource: source,
                  aiConfidence: extractedData.confidence.overall,
                  conflict: conflictResult,
                  awaitingResolution: true,
                }
              : f
          )
        )

        // Show the conflict resolution dialog
        setConflictDialog({
          isOpen: true,
          fileId,
          conflict: conflictResult,
          newPolicy: policy,
          isLoading: false,
        })

        const displayName = sanitizeFileName(file.name)
        toast.warning(
          conflictResult.type === 'exactDuplicate' ? 'Duplicate detected' : 'Amendment detected',
          {
            description: `${displayName} matches an existing policy. Please choose how to proceed.`,
          }
        )
        return // Don't proceed with normal save
      }

      // ========== DATABASE SAVE STAGE ==========
      logger.startStage('database_save', {
        use_supabase: useSupabase,
        policy_id: policy.id,
      })

      // If using Supabase, save policy to database and upload document
      let savedToCloud = false
      if (useSupabase && user) {
        try {
          // Save policy to Supabase database
          const supabasePolicy = convertToSupabasePolicy(policy, user.id)
          await createPolicy(supabasePolicy)
          savedToCloud = true

          // Link policy ID to the processing log
          logger.setPolicyId(policy.id)

          // Refresh local context so policy is immediately available
          await refreshPolicies()

          // Also upload the document to storage
          try {
            await uploadPolicyDocument(policy.id, file)
          } catch (uploadError) {
            // Only log storage errors in development
            if (import.meta.env.DEV) {
              console.warn('Failed to upload document to storage:', uploadError)
            }
            // Don't fail if storage upload fails - policy is already saved
          }

          logger.completeStage({
            output: {
              saved_to_cloud: true,
              policy_id: policy.id,
              document_uploaded: true,
            },
          })
        } catch (saveError) {
          // Log save errors with full details
          const errorMessage = saveError instanceof Error ? saveError.message : String(saveError)
          const errorDetails = {
            error_type: saveError instanceof Error ? saveError.constructor.name : 'Unknown',
            error_message: errorMessage,
            policy_id: policy.id,
            policy_number: policy.policyNumber,
            provider: policy.provider,
          }

          console.error('[PolicyUpload] Database save failed:', errorMessage, errorDetails)

          // Mark stage as failed with full error details
          logger.failStage(`Database save failed: ${errorMessage}`, errorDetails)

          // Continue even if save fails - policy is still in local state
        }
      } else {
        logger.completeStage({
          output: { saved_to_cloud: false, reason: 'local_only_mode' },
        })
      }

      // Mark the entire processing as complete
      logger.complete()

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'complete',
                policy,
                extractionSource: source,
                aiConfidence: extractedData.confidence.overall,
              }
            : f
        )
      )

      // Get the file name for the toast
      const displayName = sanitizeFileName(file.name)
      const storageNote = savedToCloud ? ' (saved to cloud)' : ''
      const aiNote = source === 'ai'
        ? ` (${Math.round(extractedData.confidence.overall * 100)}% confidence)`
        : ' (demo mode)'

      toast.success('Analysis complete', {
        description: `${displayName} has been analyzed${aiNote}${storageNote}.`,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Log the failure in the processing log
      logger.fail(errorMessage, {
        error_type: error instanceof Error ? error.name : 'UnknownError',
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Provide user-friendly error messages based on the error
      // In production (SaaS), hide technical details like .env references
      const IS_PRODUCTION = import.meta.env.PROD
      let userMessage = errorMessage
      let userTitle = 'Analysis Failed'
      let troubleshootingTip = ''

      if (errorMessage.includes('not configured') || errorMessage.includes('NO_AI_CONFIG')) {
        userTitle = 'AI Not Configured'
        userMessage = 'The AI service is not available.'
        troubleshootingTip = IS_PRODUCTION
          ? 'Please contact support if this issue persists.'
          : 'Ensure the backend server is running with OPENAI_API_KEY or ANTHROPIC_API_KEY in .env'
      } else if (errorMessage.includes('PDF_TIMEOUT') || errorMessage.includes('timed out') || errorMessage.includes('took too long')) {
        userTitle = 'PDF Processing Timeout'
        userMessage = 'The PDF took too long to process.'
        troubleshootingTip = 'The file may be too large or complex. Try a smaller file or retry.'
      } else if (errorMessage.includes('PDF_WORKER_ERROR') || errorMessage.includes('worker failed')) {
        userTitle = 'PDF Processing Error'
        userMessage = 'The PDF processor encountered an error.'
        troubleshootingTip = 'This is usually temporary. Please try again.'
      } else if (errorMessage.includes('FILE_READ_ERROR') || errorMessage.includes('Could not read')) {
        userTitle = 'File Read Error'
        userMessage = 'Could not read the uploaded file.'
        troubleshootingTip = 'The file may have been moved or is corrupted. Please select the file again.'
      } else if (errorMessage.includes('PDF_PARSE_ERROR') || errorMessage.includes('PDF processing')) {
        userTitle = 'PDF Processing Error'
        userMessage = 'Could not read the PDF file.'
        troubleshootingTip = 'The file may be corrupted, password-protected, or in an unsupported format.'
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        userTitle = 'Rate Limit Exceeded'
        userMessage = 'Too many requests to the AI service.'
        troubleshootingTip = 'Please wait a few minutes before trying again.'
      } else if (errorMessage.includes('proxy') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
        userTitle = 'Network Error'
        userMessage = 'Could not connect to the backend server.'
        troubleshootingTip = IS_PRODUCTION
          ? 'Please check your internet connection and try again.'
          : 'Check that the backend is running on port 4001 (npm run dev:server)'
      } else if (errorMessage.includes('PROVIDER_NOT_CONFIGURED') || errorMessage.includes('503')) {
        userTitle = 'AI Provider Not Ready'
        userMessage = 'The AI provider is not configured on the server.'
        troubleshootingTip = IS_PRODUCTION
          ? 'Please contact support if this issue persists.'
          : 'Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server .env file and restart.'
      } else if (errorMessage.includes('LOW_CONFIDENCE')) {
        userTitle = 'Low Extraction Confidence'
        userMessage = 'The AI could not reliably extract data from this document.'
        troubleshootingTip = 'The PDF may be scanned or have poor text quality. Try a clearer document.'
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        userTitle = 'Request Timeout'
        userMessage = 'The request took too long to complete.'
        troubleshootingTip = 'The document may be too large or the AI service is slow. Try again later.'
      }

      const fullErrorMessage = troubleshootingTip
        ? `${userMessage} ${troubleshootingTip}`
        : userMessage

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: 'error', error: fullErrorMessage }
            : f
        )
      )

      toast.error(userTitle, {
        description: fullErrorMessage,
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => retryFile(fileId),
        },
      })
    }
  }

  const retryFile = async (fileId: string) => {
    // Find the file to get its File object
    const fileToRetry = files.find((f) => f.id === fileId)
    if (!fileToRetry) return

    // Reset the file status and retry
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: 'uploading', progress: 0, error: undefined, extractionSource: undefined }
          : f
      )
    )

    toast.info('Retrying...', {
      description: 'Attempting to process the file again.',
    })

    await processFileAsync(fileId, fileToRetry.file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles)
    }
    // Reset input value so same file can be selected again
    e.target.value = ''
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    toast.info('File removed', {
      description: 'The file has been removed from the upload queue.',
    })
  }

  const handleAnalyzeAll = () => {
    const analyzedPolicies = files
      .filter((f): f is UploadedFile & { policy: AnalyzedPolicy } => f.status === 'complete' && f.policy !== undefined && !f.awaitingResolution)
      .map((f) => f.policy)

    if (analyzedPolicies.length === 0) {
      toast.error('No policies to analyze', {
        description: 'Please wait for at least one policy to complete processing.',
      })
      return
    }

    // When using Supabase, policies are already saved in processFileAsync()
    // and local context is updated via refreshPolicies().
    // Only call addPolicies() for local-only mode (no Supabase).
    if (!useSupabase) {
      addPolicies(analyzedPolicies)
    }

    // Use replace to avoid back button returning to upload page with completed files
    navigate('/dashboard', { replace: true })
  }

  const useSamplePolicies = () => {
    toast.success('Sample policies loaded', {
      description: `${samplePolicies.length} sample Turkish insurance policies have been loaded.`,
    })
    addPolicies(samplePolicies)
    navigate('/dashboard')
  }

  const retryAllFailed = () => {
    const failedFiles = files.filter((f) => f.status === 'error')
    failedFiles.forEach((f) => retryFile(f.id))
  }

  const handleViewPolicy = (policyId: string) => {
    const safeId = sanitizeId(policyId)
    if (safeId) {
      // Use replace to avoid back button returning to upload page with files
      navigate(`/policy/${safeId}`, { replace: true })
    }
  }

  // Safely get display name for file
  const getDisplayFileName = (file: File): string => {
    return sanitizeFileName(file.name)
  }

  const completedCount = files.filter((f) => f.status === 'complete' && !f.awaitingResolution).length
  const errorCount = files.filter((f) => f.status === 'error').length
  const processingCount = files.filter((f) => f.status === 'uploading' || f.status === 'analyzing').length

  // ========== Conflict Resolution Handlers ==========

  const closeConflictDialog = () => {
    setConflictDialog({
      isOpen: false,
      fileId: null,
      conflict: null,
      newPolicy: null,
      isLoading: false,
    })
  }

  const handleConflictSkip = () => {
    const { fileId } = conflictDialog
    if (!fileId) return

    // Mark file as skipped and remove from list
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    closeConflictDialog()

    toast.info('Upload skipped', {
      description: 'The policy was not saved as it already exists.',
    })
  }

  const handleConflictReplace = async () => {
    const { fileId, conflict, newPolicy } = conflictDialog
    if (!fileId || !conflict || !newPolicy || conflict.type === 'noConflict') return

    setConflictDialog((prev) => ({ ...prev, isLoading: true }))

    try {
      const existingId = conflict.existingPolicy.id
      const result = await handleDuplicateResolution('replace', existingId, newPolicy)

      if (result.error) {
        throw new Error(result.error)
      }

      // Refresh local context so policy is immediately available
      await refreshPolicies()

      // Update file state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, awaitingResolution: false, conflict: undefined }
            : f
        )
      )

      closeConflictDialog()
      toast.success('Policy updated', {
        description: 'The existing policy has been updated with the new data.',
      })
    } catch (error) {
      setConflictDialog((prev) => ({ ...prev, isLoading: false }))
      toast.error('Update failed', {
        description: error instanceof Error ? error.message : 'Failed to update policy',
      })
    }
  }

  const handleConflictKeepBoth = async () => {
    const { fileId, newPolicy } = conflictDialog
    if (!fileId || !newPolicy || !user) return

    setConflictDialog((prev) => ({ ...prev, isLoading: true }))

    try {
      // Save the new policy as a separate record
      const supabasePolicy = convertToSupabasePolicy(newPolicy, user.id)
      await createPolicy(supabasePolicy)

      // Refresh local context so policy is immediately available
      await refreshPolicies()

      // Also upload the document
      const uploadedFile = files.find((f) => f.id === fileId)
      if (uploadedFile?.file) {
        try {
          await uploadPolicyDocument(newPolicy.id, uploadedFile.file)
        } catch {
          // Ignore storage errors
        }
      }

      // Update file state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, awaitingResolution: false, conflict: undefined }
            : f
        )
      )

      closeConflictDialog()
      toast.success('Policy saved', {
        description: 'The policy has been saved as a separate record.',
      })
    } catch (error) {
      setConflictDialog((prev) => ({ ...prev, isLoading: false }))
      toast.error('Save failed', {
        description: error instanceof Error ? error.message : 'Failed to save policy',
      })
    }
  }

  const handleConflictTrackAmendment = async () => {
    const { fileId, conflict, newPolicy } = conflictDialog
    if (!fileId || !conflict || !newPolicy || conflict.type !== 'amendment') return

    setConflictDialog((prev) => ({ ...prev, isLoading: true }))

    try {
      const existingId = conflict.existingPolicy.id
      const result = await handlePolicyAmendment(existingId, newPolicy, conflict.changes)

      if (!result.success) {
        throw new Error(result.error || 'Failed to track amendment')
      }

      // Refresh local context so policy is immediately available
      await refreshPolicies()

      // Update file state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, awaitingResolution: false, conflict: undefined }
            : f
        )
      )

      closeConflictDialog()
      toast.success('Amendment tracked', {
        description: `Policy updated to version ${result.versionNumber}. ${result.changes.length} change(s) recorded.`,
      })
    } catch (error) {
      setConflictDialog((prev) => ({ ...prev, isLoading: false }))
      toast.error('Amendment failed', {
        description: error instanceof Error ? error.message : 'Failed to track amendment',
      })
    }
  }

  const handleConflictEdit = () => {
    const { newPolicy } = conflictDialog
    if (!newPolicy) return

    // Close the conflict dialog and navigate to policy detail with edit mode
    // For now, we'll store the policy ID and show a toast
    // The PolicyDetailView can be enhanced to support editing
    closeConflictDialog()

    toast.info('Edit Mode', {
      description: 'Editing the extracted data before saving. Navigate to the policy to make changes.',
      action: {
        label: 'View Policy',
        onClick: () => navigate(`/policy/${newPolicy.id}?edit=true`),
      },
      duration: 10000,
    })
  }

  // Show minimal loading screen when autoOpen is active but file dialog hasn't opened yet
  if (isAutoOpen && !autoOpenTriggered) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Upload className="text-white" size={32} />
          </div>
          <p className="text-gray-600">Opening file selector...</p>
          {/* Hidden file input for autoOpen mode */}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Upload Policies</h1>
            <p className="text-gray-600">Upload your insurance documents for AI analysis</p>
          </div>
        </div>

        {/* Backend Status Banner */}
        {health.status === 'unhealthy' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <ServerCrash className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className="font-semibold text-red-800">
                  {IS_PRODUCTION ? 'Service Temporarily Unavailable' : 'Backend Server Unavailable'}
                </p>
                <p className="text-sm text-red-600 mt-1">
                  {IS_PRODUCTION
                    ? 'We are experiencing technical difficulties. Please try again later.'
                    : health.error}
                </p>
                {!IS_PRODUCTION && (
                  <div className="mt-2 text-sm text-red-700 space-y-1">
                    <p>To fix this issue:</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      <li>Run <code className="bg-red-100 px-1 rounded">npm run dev:server</code> in a terminal</li>
                      <li>Ensure <code className="bg-red-100 px-1 rounded">.env</code> has <code className="bg-red-100 px-1 rounded">OPENAI_API_KEY</code> or <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code></li>
                      <li>Check the server terminal for errors</li>
                    </ol>
                  </div>
                )}

                {/* Diagnostic Results - Only show in development */}
                {!IS_PRODUCTION && health.diagnostics && (
                  <div className="mt-3 p-3 bg-red-100 rounded-lg">
                    <p className="font-medium text-red-800 text-sm mb-2">Diagnostic Results:</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        {health.diagnostics.openai.valid ? (
                          <CheckCircle2 size={14} className="text-green-600" />
                        ) : health.diagnostics.openai.configured ? (
                          <XCircle size={14} className="text-red-600" />
                        ) : (
                          <XCircle size={14} className="text-gray-400" />
                        )}
                        <span className={health.diagnostics.openai.valid ? 'text-green-700' : 'text-red-700'}>
                          OpenAI: {health.diagnostics.openai.configured
                            ? (health.diagnostics.openai.valid ? `Working (${health.diagnostics.openai.latencyMs}ms)` : health.diagnostics.openai.error)
                            : 'Not configured'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.diagnostics.anthropic.valid ? (
                          <CheckCircle2 size={14} className="text-green-600" />
                        ) : health.diagnostics.anthropic.configured ? (
                          <XCircle size={14} className="text-red-600" />
                        ) : (
                          <XCircle size={14} className="text-gray-400" />
                        )}
                        <span className={health.diagnostics.anthropic.valid ? 'text-green-700' : 'text-red-700'}>
                          Anthropic: {health.diagnostics.anthropic.configured
                            ? (health.diagnostics.anthropic.valid ? `Working (${health.diagnostics.anthropic.latencyMs}ms)` : health.diagnostics.anthropic.error)
                            : 'Not configured'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {health.diagnostics.google.valid ? (
                          <CheckCircle2 size={14} className="text-green-600" />
                        ) : health.diagnostics.google.configured ? (
                          <XCircle size={14} className="text-red-600" />
                        ) : (
                          <XCircle size={14} className="text-gray-400" />
                        )}
                        <span className={health.diagnostics.google.valid ? 'text-green-700' : 'text-gray-500'}>
                          Google OCR: {health.diagnostics.google.configured
                            ? (health.diagnostics.google.valid ? `Working (${health.diagnostics.google.latencyMs}ms)` : health.diagnostics.google.error)
                            : 'Not configured (optional)'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={checkHealth}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-100"
                  >
                    <RefreshCw size={14} className="mr-2" />
                    {IS_PRODUCTION ? 'Try Again' : 'Retry Connection'}
                  </Button>
                  {/* Only show Run Diagnostics button in development */}
                  {!IS_PRODUCTION && (
                    <Button
                      onClick={handleRunDiagnostics}
                      variant="outline"
                      size="sm"
                      disabled={isRunningDiagnostics}
                      className="text-red-600 border-red-300 hover:bg-red-100"
                    >
                      <Stethoscope size={14} className={`mr-2 ${isRunningDiagnostics ? 'animate-pulse' : ''}`} />
                      {isRunningDiagnostics ? 'Testing...' : 'Run Diagnostics'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Only show configuration errors in development - in production these should never happen */}
        {health.status === 'unconfigured' && !IS_PRODUCTION && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">Backend Proxy Not Configured</p>
                <p className="text-sm text-amber-600 mt-1">
                  Set <code className="bg-amber-100 px-1 rounded">VITE_API_PROXY_URL=http://localhost:4001</code> in your .env file
                </p>
              </div>
            </div>
          </div>
        )}
        {/* In production, show a generic service unavailable message */}
        {health.status === 'unconfigured' && IS_PRODUCTION && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={20} />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">Service Configuration Issue</p>
                <p className="text-sm text-amber-600 mt-1">
                  The AI service is not properly configured. Please contact support.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {health.status === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
              <Server size={16} className="animate-pulse" />
              <span>Checking backend server...</span>
            </div>
          )}
          {backendReady && (
            <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2">
              <Cpu size={16} />
              <span>
                AI extraction enabled
                {health.providers.openai && health.providers.anthropic
                  ? ' (OpenAI + Claude)'
                  : health.providers.openai
                    ? ' (OpenAI GPT-4)'
                    : health.providers.anthropic
                      ? ' (Claude)'
                      : ''}
              </span>
            </div>
          )}
          {!backendReady && health.status !== 'checking' && !isAIConfigured() && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <Zap size={16} />
              <span>Demo mode - upload will use sample data</span>
            </div>
          )}
          {useSupabase && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <Cloud size={16} />
              <span>Cloud storage enabled</span>
            </div>
          )}
        </div>

        {/* Upload Area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all mb-8 ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <label className="cursor-pointer flex flex-col items-center gap-4">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Upload className="text-white" size={40} />
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-900">Drop your policies here</p>
              <p className="text-gray-500 mt-1">or click to browse your files</p>
            </div>
            <div className="text-sm text-gray-400 space-y-1">
              <p>Supported: {FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}</p>
              <p>Maximum size: {FILE_CONSTRAINTS.MAX_SIZE_MB}MB per file</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>

        {/* Sample Policies Option */}
        <div className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Sparkles className="text-white" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Try with Sample Policies</h3>
                <p className="text-sm text-gray-600">See how InsurAI analyzes Turkish insurance policies</p>
              </div>
            </div>
            <Button onClick={useSamplePolicies} variant="outline">
              Use Samples
            </Button>
          </div>
        </div>

        {/* Error Summary */}
        {errorCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="text-red-600" size={20} />
                </div>
                <div>
                  <p className="font-semibold text-red-800">
                    {errorCount} file{errorCount !== 1 ? 's' : ''} failed to process
                  </p>
                  <p className="text-sm text-red-600">
                    Click retry to try again or remove the files
                  </p>
                </div>
              </div>
              <Button
                onClick={retryAllFailed}
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-100"
              >
                <RefreshCw size={16} className="mr-2" />
                Retry All
              </Button>
            </div>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-8">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Uploaded Files ({completedCount}/{files.length} analyzed)
                </h3>
                {processingCount > 0 && (
                  <p className="text-sm text-gray-500">
                    {processingCount} file{processingCount !== 1 ? 's' : ''} processing...
                  </p>
                )}
              </div>
              {completedCount > 0 && (
                <Button onClick={handleAnalyzeAll}>
                  View Analysis ({completedCount})
                </Button>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {files.map((uploadedFile) => (
                <div
                  key={uploadedFile.id}
                  className={`p-4 flex items-center gap-4 ${
                    uploadedFile.status === 'error' ? 'bg-red-50' : ''
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      uploadedFile.status === 'error'
                        ? 'bg-red-100'
                        : 'bg-gray-100'
                    }`}
                  >
                    {uploadedFile.status === 'error' ? (
                      <AlertTriangle className="text-red-600" size={24} />
                    ) : (
                      <FileText className="text-gray-600" size={24} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{getDisplayFileName(uploadedFile.file)}</p>
                    <div className="flex items-center gap-2 text-sm">
                      {uploadedFile.status === 'uploading' && (
                        <>
                          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${uploadedFile.progress}%` }}
                            />
                          </div>
                          <span className="text-gray-500">Uploading...</span>
                        </>
                      )}
                      {uploadedFile.status === 'analyzing' && (
                        <span className="text-purple-600 flex items-center gap-1">
                          <Sparkles size={14} className="animate-pulse" />
                          AI analyzing...
                        </span>
                      )}
                      {uploadedFile.status === 'complete' && uploadedFile.awaitingResolution && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle size={14} />
                          {uploadedFile.conflict?.type === 'exactDuplicate'
                            ? 'Duplicate detected - awaiting resolution'
                            : 'Amendment detected - awaiting resolution'}
                        </span>
                      )}
                      {uploadedFile.status === 'complete' && !uploadedFile.awaitingResolution && (
                        <span className="text-green-600 flex items-center gap-1">
                          <Check size={14} />
                          {uploadedFile.extractionSource === 'ai' ? (
                            <>
                              AI extracted
                              {uploadedFile.aiConfidence !== undefined && (
                                <span className="text-gray-500 ml-1">
                                  ({Math.round(uploadedFile.aiConfidence * 100)}%)
                                </span>
                              )}
                            </>
                          ) : (
                            'Demo data'
                          )}
                        </span>
                      )}
                      {uploadedFile.status === 'error' && (
                        <span className="text-red-600 flex items-center gap-1">
                          <AlertTriangle size={14} />
                          {uploadedFile.error || 'Processing failed'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadedFile.status === 'error' && (
                      <button
                        onClick={() => retryFile(uploadedFile.id)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        aria-label="Retry upload"
                        title="Retry"
                      >
                        <RefreshCw size={18} />
                      </button>
                    )}
                    {uploadedFile.awaitingResolution && uploadedFile.conflict && uploadedFile.policy && (
                      <button
                        onClick={() => {
                          // Safe to access as we checked in the condition above
                          const conflict = uploadedFile.conflict
                          const policy = uploadedFile.policy
                          if (conflict && policy) {
                            setConflictDialog({
                              isOpen: true,
                              fileId: uploadedFile.id,
                              conflict,
                              newPolicy: policy,
                              isLoading: false,
                            })
                          }
                        }}
                        className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                        aria-label="Resolve conflict"
                      >
                        Resolve
                      </button>
                    )}
                    {uploadedFile.status === 'complete' && uploadedFile.policy && !uploadedFile.awaitingResolution && (
                      <button
                        onClick={() => handleViewPolicy(uploadedFile.policy?.id ?? '')}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        aria-label="View policy details"
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => removeFile(uploadedFile.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Remove file"
                      title="Remove"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conflict Resolution Dialog */}
      {conflictDialog.isOpen && conflictDialog.conflict && conflictDialog.newPolicy && (
        <ConflictResolutionDialog
          conflict={conflictDialog.conflict}
          newPolicy={conflictDialog.newPolicy}
          onSkip={handleConflictSkip}
          onReplace={handleConflictReplace}
          onKeepBoth={handleConflictKeepBoth}
          onTrackAmendment={handleConflictTrackAmendment}
          onEdit={handleConflictEdit}
          onClose={closeConflictDialog}
          isLoading={conflictDialog.isLoading}
        />
      )}
    </div>
  )
}
