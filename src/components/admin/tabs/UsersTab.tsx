/**
 * Users Tab
 * Real user management with segment assignment and action menu.
 * Fetches Supabase auth users via admin API and manages reviewer segments.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { adminFetch } from '@/lib/admin/api'
import {
  Search,
  Users,
  UserCheck,
  Activity,
  Shield,
  MoreVertical,
  UserPlus,
  UserMinus,
  Eye,
  Flag,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  display_name?: string
  role: string
  status: string
  created_at: string
  last_login_at?: string
  permissions?: string[]
}

interface UserSegment {
  id: string
  user_id: string
  segment_name: string
  assigned_at: string
  assigned_by: string
}

interface FeatureFlagInfo {
  key: string
  enabled: boolean
  rolloutPercentage: number
}

// ─── User Detail Modal ──────────────────────────────────────────────────────

function UserDetailModal({
  user,
  segments,
  onClose,
  onAssignSegment,
  onRemoveSegment,
  segmentLoading,
}: {
  user: AdminUser
  segments: UserSegment[]
  onClose: () => void
  onAssignSegment: (userId: string, segmentName: string) => Promise<void>
  onRemoveSegment: (userId: string, segmentName: string) => Promise<void>
  segmentLoading: boolean
}) {
  const isReviewer = segments.some((s) => s.segment_name === 'kasko_pilot_reviewers')
  const backdropRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`User details for ${user.email}`}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">User Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-blue-700">
                {(user.display_name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="font-semibold text-gray-900">{user.display_name || 'No Name'}</div>
              <div className="text-sm text-gray-500">{user.email}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Role:</span>{' '}
              <span className="font-medium">{user.role}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>{' '}
              <span className="font-medium">{user.status}</span>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>{' '}
              <span className="font-medium">{new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Last Login:</span>{' '}
              <span className="font-medium">
                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">ID:</span>{' '}
              <span className="font-mono text-xs">{user.id.slice(0, 8)}...</span>
            </div>
          </div>

          {/* Segments Section */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Segments</h3>
            {segments.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No segments assigned</p>
            ) : (
              <div className="space-y-2">
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <div>
                      <Badge className="bg-amber-100 text-amber-800">{seg.segment_name}</Badge>
                      <span className="text-xs text-gray-400 ml-2">
                        by {seg.assigned_by} on {new Date(seg.assigned_at).toLocaleDateString()}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSegment(user.id, seg.segment_name)}
                      disabled={segmentLoading}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* KASKO Reviewer Quick Assign */}
            {!isReviewer && (
              <Button
                size="sm"
                className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => onAssignSegment(user.id, 'kasko_pilot_reviewers')}
                disabled={segmentLoading}
              >
                {segmentLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Assign as KASKO Pilot Reviewer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Action Menu Dropdown ────────────────────────────────────────────────────

function ActionMenu({
  user,
  isReviewer,
  onViewDetails,
  onToggleReviewer,
  segmentLoading,
}: {
  user: AdminUser
  isReviewer: boolean
  onViewDetails: () => void
  onToggleReviewer: () => void
  segmentLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-label={`Actions for ${user.email}`}
        aria-expanded={open}
        data-testid={`action-menu-${user.id}`}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
          role="menu"
          data-testid={`action-dropdown-${user.id}`}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onViewDetails()
            }}
          >
            <Eye className="h-4 w-4" />
            View Details
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
              isReviewer ? 'text-red-600 hover:bg-red-50' : 'text-amber-700 hover:bg-amber-50'
            }`}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onToggleReviewer()
            }}
            disabled={segmentLoading}
          >
            {segmentLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isReviewer ? (
              <UserMinus className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isReviewer ? 'Remove from KASKO Reviewers' : 'Assign as KASKO Reviewer'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Pilot Status Banner ─────────────────────────────────────────────────────

function PilotStatusBanner({ flag }: { flag: FeatureFlagInfo | null }) {
  if (!flag) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 text-sm">
        <AlertCircle className="h-5 w-5 text-gray-400" />
        <span className="text-gray-500">
          KASKO Pilot flag not found. Apply migration 040 first.
        </span>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg p-3 flex items-center justify-between text-sm ${
        flag.enabled ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <Flag className={`h-5 w-5 ${flag.enabled ? 'text-green-600' : 'text-amber-600'}`} />
        <span className={flag.enabled ? 'text-green-800' : 'text-amber-800'}>
          <strong>KASKO AI Extraction Pilot:</strong>{' '}
          {flag.enabled ? `Enabled (${flag.rolloutPercentage}% rollout)` : 'Disabled'}
        </span>
      </div>
      <Badge
        className={flag.enabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
      >
        {flag.enabled ? 'ACTIVE' : 'INACTIVE'}
      </Badge>
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
      }`}
      role="alert"
    >
      {type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-80">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ─── Main UsersTab ───────────────────────────────────────────────────────────

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSegments, setUserSegments] = useState<Record<string, UserSegment[]>>({})
  const [pilotFlag, setPilotFlag] = useState<FeatureFlagInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [segmentLoading, setSegmentLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch admin users from real API
  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/users')
      const data = await response.json()
      if (data.success && data.data) {
        setUsers(data.data)
      } else {
        setError(data.error || 'Failed to fetch users')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch kasko_pilot_reviewers segment members
  const fetchReviewerSegments = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/segments?name=kasko_pilot_reviewers')
      const data = await response.json()
      if (data.success && data.data) {
        const segmentMap: Record<string, UserSegment[]> = {}
        for (const seg of data.data as UserSegment[]) {
          if (!segmentMap[seg.user_id]) segmentMap[seg.user_id] = []
          segmentMap[seg.user_id].push(seg)
        }
        setUserSegments(segmentMap)
      }
    } catch {
      // Segments table may not exist yet — silent degradation
    }
  }, [])

  // Fetch pilot feature flag status
  const fetchPilotFlag = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/settings/feature-flags')
      const data = await response.json()
      if (data.success && data.data) {
        const flag = (data.data as FeatureFlagInfo[]).find(
          (f) => f.key === 'kasko_ai_extraction_pilot'
        )
        setPilotFlag(flag || null)
      }
    } catch {
      // Silent — feature flags may not be seeded
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchReviewerSegments()
    fetchPilotFlag()
  }, [fetchUsers, fetchReviewerSegments, fetchPilotFlag])

  // Assign user to kasko_pilot_reviewers
  const assignReviewer = useCallback(
    async (userId: string, segmentName: string) => {
      setSegmentLoading(true)
      try {
        const response = await adminFetch('/api/admin/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, segmentName }),
        })
        const data = await response.json()
        if (data.success) {
          setToast({ message: 'User assigned as KASKO reviewer', type: 'success' })
          await fetchReviewerSegments()
        } else if (data.code === 'ALREADY_ASSIGNED') {
          setToast({ message: 'User is already a reviewer', type: 'error' })
        } else {
          setToast({
            message: data.error || 'Failed to assign reviewer',
            type: 'error',
          })
        }
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Network error',
          type: 'error',
        })
      } finally {
        setSegmentLoading(false)
      }
    },
    [fetchReviewerSegments]
  )

  // Remove user from a segment
  const removeSegment = useCallback(
    async (userId: string, segmentName: string) => {
      setSegmentLoading(true)
      try {
        const response = await adminFetch(`/api/admin/segments/${userId}/${segmentName}`, {
          method: 'DELETE',
        })
        const data = await response.json()
        if (data.success) {
          setToast({ message: 'Reviewer removed from segment', type: 'success' })
          await fetchReviewerSegments()
        } else {
          setToast({
            message: data.error || 'Failed to remove from segment',
            type: 'error',
          })
        }
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Network error',
          type: 'error',
        })
      } finally {
        setSegmentLoading(false)
      }
    },
    [fetchReviewerSegments]
  )

  const isUserReviewer = (userId: string) =>
    (userSegments[userId] || []).some((s) => s.segment_name === 'kasko_pilot_reviewers')

  const filteredUsers = users.filter((user) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !user.email.toLowerCase().includes(q) &&
        !(user.display_name || '').toLowerCase().includes(q)
      )
        return false
    }
    if (roleFilter && user.role !== roleFilter) return false
    if (statusFilter && user.status !== statusFilter) return false
    return true
  })

  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.status === 'active').length
  const adminUsers = users.filter((u) => u.role === 'admin' || u.role === 'super_admin').length
  const reviewerCount = Object.keys(userSegments).length

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-purple-100 text-purple-800">Admin</Badge>
      case 'super_admin':
        return <Badge className="bg-red-100 text-red-800">Super Admin</Badge>
      case 'premium':
        return <Badge className="bg-blue-100 text-blue-800">Premium</Badge>
      default:
        return <Badge variant="outline">User</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'inactive':
        return <Badge variant="outline">Inactive</Badge>
      case 'suspended':
        return <Badge className="bg-red-100 text-red-800">Suspended</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500">Manage admin users and KASKO reviewer assignments</p>
        </div>
        <Button
          onClick={() => {
            fetchUsers()
            fetchReviewerSegments()
            fetchPilotFlag()
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Pilot Status Banner */}
      <PilotStatusBanner flag={pilotFlag} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalUsers}</div>
                <div className="text-sm text-gray-500">Total Admins</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{activeUsers}</div>
                <div className="text-sm text-gray-500">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{adminUsers}</div>
                <div className="text-sm text-gray-500">Super Admins</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Activity className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{reviewerCount}</div>
                <div className="text-sm text-gray-500">KASKO Reviewers</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Users</CardTitle>
          <CardDescription>
            Showing {filteredUsers.length} of {totalUsers} admin users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Segments
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Last Login
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const reviewer = isUserReviewer(user.id)
                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${
                          reviewer ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600">
                                {(user.display_name || user.email).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {user.display_name || 'No Name'}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                        <td className="py-3 px-4">{getStatusBadge(user.status)}</td>
                        <td className="py-3 px-4">
                          {reviewer ? (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">
                              KASKO Reviewer
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-500">
                            {user.last_login_at
                              ? new Date(user.last_login_at).toLocaleDateString()
                              : 'Never'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <ActionMenu
                            user={user}
                            isReviewer={reviewer}
                            onViewDetails={() => setSelectedUser(user)}
                            onToggleReviewer={() => {
                              if (reviewer) {
                                removeSegment(user.id, 'kasko_pilot_reviewers')
                              } else {
                                assignReviewer(user.id, 'kasko_pilot_reviewers')
                              }
                            }}
                            segmentLoading={segmentLoading}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          segments={userSegments[selectedUser.id] || []}
          onClose={() => setSelectedUser(null)}
          onAssignSegment={assignReviewer}
          onRemoveSegment={removeSegment}
          segmentLoading={segmentLoading}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

export default UsersTab
