import { useRef, useEffect, useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileDown, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface PolicyExportMenuProps {
  isUnverified: boolean
  draftExportBlocked: () => void
  isPdfGenerating: boolean
  handleExportPdf: () => void
  handleExportCsv: () => void
  handleExportExcel: () => void
  handleExportText: () => void
}

export function PolicyExportMenu({
  isUnverified,
  draftExportBlocked,
  isPdfGenerating,
  handleExportPdf,
  handleExportCsv,
  handleExportExcel,
  handleExportText,
}: PolicyExportMenuProps) {
  const { t, locale } = useI18n()
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportMenuOpen])

  return (
    <div className="relative" ref={exportMenuRef}>
      <div
        className={isUnverified ? 'cursor-not-allowed group relative inline-block' : ''}
        title={
          isUnverified
            ? locale === 'tr'
              ? 'Dışa aktarma doğrulanmamış poliçeler için devre dışı'
              : 'Export disabled for unverified policies'
            : undefined
        }
      >
        <button
          onClick={(e) => {
            if (isUnverified) {
              e.preventDefault()
              draftExportBlocked()
              return
            }
            setExportMenuOpen((prev) => !prev)
          }}
          className={`p-2 rounded-lg transition-colors ${isUnverified ? 'opacity-50' : 'hover:bg-gray-100'}`}
          aria-label={t.exportMenu.exportAs}
          aria-expanded={exportMenuOpen}
          aria-haspopup="true"
          disabled={isUnverified}
        >
          {isPdfGenerating && !isUnverified ? (
            <Loader2 size={18} className="text-gray-600 animate-spin" />
          ) : (
            <Download size={18} className="text-gray-600" />
          )}
        </button>
      </div>
      {exportMenuOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <button
            onClick={() => {
              setExportMenuOpen(false)
              handleExportPdf()
            }}
            disabled={isPdfGenerating}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <FileText size={16} className="text-red-500 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{t.exportMenu.pdfReport}</div>
              <div className="text-xs text-gray-500 truncate">{t.exportMenu.pdfReportDesc}</div>
            </div>
          </button>
          <button
            onClick={() => {
              setExportMenuOpen(false)
              handleExportCsv()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet size={16} className="text-green-600 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{t.exportMenu.csvExport}</div>
              <div className="text-xs text-gray-500 truncate">{t.exportMenu.csvExportDesc}</div>
            </div>
          </button>
          <button
            onClick={() => {
              setExportMenuOpen(false)
              handleExportExcel()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet size={16} className="text-emerald-700 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{t.exportMenu.excelExport}</div>
              <div className="text-xs text-gray-500 truncate">{t.exportMenu.excelExportDesc}</div>
            </div>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => {
              setExportMenuOpen(false)
              handleExportText()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <FileDown size={16} className="text-gray-500 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{t.exportMenu.textSummary}</div>
              <div className="text-xs text-gray-500 truncate">{t.exportMenu.textSummaryDesc}</div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
