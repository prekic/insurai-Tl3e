import { useState } from 'react'
import { FileText, Plus, Eye, Edit, Trash2, Search, Calendar, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'

interface DashboardPolicy {
  id: string
  policyNumber: string
  provider: string
  logo: string
  type: string
  coverage: number
  premium: number
  deductible: number
  startDate: string
  expiryDate: string
  status: 'active' | 'expiring' | 'expired' | 'pending'
  uploadDate: string
  documentType: string
  insuredPerson?: string
  location?: string
}

interface PolicyDashboardProps {
  uploadedPolicies: DashboardPolicy[]
  onUploadPolicy: () => void
  onViewPolicy: (id: string) => void
  onEditPolicy: (id: string) => void
  onDeletePolicy: (id: string) => void
  onBack: () => void
}

export function PolicyDashboard({
  uploadedPolicies,
  onUploadPolicy,
  onViewPolicy,
  onEditPolicy,
  onDeletePolicy,
}: PolicyDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredPolicies = uploadedPolicies.filter((policy) => {
    const matchesSearch =
      policy.policyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      policy.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      policy.type.toLowerCase().includes(searchQuery.toLowerCase())

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
        return <Badge variant="success"><Check size={12} className="mr-1" /> Active</Badge>
      case 'expiring':
        return <Badge variant="warning"><AlertTriangle size={12} className="mr-1" /> Expiring</Badge>
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Policy Dashboard</h1>
            <p className="text-gray-600">Manage and track all your insurance policies</p>
          </div>
          <Button onClick={onUploadPolicy} className="gap-2">
            <Plus size={18} />
            Upload Policy
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileText className="text-blue-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Total Policies</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Check className="text-green-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Active</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Total Coverage</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalCoverage)}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-amber-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Expiring Soon</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.expiring}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'active', 'expiring', 'expired'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    statusFilter === status
                      ? 'bg-slate-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Policy List */}
        {filteredPolicies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No policies found</h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload your first policy to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={onUploadPolicy} className="gap-2">
                <Plus size={18} />
                Upload Policy
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Policy</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Coverage</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Premium</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Expiry</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPolicies.map((policy) => (
                    <tr key={policy.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{policy.logo}</span>
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onViewPolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => onEditPolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => onDeletePolicy(policy.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
