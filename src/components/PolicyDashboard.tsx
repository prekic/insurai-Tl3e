import { useState, useId, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Eye, Trash2, Search, Calendar, AlertTriangle, Check, LayoutGrid, List, Scale, X, Copy, Sparkles, Merge, ArrowUpDown, ArrowUp, ArrowDown, Shield, Banknote } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success"><Check size={12} className="mr-1" aria-hidden="true" /> {t.dashboard.active}</Badge>
      case 'expiring':
        return <Badge variant="warning"><AlertTriangle size={12} className="mr-1" aria-hidden="true" /> {t.dashboard.expiringSoon}</Badge>
      case 'expired':
        return <Badge variant="destructive">{t.dashboard.expired}</Badge>
      default:
        return <Badge>{status}</Badge>
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
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Stats Cards */}
        <section aria-label={t.a11y.policyStats} className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="text-blue-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.dashboard.totalPolicies}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900" aria-label={`${stats.total} ${t.dashboard.totalPolicies.toLowerCase()}`}>{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Check className="text-green-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.dashboard.active}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900" aria-label={`${stats.active} ${t.dashboard.active.toLowerCase()}`}>{stats.active}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Shield className="text-purple-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.policy.totalSumInsured}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalSumInsured)}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Banknote className="text-indigo-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.policy.totalLimit}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalLimit)}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-amber-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.dashboard.expiringSoon}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900" aria-label={`${stats.expiring} ${t.dashboard.expiringSoon.toLowerCase()}`}>{stats.expiring}</p>
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
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6" role="search">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
              <label htmlFor={`${baseId}-search`} className="sr-only">{t.dashboard.searchPolicies}</label>
              <input
                id={`${baseId}-search`}
                type="text"
                placeholder={t.dashboard.searchPolicies}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-4">
              <fieldset className="flex gap-2">
                <legend className="sr-only">{t.dashboard.filterByStatus}</legend>
                {[
                  { key: 'all', label: t.common.all },
                  { key: 'active', label: t.dashboard.active },
                  { key: 'expiring', label: t.dashboard.expiringSoon },
                  { key: 'expired', label: t.dashboard.expired },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={statusFilter === key}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all focus-ring ${
                      statusFilter === key
                        ? 'bg-slate-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>

              {/* View Toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                  aria-label="Table view"
                  className={`p-2 transition-colors ${
                    viewMode === 'table'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <List size={18} />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  aria-label="Card view"
                  className={`p-2 transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LayoutGrid size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Policy List */}
        {filteredPolicies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center" role="status">
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
          /* Table View */
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" role="table" aria-label={t.policy.policies}>
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('provider')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.policy}
                        {getSortIcon('provider')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('type')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.type}
                        {getSortIcon('type')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      {t.policy.insured}
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('coverage')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.sumInsuredLimit}
                        {getSortIcon('coverage')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('premium')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.premium}
                        {getSortIcon('premium')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('expiryDate')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.expiryDate}
                        {getSortIcon('expiryDate')}
                      </button>
                    </th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                      >
                        {t.policy.status}
                        {getSortIcon('status')}
                      </button>
                    </th>
                    <th scope="col" className="text-right px-6 py-4 text-sm font-semibold text-gray-600">
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
                      className={`transition-colors ${
                        isNew ? 'bg-green-50/50 hover:bg-green-50' :
                        isDuplicate ? 'bg-amber-50/50 hover:bg-amber-50' :
                        'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">{policy.logo}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{shortName}</p>
                              {isNew && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-green-500 text-white rounded-full">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {locale === 'tr' ? 'Yeni' : 'New'}
                                </span>
                              )}
                              {isDuplicate && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500 text-white rounded-full">
                                  <Copy className="w-2.5 h-2.5" />
                                  {locale === 'tr' ? 'Kopya' : 'Duplicate'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{policy.policyNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900">{policy.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        {subjectInfo ? (
                          <div>
                            <p className="text-xs text-gray-500">{subjectInfo.label}</p>
                            <p className="text-sm text-gray-900 truncate max-w-[150px]" title={subjectInfo.value}>{subjectInfo.value}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{formatCurrency(displayValue)}</p>
                          <p className="text-xs text-gray-500">
                            {coverageType === 'limit' ? (locale === 'tr' ? 'Limit' : 'Limit') : (locale === 'tr' ? 'Bedel' : 'Sum Insured')}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900">{formatCurrency(policy.premium)}/yr</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900">{formatDate(policy.expiryDate)}</span>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(policy.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleViewPolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus-ring"
                            aria-label={`${t.common.view} ${shortName} ${policy.type}`}
                          >
                            <Eye size={18} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => deletePolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus-ring"
                            aria-label={`${t.common.delete} ${shortName} ${policy.type}`}
                          >
                            <Trash2 size={18} aria-hidden="true" />
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
