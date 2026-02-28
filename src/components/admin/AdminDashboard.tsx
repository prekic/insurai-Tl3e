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
import { SettingsTab } from './tabs/SettingsTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { AuditTab } from './tabs/AuditTab'
import { AlertsTab } from './tabs/AlertsTab'
import { ProcessingLogsTab } from './tabs/ProcessingLogsTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { BenchmarksTab } from './tabs/BenchmarksTab'
import { TranslationsTab } from './tabs/TranslationsTab'
import { ExtractionHealthTab } from './tabs/ExtractionHealthTab'
import { ActuarialTab } from './tabs/ActuarialTab'

import { cn } from '@/lib/utils'

// Icons
import {
  Activity,
  LayoutDashboard,
  Brain,
  MessageSquare,
  Users,
  FileText,
  Workflow,
  Route,
  Eye,
  Shield,
  Settings,
  BarChart3,
  ScrollText,
  Bell,
  BellRing,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Languages,
  Menu,
  X,
  Calculator,
} from 'lucide-react'

const TABS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <BellRing className="h-4 w-4" /> },
  { id: 'ai_operations', label: 'AI Operations', icon: <Brain className="h-4 w-4" /> },
  { id: 'prompts', label: 'Prompts', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { id: 'policies', label: 'Policies', icon: <FileText className="h-4 w-4" /> },
  { id: 'pipeline', label: 'Pipeline', icon: <Workflow className="h-4 w-4" /> },
  { id: 'processing_logs', label: 'Document Journey', icon: <Route className="h-4 w-4" /> },
  { id: 'ocr_dashboard', label: 'OCR Analytics', icon: <Eye className="h-4 w-4" /> },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  { id: 'config', label: 'Configuration', icon: <Settings className="h-4 w-4" /> },
  { id: 'translations', label: 'Translations', icon: <Languages className="h-4 w-4" /> },
  { id: 'benchmarks', label: 'Benchmarks', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" /> },
  { id: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
  { id: 'extraction_health', label: 'Extraction Health', icon: <Activity className="h-4 w-4" /> },
  { id: 'actuarial', label: 'Actuarial Engine', icon: <Calculator className="h-4 w-4" /> },
]

export function AdminDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<AdminSection>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
      const response = await adminFetch(
        '/api/admin/security/logs?severity=critical&resolved=false&limit=10'
      )
      const data = await response.json()
      if (data.success) {
        // Convert security logs to alerts format
        setAlerts(
          data.data.map((log: Record<string, unknown>) => ({
            id: log.id,
            timestamp: log.timestamp,
            type: log.eventType,
            severity: log.severity,
            title: String(log.eventType).replace(/_/g, ' '),
            message: JSON.stringify(log.details),
            acknowledged: false,
            resolved: log.resolved,
          }))
        )
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
      case 'notifications':
        return <NotificationsTab />
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
        return <SettingsTab />
      case 'translations':
        return <TranslationsTab />
      case 'benchmarks':
        return <BenchmarksTab />
      case 'analytics':
        return <AnalyticsTab />
      case 'audit':
        return <AuditTab />
      case 'alerts':
        return <AlertsTab />
      case 'processing_logs':
        return <ProcessingLogsTab />
      case 'extraction_health':
        return <ExtractionHealthTab />
      case 'actuarial':
        return <ActuarialTab />
      default:
        return <OverviewTab systemHealth={systemHealth} />
    }
  }

  const handleTabSelect = (tabId: AdminSection) => {
    setActiveTab(tabId)
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Hamburger (mobile) + Logo */}
            <div className="flex items-center gap-3">
              <button
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900 hidden sm:inline">
                  InsurAI Admin
                </span>
                <span className="text-xl font-bold text-gray-900 sm:hidden">Admin</span>
              </div>

              {/* System Status */}
              {systemHealth && (
                <div
                  className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border ${getStatusColor(systemHealth.status)}`}
                >
                  {getStatusIcon(systemHealth.status)}
                  <span className="text-sm font-medium capitalize">{systemHealth.status}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Alerts indicator */}
              {unacknowledgedAlerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  onClick={() => handleTabSelect('alerts')}
                >
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unacknowledgedAlerts.length}
                  </span>
                </Button>
              )}

              {/* Refresh */}
              <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                <span className="hidden md:inline ml-2">Refresh</span>
              </Button>

              {/* Last refresh time — hidden on mobile */}
              <span className="hidden md:inline text-sm text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex">
        {/* Sidebar Navigation — mobile: slide-out drawer; desktop: static */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out overflow-y-auto',
            'md:static md:translate-x-0 md:min-h-[calc(100vh-4rem)] md:sticky md:top-16',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {/* Close button — mobile only */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 md:hidden">
            <span className="font-semibold text-gray-900">Navigation</span>
            <button
              className="p-1 text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="p-4 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
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
          <div className="hidden md:block absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
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
        <main className="flex-1 min-w-0 p-3 md:p-6">
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
