import { Upload, FileText, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'

interface UploadWidgetProps {
  compact?: boolean
  buttonText?: string
  loadingText?: string
}

export function UploadWidget({
  compact = false,
  buttonText = 'Upload your policy',
  loadingText = 'Uploading...'
}: UploadWidgetProps) {
  const navigate = useNavigate()
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
    setError(null)

    // Validate files
    const { valid, errors } = validateFiles(files)

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
        setError('No valid files selected. Please check file type and size.')
        return
      }
    }

    setIsUploading(true)

    try {
      // Simulate processing with potential failure
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // 5% chance of simulated network error for demo
          if (Math.random() < 0.05) {
            reject(new Error('Network error'))
          } else {
            resolve(true)
          }
        }, 1500)
      })

      setIsUploading(false)
      toast.success('Files uploaded successfully', {
        description: `${valid.length} policy document(s) are being analyzed.`,
      })
      // Navigate to upload page for full analysis
      navigate('/upload?autoOpen=true')
    } catch (err) {
      setIsUploading(false)
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      toast.error('Upload failed', {
        description: 'There was a problem uploading your files. Please try again.',
        action: {
          label: 'Retry',
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
      <label className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all cursor-pointer font-semibold text-lg">
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
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
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
          <p className="text-gray-600">Processing your policy...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
            <AlertCircle className="text-red-600" size={32} />
          </div>
          <div>
            <p className="font-semibold text-red-800">Upload failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <label className="cursor-pointer">
            <span className="text-sm font-medium text-blue-600 hover:text-blue-700">
              Try again
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
            <p className="font-semibold text-gray-900">Drop your policy here</p>
            <p className="text-sm text-gray-500 mt-1">or click to browse</p>
          </div>
          <p className="text-xs text-gray-400">
            {FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')} up to {FILE_CONSTRAINTS.MAX_SIZE_MB}MB
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
