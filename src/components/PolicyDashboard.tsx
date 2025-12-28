import { useState, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Eye, Trash2, Search, Calendar, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { usePolicies, useDashboardPolicies } from '@/lib/policy-context'
import { sanitizeSearchQuery, sanitizeId } from '@/lib/sanitize'

export function PolicyDashboard() {
  const navigate = useNavigate()
  const { t, isRTL } = useI18n()
  const { deletePolicy, isLoading } = usePolicies()
  const uploadedPolicies = useDashboardPolicies()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const baseId = useId()

  // Sanitize search query for safe filtering
  const sanitizedQuery = sanitizeSearchQuery(searchQuery).toLowerCase()

  const filteredPolicies = uploadedPolicies.filter((policy) => {
    const matchesSearch =
      !sanitizedQuery ||
      policy.policyNumber.toLowerCase().includes(sanitizedQuery) ||
      policy.provider.toLowerCase().includes(sanitizedQuery) ||
      policy.type.toLowerCase().includes(sanitizedQuery)

    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: uploadedPolicies.length,
    active: uploadedPolicies.filter((p) => p.status === 'active').length,
    expiring: uploadedPolicies.filter((p) => p.status === 'expiring').length,
    totalCoverage: uploadedPolicies.reduce((sum, p) => sum + p.coverage, 0),
    totalPremium: uploadedPolicies.reduce((sum, p) => sum + p.premium, 0),
  }

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
    navigate('/upload')
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
        <section aria-label={t.a11y.policyStats} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
                <TrendingUp className="text-purple-600" size={20} aria-hidden="true" />
              </div>
              <span className="text-sm text-gray-600">{t.dashboard.totalCoverage}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalCoverage)}</p>
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
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" role="table" aria-label={t.policy.policies}>
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.policy}</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.type}</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.coverage}</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.premium}</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.expiryDate}</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-gray-600">{t.policy.status}</th>
                    <th scope="col" className="text-right px-6 py-4 text-sm font-semibold text-gray-600">
                      <span className="sr-only">{t.common.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPolicies.map((policy) => (
                    <tr key={policy.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" aria-hidden="true">{policy.logo}</span>
                          <div>
                            <p className="font-medium text-gray-900">{policy.provider}</p>
                            <p className="text-sm text-gray-500">{policy.policyNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-900">{policy.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">{formatCurrency(policy.coverage)}</span>
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
                            aria-label={`${t.common.view} ${policy.provider} ${policy.type}`}
                          >
                            <Eye size={18} aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => deletePolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus-ring"
                            aria-label={`${t.common.delete} ${policy.provider} ${policy.type}`}
                          >
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
