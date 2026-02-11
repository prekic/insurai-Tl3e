import { Shield, LayoutDashboard, MessageSquare, User, Settings, HelpCircle, Upload, Bell, Search, ChevronDown, LogOut, LogIn, Scale, Globe } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { usePolicies } from '@/lib/policy-context'
import { useAuth } from '@/lib/supabase/auth-context'
import { validateFiles, getErrorMessage, FILE_CONSTRAINTS } from '@/lib/errors'
import { useTranslation, useI18n } from '@/lib/i18n/i18n-context'

export function GlobalNavigation() {
  const { t } = useTranslation()
  const { locale, setLocale } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const { policies } = usePolicies()
  const { user, signOut } = useAuth()
  const policyCount = policies.length

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
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
    { id: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: '/compare', label: t.nav.compare, icon: Scale },
    { id: '/chat', label: t.nav.chat, icon: MessageSquare, showCount: true },
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
      toast.success(t.landing.signedOutSuccess)
      navigate('/')
    } catch (error) {
      console.error('Sign out error:', error)
      toast.error(t.landing.signOutFailed)
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
              <div className="text-xs text-gray-500">{t.landing.policyAnalysisPlatform}</div>
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
                  {item.showCount && user && policyCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-slate-700 text-white text-xs rounded-full font-semibold leading-none"
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
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => {
                  if (!user) {
                    navigate('/auth')
                    return
                  }
                  setShowProfileMenu(false)
                  setShowNotifications(!showNotifications)
                }}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
                aria-label="Notifications"
                aria-expanded={showNotifications}
                aria-haspopup="true"
              >
                <Bell size={20} aria-hidden="true" />
              </button>

              {showNotifications && user && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowNotifications(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    role="dialog"
                    aria-label="Notifications"
                  >
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <span className="font-semibold text-gray-900 text-sm">{t.nav.notifications}</span>
                    </div>
                    <div className="py-8 text-center text-sm text-gray-500">
                      <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                      {t.nav.noNotifications}
                    </div>
                  </div>
                </>
              )}
            </div>
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
              <span>{t.nav.upload}</span>
            </button>

            {/* Profile Menu */}
            <div className="relative">
              <button
                ref={profileButtonRef}
                onClick={() => {
                  setShowNotifications(false)
                  setShowProfileMenu(!showProfileMenu)
                }}
                className={`flex items-center gap-2 p-1.5 rounded-full transition-all focus-ring ${
                  showProfileMenu
                    ? 'bg-blue-50 ring-2 ring-blue-500'
                    : 'hover:bg-gray-100'
                }`}
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
                aria-label="User menu"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                  {user?.user_metadata?.full_name ? (
                    <span className="text-white font-semibold text-sm">
                      {user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  ) : user?.email ? (
                    <span className="text-white font-semibold text-sm">
                      {user.email.slice(0, 2).toUpperCase()}
                    </span>
                  ) : (
                    <User size={18} className="text-white" aria-hidden="true" />
                  )}
                </div>
                <ChevronDown
                  size={16}
                  className={`text-gray-500 transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`}
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
                    className="absolute right-0 mt-3 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    role="menu"
                    aria-orientation="vertical"
                    aria-label="User menu"
                  >
                    {/* User Info Header */}
                    <div className="px-4 py-4 bg-gradient-to-br from-slate-50 to-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                          {user?.user_metadata?.full_name ? (
                            <span className="text-white font-bold text-base">
                              {user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                          ) : user?.email ? (
                            <span className="text-white font-bold text-base">
                              {user.email.slice(0, 2).toUpperCase()}
                            </span>
                          ) : (
                            <User size={22} className="text-white" aria-hidden="true" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {user?.user_metadata?.full_name || user?.email?.split('@')[0] || t.landing.guest}
                          </p>
                          <p className="text-sm text-gray-500 truncate">{user?.email || t.landing.notSignedIn}</p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      {user && (
                        <button
                          onClick={() => handleMenuItemClick('/account')}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left focus-ring group"
                          role="menuitem"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                            <User size={16} className="text-gray-500 group-hover:text-blue-600" aria-hidden="true" />
                          </div>
                          <div>
                            <span className="font-medium">{t.nav.myAccount}</span>
                          </div>
                        </button>
                      )}
                      <button
                        onClick={() => handleMenuItemClick('/settings')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left focus-ring group"
                        role="menuitem"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                          <Settings size={16} className="text-gray-500 group-hover:text-blue-600" aria-hidden="true" />
                        </div>
                        <div>
                          <span className="font-medium">{t.nav.settings}</span>
                        </div>
                      </button>
                      {/* Language Switcher */}
                      <div className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Globe size={16} className="text-gray-500" aria-hidden="true" />
                        </div>
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5" role="radiogroup" aria-label="Language">
                          <button
                            onClick={() => setLocale('tr')}
                            role="radio"
                            aria-checked={locale === 'tr'}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              locale === 'tr'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                            }`}
                          >
                            Türkçe
                          </button>
                          <button
                            onClick={() => setLocale('en')}
                            role="radio"
                            aria-checked={locale === 'en'}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              locale === 'en'
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                            }`}
                          >
                            English
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => handleMenuItemClick('/help')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left focus-ring group"
                        role="menuitem"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                          <HelpCircle size={16} className="text-gray-500 group-hover:text-blue-600" aria-hidden="true" />
                        </div>
                        <div>
                          <span className="font-medium">{t.nav.helpCenter}</span>
                        </div>
                      </button>
                    </div>

                    {/* Sign Out / Sign In */}
                    <div className="border-t border-gray-100 p-2">
                      {user ? (
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left focus-ring"
                          role="menuitem"
                        >
                          <LogOut size={18} aria-hidden="true" />
                          <span>{t.auth.signOut}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMenuItemClick('/auth')}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all shadow-sm hover:shadow-md focus-ring"
                          role="menuitem"
                        >
                          <LogIn size={18} aria-hidden="true" />
                          <span>{t.auth.signIn}</span>
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
