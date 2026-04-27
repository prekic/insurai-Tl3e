import { Upload, FileText, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { useAuth } from '@/lib/supabase/auth-context'
import { useTranslation } from '@/lib/i18n/i18n-context'

interface UploadWidgetProps {
  compact?: boolean
  buttonText?: string
  loadingText?: string
}

export function UploadWidget({
  compact = false,
  buttonText = 'Upload your policy',
  loadingText = 'Uploading...',
}: UploadWidgetProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setError(null)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  const handleFiles = async (files: File[]) => {
    // Diagnostic instrumentation — gated behind VITE_DEBUG_LOGS to keep production silent.
    // When enabled (set in Railway env or .env), every gate on the upload path emits a
    // [UploadWidget] line so we can identify exactly where uploads silently bail
    // (e.g. the Erdemir multi-vehicle KASKO PDF case from findings F1).
    const debug = import.meta.env.VITE_DEBUG_LOGS === 'true'
    if (debug) {
      console.warn('[UploadWidget] handleFiles entered', {
        fileCount: files.length,
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      })
    }

    setError(null)

    // Validate files
    const { valid, errors } = validateFiles(files)

    if (debug) {
      console.warn('[UploadWidget] validateFiles result', {
        validCount: valid.length,
        errorCount: errors.length,
        errorCodes: errors.map((e) => e.code),
        errorDetails: errors.map((e) => e.details),
      })
    }

    // Show error messages for invalid files
    if (errors.length > 0) {
      errors.forEach((err) => {
        const errorInfo = getErrorMessage(err.code)
        toast.error(errorInfo.title, {
          description: err.details || errorInfo.description,
          duration: 5000,
        })
      })

      // If no valid files, show inline error and return
      if (valid.length === 0) {
        if (debug) {
          console.warn('[UploadWidget] bailing — no valid files after validation')
        }
        setError(t.landing.uploadNoValidFiles)
        return
      }
    }

    setIsUploading(true)
    if (debug) console.warn('[UploadWidget] isUploading=true, starting 500ms UX delay')

    try {
      // Brief delay for UX feedback
      await new Promise((resolve) => setTimeout(resolve, 500))

      setIsUploading(false)
      if (debug) {
        console.warn('[UploadWidget] navigate firing', {
          target: user ? '/upload?autoOpen=true' : '/try',
          fileName: valid[0]?.name,
          isAuthenticated: !!user,
        })
      }
      // Navigate to appropriate page with file data
      // For anonymous users, pass file via router state to TryAnalysis
      // For logged-in users, pass to PolicyUpload
      if (user) {
        navigate('/upload?autoOpen=true', { state: { files: valid } })
      } else {
        // Pass file to TryAnalysis - it will handle the analysis
        navigate('/try', { state: { file: valid[0] } })
      }
      if (debug) console.warn('[UploadWidget] navigate returned (post-call)')
    } catch (err) {
      if (debug) {
        console.warn('[UploadWidget] caught exception in try block', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
      }
      setIsUploading(false)
      const message = err instanceof Error ? err.message : t.landing.uploadFailed
      setError(message)
      toast.error(t.landing.uploadFailed, {
        description: t.landing.uploadFailedDesc,
        action: {
          label: t.common.retry,
          onClick: () => handleFiles(valid),
        },
      })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleFiles(files)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  if (compact) {
    return (
      <label className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 transition-all cursor-pointer font-semibold text-lg">
        {isUploading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>{loadingText}</span>
          </>
        ) : (
          <>
            <Upload size={20} />
            <span>{buttonText}</span>
          </>
        )}
        <input
          type="file"
          accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
      </label>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
        error
          ? 'border-red-300 bg-red-50'
          : isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      {isUploading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">{t.landing.uploadProcessing}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
            <AlertCircle className="text-red-600" size={32} />
          </div>
          <div>
            <p className="font-semibold text-red-800">{t.landing.uploadFailed}</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <label className="cursor-pointer">
            <span className="text-sm font-medium text-blue-600 hover:text-blue-700">
              {t.landing.uploadTryAgain}
            </span>
            <input
              type="file"
              accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <label className="cursor-pointer flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
            <FileText className="text-blue-600" size={32} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{t.landing.uploadDropHere}</p>
            <p className="text-sm text-gray-500 mt-1">{t.landing.uploadOrClick}</p>
          </div>
          <p className="text-xs text-gray-500">
            {FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}{' '}
            {t.landing.uploadMaxSize.replace('{size}', String(FILE_CONSTRAINTS.MAX_SIZE_MB))}
          </p>
          <input
            type="file"
            accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
