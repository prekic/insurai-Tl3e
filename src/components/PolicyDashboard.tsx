import { useState, useId, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Eye, Trash2, Search, Calendar, AlertTriangle, Check, LayoutGrid, List, Scale, X, Copy, Sparkles, Merge, ArrowUpDown, ArrowUp, ArrowDown, Shield, Banknote } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { usePolicies, useDashboardPolicies } from '@/lib/policy-context'
import { sanitizeSearchQuery, sanitizeId } from '@/lib/sanitize'
import { PolicyCardGrid } from './PolicyCard'
import { useCompareSelection } from '@/hooks/usePolicyComparison'
import { getShortCompanyName, getCoverageType, getMainCoverageValue, getSubjectDisplay } from '@/lib/insurance-display'
import type { DuplicatePolicy } from '@/types/policy'

// Sorting configuration
type SortField = 'provider' | 'type' | 'coverage' | 'premium' | 'expiryDate' | 'status'
type SortDirection = 'asc' | 'desc'

export function PolicyDashboard() {
  const navigate = useNavigate()
  const { t, isRTL, locale } = useI18n()
  const {
    policies: fullPolicies,
    deletePolicy,
    isLoading,
    recentlyAddedIds,
    isPolicyNew,
    duplicates,
    dismissDuplicate,
    mergeDuplicates,
  } = usePolicies()
  const uploadedPolicies = useDashboardPolicies()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [sortField, setSortField] = useState<SortField>('expiryDate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const baseId = useId()

  // Compare selection state
  const { selectedIds, togglePolicy, clearSelection, canCompare, selectionCount } = useCompareSelection()

  // Build duplicate map for quick lookup
  const duplicateMap = useMemo(() => {
    const map = new Map<string, DuplicatePolicy>()
    for (const dup of duplicates) {
      map.set(dup.policy.id, dup)
    }
    return map
  }, [duplicates])

  // Get new policy IDs that are also in filtered results
  const newPolicyIds = useMemo(() => {
    const filteredIds = new Set(fullPolicies.map(p => p.id))
    const newIds = new Set<string>()
    for (const id of recentlyAddedIds) {
      if (filteredIds.has(id)) {
        newIds.add(id)
      }
    }
    // Also check by timestamp for policies loaded from storage
    for (const policy of fullPolicies) {
      if (isPolicyNew(policy)) {
        newIds.add(policy.id)
      }
    }
    return newIds
  }, [recentlyAddedIds, fullPolicies, isPolicyNew])

  // Handle merging duplicates
  const handleMergeDuplicates = async (keepId: string, deleteId: string) => {
    await mergeDuplicates(keepId, [deleteId])
  }

  // Navigate to compare page with selected policies
  const handleCompare = () => {
    if (canCompare) {
      navigate(`/compare?ids=${selectedIds.join(',')}`)
    }
  }

  // Sanitize search query for safe filtering
  const sanitizedQuery = sanitizeSearchQuery(searchQuery).toLowerCase()

  // Sorting function
  const sortPolicies = <T extends { provider: string; type: string; coverage: number; premium: number; expiryDate: string; status: string }>(policies: T[]): T[] => {
    return [...policies].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'provider':
          comparison = getShortCompanyName(a.provider).localeCompare(getShortCompanyName(b.provider))
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
        case 'coverage':
          comparison = a.coverage - b.coverage
          break
        case 'premium':
          comparison = a.premium - b.premium
          break
        case 'expiryDate':
          comparison = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
          break
        case 'status':
          const statusOrder = { active: 0, expiring: 1, expired: 2, pending: 3 }
          comparison = (statusOrder[a.status as keyof typeof statusOrder] || 4) - (statusOrder[b.status as keyof typeof statusOrder] || 4)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }

  // Toggle sort direction or change field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Get sort icon for column header
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-400" />
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />
  }

  // Filter for table view (dashboard format)
  const filteredPolicies = sortPolicies(uploadedPolicies.filter((policy) => {
    const matchesSearch =
      !sanitizedQuery ||
      policy.policyNumber.toLowerCase().includes(sanitizedQuery) ||
      policy.provider.toLowerCase().includes(sanitizedQuery) ||
      getShortCompanyName(policy.provider).toLowerCase().includes(sanitizedQuery) ||
      policy.type.toLowerCase().includes(sanitizedQuery)

    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter

    return matchesSearch && matchesStatus
  }))

  // Filter full policies for card view (includes all data for evaluation)
  const filteredFullPolicies = sortPolicies(fullPolicies.filter((policy) => {
    const matchesSearch =
      !sanitizedQuery ||
      policy.policyNumber.toLowerCase().includes(sanitizedQuery) ||
      policy.provider.toLowerCase().includes(sanitizedQuery) ||
      getShortCompanyName(policy.provider).toLowerCase().includes(sanitizedQuery) ||
      policy.type.toLowerCase().includes(sanitizedQuery) ||
      policy.typeTr.toLowerCase().includes(sanitizedQuery)

    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter

    return matchesSearch && matchesStatus
  }))

  // Compute stats with separate sum insured and limit totals
  const stats = useMemo(() => {
    let totalSumInsured = 0
    let totalLimit = 0

    for (const p of fullPolicies) {
      const coverageType = getCoverageType(p.type)
      const value = getMainCoverageValue(p)
      if (coverageType === 'limit') {
        totalLimit += value
      } else {
        totalSumInsured += value
      }
    }

    return {
      total: uploadedPolicies.length,
      active: uploadedPolicies.filter((p) => p.status === 'active').length,
      expiring: uploadedPolicies.filter((p) => p.status === 'expiring').length,
      totalSumInsured,
      totalLimit,
      totalPremium: uploadedPolicies.reduce((sum, p) => sum + p.premium, 0),
    }
  }, [uploadedPolicies, fullPolicies])

  // Status badge - icon only on mobile, full text on desktop
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="success" className="px-1.5 sm:px-2">
            <Check size={12} aria-hidden="true" />
            <span className="hidden sm:inline ml-1">{t.dashboard.active}</span>
          </Badge>
        )
      case 'expiring':
        return (
          <Badge variant="warning" className="px-1.5 sm:px-2">
            <AlertTriangle size={12} aria-hidden="true" />
            <span className="hidden sm:inline ml-1">{locale === 'tr' ? 'Yaklaşan' : 'Expiring'}</span>
          </Badge>
        )
      case 'expired':
        return (
          <Badge variant="destructive" className="px-1.5 sm:px-2">
            <X size={12} aria-hidden="true" className="sm:hidden" />
            <span className="hidden sm:inline">{t.dashboard.expired}</span>
          </Badge>
        )
      default:
        return <Badge className="px-1.5 sm:px-2">{status}</Badge>
    }
  }

  const handleViewPolicy = (id: string) => {
    const safeId = sanitizeId(id)
    if (safeId) {
      navigate(`/policy/${safeId}`)
    }
  }

  const handleUploadPolicy = () => {
    navigate('/upload?autoOpen=true')
  }

  // Show loading state while hydrating from localStorage
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <div className="h-9 w-48 bg-gray-200 rounded-lg animate-pulse mb-2" />
              <div className="h-5 w-64 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-gray-200 rounded-xl animate-pulse" />
          </div>
          {/* Stats skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse" />
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* Table skeleton */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 w-full max-w-[100vw] overflow-x-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t.dashboard.title}</h1>
            <p className="text-gray-600">{t.dashboard.subtitle}</p>
          </div>
          <Button onClick={handleUploadPolicy} className="gap-2">
            <Plus size={18} aria-hidden="true" />
            {t.upload.uploadPolicy}
          </Button>
        </div>

        {/* Stats Cards - Horizontally scrollable on mobile */}
        <section aria-label={t.a11y.policyStats} className="mb-8 -mx-4 sm:mx-0">
          <div className="flex sm:grid sm:grid-cols-5 gap-3 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 px-4 sm:px-0 snap-x snap-mandatory">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[140px] sm:w-auto snap-start">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <FileText className="text-blue-600" size={16} aria-hidden="true" />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t.dashboard.totalPolicies}</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-[10px] text-gray-500 sm:hidden">{locale === 'tr' ? 'Toplam' : 'Total'}</p>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[140px] sm:w-auto snap-start">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Check className="text-green-600" size={16} aria-hidden="true" />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t.dashboard.active}</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-[10px] text-gray-500 sm:hidden">{locale === 'tr' ? 'Aktif' : 'Active'}</p>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[140px] sm:w-auto snap-start">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Shield className="text-purple-600" size={16} aria-hidden="true" />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t.policy.totalSumInsured}</span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                <span className="sm:hidden">{formatCurrencyCompact(stats.totalSumInsured)}</span>
                <span className="hidden sm:inline">{formatCurrency(stats.totalSumInsured)}</span>
              </p>
              <p className="text-[10px] text-gray-500 sm:hidden">{locale === 'tr' ? 'Bedel' : 'Sum'}</p>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[140px] sm:w-auto snap-start">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Banknote className="text-indigo-600" size={16} aria-hidden="true" />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t.policy.totalLimit}</span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                <span className="sm:hidden">{formatCurrencyCompact(stats.totalLimit)}</span>
                <span className="hidden sm:inline">{formatCurrency(stats.totalLimit)}</span>
              </p>
              <p className="text-[10px] text-gray-500 sm:hidden">{locale === 'tr' ? 'Limit' : 'Limit'}</p>
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100 shadow-sm flex-shrink-0 w-[140px] sm:w-auto snap-start">
              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-100 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Calendar className="text-amber-600" size={16} aria-hidden="true" />
                </div>
                <span className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t.dashboard.expiringSoon}</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.expiring}</p>
              <p className="text-[10px] text-gray-500 sm:hidden">{locale === 'tr' ? 'Yaklaşan' : 'Expiring'}</p>
            </div>
          </div>
        </section>

        {/* Compare Selection Bar */}
        {selectionCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                {selectionCount} {selectionCount === 1 ? 'policy' : 'policies'} selected
              </span>
              {selectionCount < 2 && (
                <span className="text-sm text-blue-700">(select at least 2 to compare)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                className="gap-1"
              >
                <X className="w-4 h-4" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={!canCompare}
                className="gap-1"
              >
                <Scale className="w-4 h-4" />
                Compare
              </Button>
            </div>
          </div>
        )}

        {/* Duplicate Policies Warning Banner */}
        {duplicates.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Copy className="text-amber-600" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-1">
                  {locale === 'tr' ? 'Kopya Poli\xe7eler Tespit Edildi' : 'Duplicate Policies Detected'}
                </h3>
                <p className="text-sm text-amber-700 mb-3">
                  {locale === 'tr'
                    ? `${duplicates.length} adet kopya veya \xe7ok benzer poli\xe7e bulundu. Envanter temizli\u011fi i\xe7in birle\u015ftirmeyi veya silmeyi d\xfc\u015f\xfcn\xfcn.`
                    : `Found ${duplicates.length} duplicate or very similar ${duplicates.length === 1 ? 'policy' : 'policies'}. Consider merging or removing to maintain a clean inventory.`}
                </p>
                <div className="space-y-2">
                  {duplicates.slice(0, 3).map((dup) => (
                    <div key={dup.policy.id} className="flex items-center justify-between bg-white/60 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{dup.policy.logo}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{dup.policy.provider}</p>
                          <p className="text-xs text-gray-500">
                            {dup.similarity === 'exact'
                              ? (locale === 'tr' ? 'Birebir kopya' : 'Exact duplicate')
                              : dup.similarity === 'high'
                              ? (locale === 'tr' ? '\xc7ok benzer' : 'Very similar')
                              : (locale === 'tr' ? 'Muhtemel kopya' : 'Possibly duplicate')}
                            {' '}&bull;{' '}
                            {locale === 'tr' ? 'Eslesen alanlar: ' : 'Matched: '}
                            {dup.matchedFields.slice(0, 3).join(', ')}
                            {dup.matchedFields.length > 3 && ` +${dup.matchedFields.length - 3}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMergeDuplicates(dup.duplicateOf.id, dup.policy.id)}
                          className="text-amber-700 hover:bg-amber-100 gap-1 h-7 px-2"
                          title={locale === 'tr' ? 'Kopyay\u0131 sil' : 'Remove duplicate'}
                        >
                          <Merge className="w-3.5 h-3.5" />
                          <span className="text-xs">{locale === 'tr' ? 'Birle\u015ftir' : 'Merge'}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissDuplicate(dup.policy.id)}
                          className="text-gray-500 hover:bg-gray-100 h-7 px-2"
                          title={locale === 'tr' ? 'Yoksay' : 'Dismiss'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {duplicates.length > 3 && (
                    <p className="text-xs text-amber-600 text-center pt-1">
                      {locale === 'tr'
                        ? `+${duplicates.length - 3} daha fazla kopya poli\xe7e`
                        : `+${duplicates.length - 3} more duplicate ${duplicates.length - 3 === 1 ? 'policy' : 'policies'}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 mb-6" role="search">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
              <label htmlFor={`${baseId}-search`} className="sr-only">{t.dashboard.searchPolicies}</label>
              <input
                id={`${baseId}-search`}
                type="text"
                placeholder={locale === 'tr' ? 'Ara...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
              <fieldset className="flex gap-1 sm:gap-2 overflow-x-auto">
                <legend className="sr-only">{t.dashboard.filterByStatus}</legend>
                {[
                  { key: 'all', label: t.common.all, mobileLabel: locale === 'tr' ? 'Tümü' : 'All' },
                  { key: 'active', label: t.dashboard.active, mobileLabel: locale === 'tr' ? 'Aktif' : 'Active' },
                  { key: 'expiring', label: t.dashboard.expiringSoon, mobileLabel: locale === 'tr' ? 'Yaklaşan' : 'Expiring' },
                  { key: 'expired', label: t.dashboard.expired, mobileLabel: locale === 'tr' ? 'Süresi Dolmuş' : 'Expired' },
                ].map(({ key, label, mobileLabel }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={statusFilter === key}
                    className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all focus-ring whitespace-nowrap ${
                      statusFilter === key
                        ? 'bg-slate-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className="sm:hidden">{mobileLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </fieldset>

              {/* View Toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                  aria-label="Table view"
                  className={`p-1.5 sm:p-2 transition-colors ${
                    viewMode === 'table'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <List size={16} className="sm:hidden" />
                  <List size={18} className="hidden sm:block" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  aria-label="Card view"
                  className={`p-1.5 sm:p-2 transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LayoutGrid size={16} className="sm:hidden" />
                  <LayoutGrid size={18} className="hidden sm:block" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Policy List */}
        {filteredPolicies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 sm:p-12 text-center" role="status">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="text-gray-400" size={32} aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.dashboard.noPoliciesFound}</h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? t.dashboard.adjustFilters
                : t.dashboard.uploadFirstPolicy}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={handleUploadPolicy} className="gap-2">
                <Plus size={18} aria-hidden="true" />
                {t.upload.uploadPolicy}
              </Button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          /* Card View */
          <>
            <PolicyCardGrid
              policies={filteredFullPolicies}
              onView={handleViewPolicy}
              onDelete={deletePolicy}
              onSelect={togglePolicy}
              selectedIds={selectedIds}
              showEvaluation
              newPolicyIds={newPolicyIds}
              duplicateMap={duplicateMap}
            />
            {/* Screen reader summary */}
            <div className="sr-only" role="status" aria-live="polite">
              {t.dashboard.showingPolicies
                .replace('{shown}', String(filteredFullPolicies.length))
                .replace('{total}', String(fullPolicies.length))}
            </div>
          </>
        ) : (
          /* Table View - Mobile responsive with hidden columns on small screens */
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" role="table" aria-label={t.policy.policies}>
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('provider')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.policy}
                        {getSortIcon('provider')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600 hidden md:table-cell">
                      <button
                        onClick={() => handleSort('type')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.type}
                        {getSortIcon('type')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600 hidden lg:table-cell">
                      {t.policy.insured}
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('coverage')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        <span className="hidden sm:inline">{t.policy.sumInsuredLimit}</span>
                        <span className="sm:hidden">{locale === 'tr' ? 'Bedel' : 'Value'}</span>
                        {getSortIcon('coverage')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600 hidden sm:table-cell">
                      <button
                        onClick={() => handleSort('premium')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.premium}
                        {getSortIcon('premium')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600 hidden md:table-cell">
                      <button
                        onClick={() => handleSort('expiryDate')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.expiryDate}
                        {getSortIcon('expiryDate')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 sm:gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.status}
                        {getSortIcon('status')}
                      </button>
                    </th>
                    <th scope="col" className="text-right px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-gray-600">
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPolicies.map((policy) => {
                    const isNew = newPolicyIds.has(policy.id)
                    const isDuplicate = duplicateMap.has(policy.id)
                    const shortName = getShortCompanyName(policy.provider)
                    // Get full policy data for subject display
                    const fullPolicy = fullPolicies.find(p => p.id === policy.id)
                    const subjectInfo = fullPolicy ? getSubjectDisplay(fullPolicy, locale as 'en' | 'tr') : null
                    const coverageType = fullPolicy ? getCoverageType(fullPolicy.type) : 'sumInsured'
                    const displayValue = fullPolicy ? getMainCoverageValue(fullPolicy) : policy.coverage
                    return (
                    <tr
                      key={policy.id}
                      onClick={() => handleViewPolicy(policy.id)}
                      className={`transition-colors cursor-pointer ${
                        isNew ? 'bg-green-50/50 hover:bg-green-50' :
                        isDuplicate ? 'bg-amber-50/50 hover:bg-amber-50' :
                        'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-xl sm:text-2xl" aria-hidden="true">{policy.logo}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{shortName}</p>
                              {isNew && (
                                <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold bg-green-500 text-white rounded-full whitespace-nowrap">
                                  <Sparkles className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                  {locale === 'tr' ? 'Yeni' : 'New'}
                                </span>
                              )}
                              {isDuplicate && (
                                <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold bg-amber-500 text-white rounded-full whitespace-nowrap">
                                  <Copy className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                  {locale === 'tr' ? 'Kopya' : 'Dup'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 truncate">{policy.policyNumber}</p>
                            {/* Show type on mobile below policy name */}
                            <p className="text-xs text-gray-400 md:hidden">{policy.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell">
                        <span className="text-gray-900 text-sm">{policy.type}</span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell">
                        {subjectInfo ? (
                          <div>
                            <p className="text-xs text-gray-500">{subjectInfo.label}</p>
                            <p className="text-sm text-gray-900 truncate max-w-[150px]" title={subjectInfo.value}>{subjectInfo.value}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div>
                          <p className="font-medium text-gray-900 text-sm sm:text-base">
                            <span className="sm:hidden">{formatCurrencyCompact(displayValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(displayValue)}</span>
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500">
                            {coverageType === 'limit' ? (locale === 'tr' ? 'Limit' : 'Limit') : (locale === 'tr' ? 'Bedel' : 'Sum')}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                        <span className="text-gray-900 text-sm">{formatCurrency(policy.premium)}<span className="text-gray-500">/yr</span></span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell">
                        <span className="text-gray-900 text-sm">{formatDate(policy.expiryDate)}</span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        {getStatusBadge(policy.status)}
                      </td>
                      <td className="px-2 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                          {/* View button hidden on mobile since row is clickable */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewPolicy(policy.id) }}
                            className="hidden sm:block p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus-ring"
                            aria-label={`${t.common.view} ${shortName} ${policy.type}`}
                          >
                            <Eye size={18} aria-hidden="true" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePolicy(policy.id) }}
                            className="p-1.5 sm:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus-ring"
                            aria-label={`${t.common.delete} ${shortName} ${policy.type}`}
                          >
                            <Trash2 size={14} className="sm:hidden" aria-hidden="true" />
                            <Trash2 size={18} className="hidden sm:block" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {/* Screen reader summary */}
            <div className="sr-only" role="status" aria-live="polite">
              {t.dashboard.showingPolicies
                .replace('{shown}', String(filteredPolicies.length))
                .replace('{total}', String(uploadedPolicies.length))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
