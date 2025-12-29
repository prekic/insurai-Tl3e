import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Check, ArrowLeft, X, Eye, Sparkles, AlertTriangle, RefreshCw, Cloud, Cpu, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import { usePolicies } from '@/lib/policy-context'
import { validateFiles, ERROR_CODES, getErrorMessage, createAppError, FILE_CONSTRAINTS } from '@/lib/errors'
import { sanitizeFileName, sanitizeId } from '@/lib/sanitize'
import { useAuth } from '@/lib/supabase/auth-context'
import { isSupabaseConfigured, uploadPolicyDocument } from '@/lib/supabase'
import { extractPolicyFromDocument, isAIConfigured } from '@/lib/ai'

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
}

export function PolicyUpload() {
  const navigate = useNavigate()
  const { addPolicies } = usePolicies()
  const { user, isConfigured: authConfigured } = useAuth()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const useSupabase = authConfigured && isSupabaseConfigured() && !!user

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
    try {
      // Update to uploading state with progress
      for (let i = 0; i <= 100; i += 25) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: i } : f
          )
        )
      }

      // Switch to analyzing state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: 'analyzing', progress: 100 } : f
        )
      )

      // Use real AI extraction
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      if (!result.success) {
        throw new Error(result.error.message)
      }

      const { policy, source, extractedData } = result

      // If using Supabase, upload the document to storage
      if (useSupabase) {
        try {
          await uploadPolicyDocument(policy.id, file)
        } catch (uploadError) {
          console.warn('Failed to upload document to storage:', uploadError)
          // Don't fail the whole process if storage upload fails
        }
      }

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
      const storageNote = useSupabase ? ' (saved to cloud)' : ''
      const aiNote = source === 'ai'
        ? ` (${Math.round(extractedData.confidence.overall * 100)}% confidence)`
        : ' (demo mode)'

      toast.success('Analysis complete', {
        description: `${displayName} has been analyzed${aiNote}${storageNote}.`,
      })
    } catch (error) {
      const appError = createAppError(error, ERROR_CODES.AI_ANALYSIS_FAILED)
      const errorInfo = getErrorMessage(appError.code)

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: 'error', error: errorInfo.description }
            : f
        )
      )

      toast.error(errorInfo.title, {
        description: errorInfo.description,
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
      .filter((f): f is UploadedFile & { policy: AnalyzedPolicy } => f.status === 'complete' && f.policy !== undefined)
      .map((f) => f.policy)

    if (analyzedPolicies.length === 0) {
      toast.error('No policies to analyze', {
        description: 'Please wait for at least one policy to complete processing.',
      })
      return
    }

    addPolicies(analyzedPolicies)
    navigate('/dashboard')
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
      navigate(`/policy/${safeId}`)
    }
  }

  // Safely get display name for file
  const getDisplayFileName = (file: File): string => {
    return sanitizeFileName(file.name)
  }

  const completedCount = files.filter((f) => f.status === 'complete').length
  const errorCount = files.filter((f) => f.status === 'error').length
  const processingCount = files.filter((f) => f.status === 'uploading' || f.status === 'analyzing').length

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

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {isAIConfigured() ? (
            <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2">
              <Cpu size={16} />
              <span>AI extraction enabled - documents will be analyzed using GPT-4</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <Zap size={16} />
              <span>Demo mode - using sample data (configure VITE_OPENAI_API_KEY for real AI)</span>
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
                      {uploadedFile.status === 'complete' && (
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
                    {uploadedFile.status === 'complete' && uploadedFile.policy && (
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
    </div>
  )
}
