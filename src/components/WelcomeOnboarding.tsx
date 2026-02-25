import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, Sparkles, BarChart3, Upload } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StaggeredList } from '@/components/animations/AnimatedComponents'
import { FILE_CONSTRAINTS } from '@/lib/errors'

interface WelcomeOnboardingProps {
  onUpload: (file: File) => void
  onSkip: () => void
  userName?: string | null
}

export function WelcomeOnboarding({ onUpload, onSkip, userName }: WelcomeOnboardingProps) {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const title = userName
    ? t.onboarding.welcomeWithName.replace('{name}', userName)
    : t.onboarding.welcomeTitle

  const steps = [
    { icon: FileUp, title: t.onboarding.step1Title, desc: t.onboarding.step1Desc },
    { icon: Sparkles, title: t.onboarding.step2Title, desc: t.onboarding.step2Desc },
    { icon: BarChart3, title: t.onboarding.step3Title, desc: t.onboarding.step3Desc },
  ]

  const validateAndUpload = (file: File) => {
    if (file.type !== 'application/pdf') {
      setError(t.onboarding.invalidFile)
      return
    }
    if (file.size > FILE_CONSTRAINTS.MAX_SIZE_BYTES) {
      setError(t.onboarding.fileTooLarge)
      return
    }
    setError(null)
    onUpload(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      validateAndUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndUpload(file)
    }
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <Card className="border-gray-100 p-6 sm:p-10">
      <StaggeredList staggerDelay={0.08}>
        {/* Welcome header */}
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600 text-base sm:text-lg">{t.onboarding.welcomeSubtitle}</p>
        </div>

        {/* How it works */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider text-center mb-4">
            {t.onboarding.howItWorks}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex flex-col items-center text-center p-4 rounded-xl bg-gray-50 border border-gray-100"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <step.icon className="h-6 w-6 text-blue-600" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{step.title}</h4>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Upload drop zone */}
        <div>
          <div
            role="button"
            tabIndex={0}
            aria-label={t.onboarding.uploadTitle}
            className={`
              relative border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer
              transition-colors duration-200
              ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowseClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleBrowseClick()
            }}
          >
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" aria-hidden="true" />
            <p className="text-base font-medium text-gray-700">{t.onboarding.uploadTitle}</p>
            <p className="text-sm text-gray-500 mt-1">{t.onboarding.uploadSubtitle}</p>
            <p className="text-xs text-gray-400 mt-2">{t.onboarding.uploadHint}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
              aria-label={t.onboarding.uploadTitle}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-600 mt-2 text-center" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/samples"
            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            {t.onboarding.exploreSamples}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-gray-500 hover:text-gray-700"
          >
            {t.onboarding.skipForNow}
          </Button>
        </div>
      </StaggeredList>
    </Card>
  )
}
