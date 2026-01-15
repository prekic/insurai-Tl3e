import { Shield, LayoutDashboard, MessageSquare, User, Settings, HelpCircle, Upload, Bell, Search, ChevronDown, LogOut, LogIn, Scale } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePolicies } from '@/lib/policy-context'
import { useAuth } from '@/lib/supabase/auth-context'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'

export function GlobalNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { policies } = usePolicies()
  const { user, signOut } = useAuth()
  const policyCount = policies.length

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file upload directly from navigation
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    // Validate files
    const { valid, errors } = validateFiles(selectedFiles)

    // Show error toasts for invalid files
    errors.forEach((error) => {
      const errorInfo = getErrorMessage(error.code)
      toast.error(errorInfo.title, {
        description: error.details || errorInfo.description,
        duration: 5000,
      })
    })

    if (valid.length > 0) {
      // Navigate to upload page with the files
      // Store files in sessionStorage temporarily
      const fileData = valid.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }))
      sessionStorage.setItem('pendingUploadFiles', JSON.stringify(fileData))

      // Create a global event to pass the actual files
      const event = new CustomEvent('filesSelected', { detail: valid })
      window.dispatchEvent(event)

      // Navigate to upload page (it will pick up the files)
      navigate('/upload', { state: { filesReady: true } })
    }

    // Reset input
    e.target.value = ''
  }, [navigate])

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const currentPage = location.pathname

  const navItems = [
    { id: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: '/compare', label: 'Compare', icon: Scale },
    { id: '/chat', label: 'Chat', icon: MessageSquare, showCount: true },
  ]

  // Handle keyboard navigation in profile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showProfileMenu) return

      if (e.key === 'Escape') {
        setShowProfileMenu(false)
        profileButtonRef.current?.focus()
      }

      // Handle arrow key navigation within menu
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const menuItems = profileMenuRef.current?.querySelectorAll('button, a')
        if (!menuItems) return

        const currentIndex = Array.from(menuItems).findIndex(
          (item) => item === document.activeElement
        )

        let nextIndex: number
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1
        }

        ;(menuItems[nextIndex] as HTMLElement)?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showProfileMenu])

  // Focus first menu item when menu opens
  useEffect(() => {
    if (showProfileMenu) {
      const firstMenuItem = profileMenuRef.current?.querySelector('button, a') as HTMLElement
      setTimeout(() => firstMenuItem?.focus(), 0)
    }
  }, [showProfileMenu])

  const handleMenuItemClick = (path: string) => {
    setShowProfileMenu(false)
    navigate(path)
  }

  const handleSignOut = async () => {
    setShowProfileMenu(false)

    // If not logged in, redirect to login
    if (!user) {
      navigate('/auth')
      return
    }

    try {
      await signOut()
      toast.success('Signed out successfully')
      navigate('/')
    } catch (error) {
      console.error('Sign out error:', error)
      toast.error('Failed to sign out')
      // Navigate anyway on error
      navigate('/')
    }
  }

  return (
    <nav
      className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm w-full max-w-[100vw] overflow-x-hidden"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full overflow-hidden">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-3 focus-ring rounded-lg"
            aria-label="Go to home page"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center shadow-md">
              <Shield className="text-white" size={18} aria-hidden="true" />
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-gray-900">InsurAI</div>
              <div className="text-xs text-gray-500">Policy Analysis</div>
            </div>
          </Link>

          {/* Main Navigation */}
          <div className="hidden md:flex items-center gap-1" role="menubar">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              return (
                <Link
                  key={item.id}
                  to={item.id}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all focus-ring ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.showCount && policyCount > 0 && (
                    <span
                      className="px-1.5 py-0.5 bg-slate-700 text-white text-xs rounded-full font-semibold"
                      aria-label={`${policyCount} policies loaded`}
                    >
                      {policyCount > 9 ? '9+' : policyCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2">
            <button
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
              aria-label="Search policies"
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <button
              className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
              aria-label={policyCount > 0 ? `Notifications, ${policyCount} new` : 'Notifications'}
            >
              <Bell size={20} aria-hidden="true" />
              {policyCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"
                  aria-hidden="true"
                />
              )}
            </button>
            {/* Hidden file input for immediate upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              aria-hidden="true"
            />
            <button
              onClick={triggerFileUpload}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all font-medium text-sm ml-2 focus-ring"
            >
              <Upload size={18} aria-hidden="true" />
              <span>Upload</span>
            </button>

            {/* Profile Menu */}
            <div className="relative">
              <button
                ref={profileButtonRef}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
                aria-label="User menu"
              >
                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                  <User size={16} className="text-white" aria-hidden="true" />
                </div>
                <ChevronDown
                  size={16}
                  className={`text-gray-600 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                    aria-hidden="true"
                  />
                  <div
                    ref={profileMenuRef}
                    className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
                    role="menu"
                    aria-orientation="vertical"
                    aria-label="User menu"
                  >
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900">
                        {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user?.email || 'Not signed in'}</p>
                    </div>
                    {user && (
                      <button
                        onClick={() => handleMenuItemClick('/account')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left focus-ring"
                        role="menuitem"
                      >
                        <User size={16} aria-hidden="true" />
                        <span>My Account</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleMenuItemClick('/settings')}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left focus-ring"
                      role="menuitem"
                    >
                      <Settings size={16} aria-hidden="true" />
                      <span>Settings</span>
                    </button>
                    <button
                      onClick={() => handleMenuItemClick('/help')}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left focus-ring"
                      role="menuitem"
                    >
                      <HelpCircle size={16} aria-hidden="true" />
                      <span>Help Center</span>
                    </button>
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      {user ? (
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left focus-ring"
                          role="menuitem"
                        >
                          <LogOut size={16} aria-hidden="true" />
                          <span>Sign Out</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMenuItemClick('/auth')}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors text-left focus-ring"
                          role="menuitem"
                        >
                          <LogIn size={16} aria-hidden="true" />
                          <span>Sign In</span>
                        </button>
                      )}
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
