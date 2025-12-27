import { Shield, LayoutDashboard, MessageSquare, User, Settings, HelpCircle, Upload, Bell, Search, ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'

interface GlobalNavigationProps {
  currentPage: string
  onNavigateToLanding: () => void
  onNavigateToComparison: () => void
  onNavigateToDashboard: () => void
  onNavigateToChat: () => void
  onNavigateToMyAccount: () => void
  onNavigateToSettings: () => void
  onNavigateToHelpCenter: () => void
  policyCount: number
  policies: any[]
  onViewPolicy: (id: string) => void
}

export function GlobalNavigation({
  currentPage,
  onNavigateToLanding,
  onNavigateToComparison,
  onNavigateToDashboard,
  onNavigateToChat,
  onNavigateToMyAccount,
  onNavigateToSettings,
  onNavigateToHelpCenter,
  policyCount,
}: GlobalNavigationProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, onClick: onNavigateToDashboard },
    { id: 'comparison', label: 'Compare', icon: Upload, onClick: onNavigateToComparison },
    { id: 'chat', label: 'Chat', icon: MessageSquare, onClick: onNavigateToChat, showCount: true },
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={onNavigateToLanding} className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center shadow-md">
              <Shield className="text-white" size={18} />
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-gray-900">InsurAI</div>
              <div className="text-xs text-gray-500">Policy Analysis</div>
            </div>
          </button>

          {/* Main Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.showCount && policyCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-slate-700 text-white text-xs rounded-full font-semibold">
                      {policyCount > 9 ? '9+' : policyCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Search size={20} />
            </button>
            <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell size={20} />
              {policyCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <button
              onClick={onNavigateToComparison}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all font-medium text-sm ml-2"
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>

            {/* Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <ChevronDown size={16} className="text-gray-600" />
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900">John Doe</p>
                      <p className="text-xs text-gray-500">john@example.com</p>
                    </div>
                    <button
                      onClick={() => { setShowProfileMenu(false); onNavigateToMyAccount() }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                    >
                      <User size={16} />
                      <span>My Account</span>
                    </button>
                    <button
                      onClick={() => { setShowProfileMenu(false); onNavigateToSettings() }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                    >
                      <Settings size={16} />
                      <span>Settings</span>
                    </button>
                    <button
                      onClick={() => { setShowProfileMenu(false); onNavigateToHelpCenter() }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                    >
                      <HelpCircle size={16} />
                      <span>Help Center</span>
                    </button>
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button
                        onClick={() => { setShowProfileMenu(false); onNavigateToLanding() }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
