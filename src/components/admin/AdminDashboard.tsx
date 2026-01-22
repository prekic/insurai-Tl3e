/**
 * Admin Dashboard
 * Comprehensive admin panel for monitoring and controlling InsurAI
 */

import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/loading'
import { useAdminAuth } from '@/lib/admin/context'
import { adminFetch } from '@/lib/admin/api'
import type { AdminSection, SystemHealth, AdminAlert } from '@/types/admin'

// Tab components
import { OverviewTab } from './tabs/OverviewTab'
import { AIOperationsTab } from './tabs/AIOperationsTab'
import { PromptsTab } from './tabs/PromptsTab'
import { UsersTab } from './tabs/UsersTab'
import { PoliciesTab } from './tabs/PoliciesTab'
import { PipelineTab } from './tabs/PipelineTab'
import { OCRDashboardTab } from './tabs/OCRDashboardTab'
import { SecurityTab } from './tabs/SecurityTab'
import { ConfigTab } from './tabs/ConfigTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { AuditTab } from './tabs/AuditTab'
import { AlertsTab } from './tabs/AlertsTab'

// Icons
import {
  LayoutDashboard,
  Brain,
  MessageSquare,
  Users,
  FileText,
  Workflow,
  Eye,
  Shield,
  Settings,
  BarChart3,
  ScrollText,
  Bell,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react'

const TABS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'ai_operations', label: 'AI Operations', icon: <Brain className="h-4 w-4" /> },
  { id: 'prompts', label: 'Prompts', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { id: 'policies', label: 'Policies', icon: <FileText className="h-4 w-4" /> },
  { id: 'pipeline', label: 'Pipeline', icon: <Workflow className="h-4 w-4" /> },
  { id: 'ocr_dashboard', label: 'OCR Analytics', icon: <Eye className="h-4 w-4" /> },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  { id: 'config', label: 'Configuration', icon: <Settings className="h-4 w-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" /> },
  { id: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
]

export function AdminDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<AdminSection>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // All hooks must be called unconditionally (React Rules of Hooks)
  const fetchSystemHealth = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/health')
      const data = await response.json()
      if (data.success) {
        setSystemHealth(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch system health:', error)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/security/logs?severity=critical&resolved=false&limit=10')
      const data = await response.json()
      if (data.success) {
        // Convert security logs to alerts format
        setAlerts(data.data.map((log: Record<string, unknown>) => ({
          id: log.id,
          timestamp: log.timestamp,
          type: log.eventType,
          severity: log.severity,
          title: String(log.eventType).replace(/_/g, ' '),
          message: JSON.stringify(log.details),
          acknowledged: false,
          resolved: log.resolved,
        })))
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchSystemHealth(), fetchAlerts()])
    setLastRefresh(new Date())
    setIsLoading(false)
  }, [fetchSystemHealth, fetchAlerts])

  useEffect(() => {
    // Only refresh if authenticated
    if (!authLoading && isAuthenticated) {
      refresh()
      // Auto-refresh every 30 seconds
      const interval = setInterval(refresh, 30000)
      return () => clearInterval(interval)
    }
  }, [refresh, authLoading, isAuthenticated])

  // Security: Redirect to login if not authenticated
  // These conditional returns come AFTER all hooks
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Spinner className="h-8 w-8 mx-auto mb-4" />
          <p className="text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged && !a.resolved)

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab systemHealth={systemHealth} />
      case 'ai_operations':
        return <AIOperationsTab />
      case 'prompts':
        return <PromptsTab />
      case 'users':
        return <UsersTab />
      case 'policies':
        return <PoliciesTab />
      case 'pipeline':
        return <PipelineTab />
      case 'ocr_dashboard':
        return <OCRDashboardTab />
      case 'security':
        return <SecurityTab />
      case 'config':
        return <ConfigTab />
      case 'analytics':
        return <AnalyticsTab />
      case 'audit':
        return <AuditTab />
      case 'alerts':
        return <AlertsTab />
      default:
        return <OverviewTab systemHealth={systemHealth} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and title */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">InsurAI Admin</span>
              </div>

              {/* System Status */}
              {systemHealth && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${getStatusColor(systemHealth.status)}`}>
                  {getStatusIcon(systemHealth.status)}
                  <span className="text-sm font-medium capitalize">{systemHealth.status}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              {/* Alerts indicator */}
              {unacknowledgedAlerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  onClick={() => setActiveTab('alerts')}
                >
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unacknowledgedAlerts.length}
                  </span>
                </Button>
              )}

              {/* Refresh */}
              <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              {/* Last refresh time */}
              <span className="text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-4 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'alerts' && unacknowledgedAlerts.length > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {unacknowledgedAlerts.length}
                  </Badge>
                )}
              </button>
            ))}
          </nav>

          {/* Environment info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <span>Environment:</span>
                <Badge variant="outline" className="text-xs">
                  {systemHealth?.environment || 'unknown'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Version:</span>
                <span>{systemHealth?.version || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>Uptime:</span>
                <span>{systemHealth ? formatUptime(systemHealth.uptime) : '-'}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-[1400px] mx-auto">
            {isLoading && !systemHealth ? (
              <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
              </div>
            ) : (
              renderTabContent()
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export default AdminDashboard
