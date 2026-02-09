import { Shield, ShieldCheck, Menu, X, Sparkles, ArrowRight, Lock, Upload, User, Search, Bell, ChevronDown, Settings, LogOut, LogIn, HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { UploadWidget } from './UploadWidget'
import { SampleReportPreviewCompact } from './SampleReportPreview'
import { StaggeredList, AnimatedButton, ScaleOnHover } from '../animations/AnimatedComponents'
import { ComparisonMock, ComparisonMockMobile } from './ComparisonMock'
import { LanguageToggle } from './LanguageToggle'
import { usePolicies } from '@/lib/policy-context'
import { useAuth } from '@/lib/supabase/auth-context'

export function Hero() {
  const navigate = useNavigate()
  const { policies } = usePolicies()
  const { user, signOut } = useAuth()
  const policyCount = policies.length

  // Route to /try for anonymous users, /upload for logged-in users
  const uploadPath = user ? '/upload?autoOpen=true' : '/try'

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const handleMenuClick = (path: string) => {
    setShowProfileMenu(false)
    setMobileMenuOpen(false)
    navigate(path)
  }

  const handleSignOut = async () => {
    setShowProfileMenu(false)
    setMobileMenuOpen(false)

    if (!user) {
      navigate('/auth')
      return
    }

    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (error) {
      console.error('Sign out error:', error)
      toast.error('Failed to sign out')
    }
  }

  return (
    <div className="relative bg-gradient-to-b from-slate-50 to-white overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-blue-100/40 to-purple-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-100/40 to-blue-100/40 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      {/* Navigation */}
      <nav className="relative bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        {/* Top utility bar - hidden on mobile to save vertical space */}
        <div className="hidden sm:block bg-slate-50 border-b border-gray-200">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-9 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-gray-600">
                  <Lock size={12} className="text-emerald-600" />
                  <span>Secure & Encrypted</span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-gray-600">
                  <Shield size={12} className="text-blue-600" />
                  <span>Licensed Insurance Advisors</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  to="/help"
                  className="text-gray-600 hover:text-slate-900 transition-colors"
                >
                  Help
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main navigation */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo - always show brand name */}
            <Link to="/" className="flex items-center gap-3">
              <ScaleOnHover>
                <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center shadow-md">
                  <Shield className="text-white" size={18} />
                </div>
              </ScaleOnHover>
              <div>
                <div className="font-bold text-gray-900">InsurAI</div>
                <div className="hidden sm:block text-xs text-gray-500">Policy Analysis Platform</div>
              </div>
            </Link>

            {/* Desktop Navigation Items */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
              >
                <span>Dashboard</span>
                {policyCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-slate-700 text-white text-xs rounded-full font-semibold">
                    {policyCount > 9 ? '9+' : policyCount}
                  </span>
                )}
              </Link>
              <Link
                to="/upload?autoOpen=true"
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
              >
                <span>Compare</span>
              </Link>
              {policyCount > 0 && (
                <Link
                  to="/chat"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
                >
                  <span>Chat</span>
                </Link>
              )}
            </div>

            {/* Right side utilities */}
            <div className="hidden md:flex items-center gap-2">
              <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <Search size={20} />
              </button>
              <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} />
              </button>
              <Link
                to={uploadPath}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all font-medium text-sm ml-2"
              >
                <Upload size={18} />
                <span>Upload Policy</span>
              </Link>

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
                    <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="font-semibold text-gray-900">
                          {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user?.email || 'Not signed in'}</p>
                      </div>
                      {user && (
                        <button
                          onClick={() => handleMenuClick('/account')}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                        >
                          <User size={16} />
                          <span>My Account</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleMenuClick('/settings')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </button>
                      <button
                        onClick={() => handleMenuClick('/help')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <HelpCircle size={16} />
                        <span>Help Center</span>
                      </button>
                      <div className="border-t border-gray-100 mt-2 pt-2">
                        {user ? (
                          <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                          >
                            <LogOut size={16} />
                            <span>Sign Out</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMenuClick('/auth')}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors text-left"
                          >
                            <LogIn size={16} />
                            <span>Sign In</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 space-y-2 bg-white border-t border-gray-200">
              <button
                onClick={() => handleMenuClick('/dashboard')}
                className="block w-full text-left px-4 py-2.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => handleMenuClick('/upload?autoOpen=true')}
                className="block w-full text-left px-4 py-2.5 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Compare
              </button>
              <button
                onClick={() => handleMenuClick(uploadPath)}
                className="block w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-center"
              >
                Upload Policy
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Content */}
      <div className="relative container mx-auto px-4 py-10 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Text Content */}
          <StaggeredList staggerDelay={0.15}>
            {[
              <div key="badge" className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-blue-100 rounded-full shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <Sparkles className="text-blue-600" size={16} />
                </div>
                <span className="text-sm font-medium text-gray-700">AI-powered policy analysis</span>
              </div>,

              <h1 key="headline" className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.1] tracking-tight">
                Understand and <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">benchmark</span> your insurance policies
              </h1>,

              <p key="subheadline" className="text-lg sm:text-xl md:text-2xl text-gray-600 leading-relaxed -mt-1">
                Upload a policy PDF and get plain-language coverage analysis in seconds.
              </p>,

              /* CTA + micro-copy + trust badges — tightly grouped above the fold */
              <div key="cta-block" className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <UploadWidget
                    compact={true}
                    buttonText="Analyze Your Policy Free"
                    loadingText="Analyzing..."
                  />
                  <AnimatedButton
                    onClick={() => navigate('/samples')}
                    className="group inline-flex items-center justify-center gap-2 px-6 py-4 text-gray-600 hover:text-blue-700 transition-all font-medium text-sm"
                  >
                    <span>See Example Analysis</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </AnimatedButton>
                </div>
                <p className="text-xs text-gray-500">Free, no signup required</p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                    <ShieldCheck size={12} className="text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">KVKK Uyumlu</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
                    <Lock size={12} className="text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">256-bit SSL</span>
                  </div>
                </div>
              </div>,

              /* Benefits below CTA — reinforces the decision */
              <div key="benefits" className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-6 text-sm text-gray-600">
                {['PDF, Word, and scanned images', 'Turkish/English coverage explanations', 'Side-by-side policy comparison'].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>,

              /* Sample report preview — below the fold on mobile, that's fine */
              <div key="sample-report" className="mt-2">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">What you&apos;ll get:</p>
                <SampleReportPreviewCompact />
              </div>,

              <div key="samples-cta" className="mt-2 p-4 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📋</div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">Sample Policies Collection</div>
                      <div className="text-xs text-gray-600">See all Turkish insurance line samples</div>
                    </div>
                  </div>
                  <Link
                    to="/samples"
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-700 to-slate-900 text-white rounded-xl hover:shadow-lg transition-all text-sm font-semibold whitespace-nowrap"
                  >
                    View All
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>,

              <div key="trust-proof" className="pt-4 text-sm text-gray-500">
                <span className="font-medium text-gray-700">Built for Turkish insurance professionals</span>
                <span className="mx-2 text-gray-300">|</span>
                <span>Kasko, Trafik, DASK, Health, and more</span>
              </div>
            ]}
          </StaggeredList>

          {/* Right Column - Comparison Mock */}
          <div className="hidden lg:block relative">
            <div className="absolute -top-4 -right-4 z-10">
              <LanguageToggle />
            </div>
            <div className="relative">
              <ComparisonMock />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-3xl blur-2xl -z-10" />
            </div>
          </div>
        </div>

        {/* Mobile Comparison Mock */}
        <div className="lg:hidden mt-12">
          <div className="mb-4 flex justify-center">
            <LanguageToggle />
          </div>
          <ComparisonMockMobile />
        </div>
      </div>
    </div>
  )
}
