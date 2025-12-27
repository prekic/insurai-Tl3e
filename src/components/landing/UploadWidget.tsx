import { Upload, FileText } from 'lucide-react'
import { useCallback, useState } from 'react'

type Policy = {
  id: string
  name: string
  provider: string
  type: string
  premium: number
  coverage: number
  deductible: number
  uploadedAt: Date
}

interface UploadWidgetProps {
  onPoliciesUploaded: (policies: Policy[]) => void
  compact?: boolean
}

export function UploadWidget({ onPoliciesUploaded, compact = false }: UploadWidgetProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFiles(files)
    }
  }, [])

  const handleFiles = async (files: File[]) => {
    setIsUploading(true)

    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500))

    const mockPolicies: Policy[] = files.map((file, index) => ({
      id: `policy-${Date.now()}-${index}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      provider: ['Allianz', 'AXA', 'Anadolu Sigorta', 'Mapfre'][Math.floor(Math.random() * 4)],
      type: ['Kasko', 'Trafik', 'Konut', 'Sağlık'][Math.floor(Math.random() * 4)],
      premium: Math.floor(Math.random() * 5000) + 1000,
      coverage: Math.floor(Math.random() * 500000) + 100000,
      deductible: Math.floor(Math.random() * 5000) + 500,
      uploadedAt: new Date(),
    }))

    setIsUploading(false)
    onPoliciesUploaded(mockPolicies)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  if (compact) {
    return (
      <label className="group inline-flex items-center justify-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all cursor-pointer font-medium">
        <Upload size={18} />
        <span>Upload your policy</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileSelect}
          className="hidden"
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
        isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      {isUploading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">Processing your policy...</p>
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
          <p className="text-xs text-gray-400">PDF, Word, or images up to 10MB</p>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
