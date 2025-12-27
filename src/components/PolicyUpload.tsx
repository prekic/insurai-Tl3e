import { useState, useCallback } from 'react'
import { Upload, FileText, Check, ArrowLeft, X, Eye, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { AnalyzedPolicy } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'

interface PolicyUploadProps {
  onPoliciesAnalyzed: (policies: AnalyzedPolicy[]) => void
  onBack: () => void
  onViewPolicyDetail: (id: string) => void
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'complete'

interface UploadedFile {
  id: string
  file: File
  status: UploadState
  progress: number
  policy?: AnalyzedPolicy
}

export function PolicyUpload({ onPoliciesAnalyzed, onBack, onViewPolicyDetail }: PolicyUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }, [])

  const addFiles = async (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map((file) => ({
      id: `file-${Date.now()}-${Math.random()}`,
      file,
      status: 'uploading' as UploadState,
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...uploadedFiles])

    // Simulate upload and analysis for each file
    for (const uploadedFile of uploadedFiles) {
      await simulateUploadAndAnalysis(uploadedFile.id)
    }
  }

  const simulateUploadAndAnalysis = async (fileId: string) => {
    // Simulate upload progress
    for (let i = 0; i <= 100; i += 20) {
      await new Promise((resolve) => setTimeout(resolve, 200))
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

    // Simulate AI analysis
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Complete with a sample policy
    const randomPolicy = samplePolicies[Math.floor(Math.random() * samplePolicies.length)]
    const newPolicy: AnalyzedPolicy = {
      ...randomPolicy,
      id: `policy-${Date.now()}`,
    }

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status: 'complete', policy: newPolicy } : f
      )
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles)
    }
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const handleAnalyzeAll = () => {
    const analyzedPolicies = files
      .filter((f) => f.status === 'complete' && f.policy)
      .map((f) => f.policy!)
    onPoliciesAnalyzed(analyzedPolicies)
  }

  const useSamplePolicies = () => {
    onPoliciesAnalyzed(samplePolicies)
  }

  const completedCount = files.filter((f) => f.status === 'complete').length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Upload Policies</h1>
            <p className="text-gray-600">Upload your insurance documents for AI analysis</p>
          </div>
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
            <p className="text-sm text-gray-400">PDF, Word, or images up to 10MB each</p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
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

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-8">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Uploaded Files ({completedCount}/{files.length} analyzed)
              </h3>
              {completedCount > 0 && (
                <Button onClick={handleAnalyzeAll}>
                  View Analysis ({completedCount})
                </Button>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {files.map((uploadedFile) => (
                <div key={uploadedFile.id} className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                    <FileText className="text-gray-600" size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{uploadedFile.file.name}</p>
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
                          Analysis complete
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadedFile.status === 'complete' && uploadedFile.policy && (
                      <button
                        onClick={() => onViewPolicyDetail(uploadedFile.policy!.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Eye size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => removeFile(uploadedFile.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
