import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider, useI18n } from './lib/i18n'
import { LandingPage } from './components/LandingPage'
import { PolicyUpload } from './components/PolicyUpload'
import { PolicyDashboard } from './components/PolicyDashboard'
import { PolicyDetailView } from './components/PolicyDetailView'
import { PolicyChat } from './components/PolicyChat'
import { GlobalNavigation } from './components/GlobalNavigation'
import { MyAccount } from './components/MyAccount'
import { Settings } from './components/Settings'
import { HelpCenter } from './components/HelpCenter'
import { AllSamplesDemo } from './components/AllSamplesDemo'
import { PageTransition } from './components/animations/AnimatedComponents'
import { AnalyzedPolicy } from './types/policy'
import { samplePolicies } from './data/sample-policies'

type Page = 'landing' | 'upload' | 'comparison' | 'policyDetail' | 'dashboard' | 'chat' | 'myAccount' | 'settings' | 'helpCenter' | 'allSamplesDemo'

// Main App component wrapped with providers
export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}

// Inner app content that uses i18n hooks
function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [analyzedPolicies, setAnalyzedPolicies] = useState<AnalyzedPolicy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<AnalyzedPolicy | null>(null)

  // Load sample policies on mount
  useEffect(() => {
    setAnalyzedPolicies(samplePolicies)
  }, [])

  const handlePoliciesUploaded = () => {
    setCurrentPage('comparison')
  }

  const handleNavigateToUpload = () => {
    setCurrentPage('comparison')
  }

  const handleNavigateToComparison = () => {
    setCurrentPage('comparison')
  }

  const handleBackToHome = () => {
    setCurrentPage('landing')
    setSelectedPolicy(null)
  }

  const handlePoliciesAnalyzed = (policies: AnalyzedPolicy[]) => {
    setAnalyzedPolicies((prev) => [...prev, ...policies])
    setCurrentPage('dashboard')
  }

  const handleViewPolicyDetail = (policyId: string) => {
    const policy = analyzedPolicies.find((p) => p.id === policyId)
    if (policy) {
      setSelectedPolicy(policy)
      setCurrentPage('policyDetail')
    }
  }

  const handleBackFromDetail = () => {
    setSelectedPolicy(null)
    setCurrentPage('dashboard')
  }

  const handleNavigateToDashboard = () => {
    setCurrentPage('dashboard')
  }

  const handleViewPolicy = (policyId: string) => {
    const policy = analyzedPolicies.find((p) => p.id === policyId)
    if (policy) {
      setSelectedPolicy(policy)
      setCurrentPage('policyDetail')
    }
  }

  const handleEditPolicy = (policyId: string) => {
    handleViewPolicy(policyId)
  }

  const handleDeletePolicy = (policyId: string) => {
    const policyToDelete = analyzedPolicies.find((p) => p.id === policyId)
    setAnalyzedPolicies((prev) => prev.filter((p) => p.id !== policyId))

    if (policyToDelete) {
      toast.success('Policy deleted', {
        description: `${policyToDelete.provider} ${policyToDelete.typeTr} policy has been removed.`,
        action: {
          label: 'Undo',
          onClick: () => {
            setAnalyzedPolicies((prev) => [...prev, policyToDelete])
            toast.info('Policy restored', {
              description: 'The policy has been restored to your dashboard.',
            })
          },
        },
      })
    }
  }

  const handleNavigateToChat = () => {
    setCurrentPage('chat')
  }

  const handleNavigateToMyAccount = () => {
    setCurrentPage('myAccount')
  }

  const handleNavigateToSettings = () => {
    setCurrentPage('settings')
  }

  const handleNavigateToHelpCenter = () => {
    setCurrentPage('helpCenter')
  }

  const handleNavigateToAllSamplesDemo = () => {
    setCurrentPage('allSamplesDemo')
  }

  // Convert analyzed policies to dashboard format
  const dashboardPolicies = analyzedPolicies.map((p) => ({
    id: p.id,
    policyNumber: p.policyNumber,
    provider: p.provider,
    logo: p.logo,
    type: p.typeTr,
    coverage: p.coverage,
    premium: p.premium,
    deductible: p.deductible,
    startDate: p.startDate,
    expiryDate: p.expiryDate,
    status: p.status,
    uploadDate: p.uploadDate,
    documentType: p.documentType,
    insuredPerson: p.insuredPerson,
    location: p.location,
  }))

  // Use i18n for translations
  const { t } = useI18n()

  // Get page title for screen readers (using translations)
  const getPageTitle = (): string => {
    const titles: Record<Page, string> = {
      landing: t.nav.home,
      upload: t.upload.title,
      comparison: t.nav.compare,
      policyDetail: t.policy.policy,
      dashboard: t.nav.dashboard,
      chat: t.chat.title,
      myAccount: t.account.title,
      settings: t.settings.title,
      helpCenter: t.help.title,
      allSamplesDemo: t.policy.policies,
    }
    return titles[currentPage]
  }

  return (
    <ErrorBoundary>
      {/* Skip to main content link for keyboard users */}
      <a href="#main-content" className="skip-to-main">
        {t.a11y.skipToContent}
      </a>

      {/* Screen reader announcement for page changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`${t.a11y.nowViewing}: ${getPageTitle()}`}
      </div>

      <Toaster position="top-right" richColors />

      {/* Global Navigation - Show on all pages except landing */}
      {currentPage !== 'landing' && (
        <GlobalNavigation
          currentPage={currentPage}
          onNavigateToLanding={handleBackToHome}
          onNavigateToComparison={handleNavigateToComparison}
          onNavigateToDashboard={handleNavigateToDashboard}
          onNavigateToChat={handleNavigateToChat}
          onNavigateToMyAccount={handleNavigateToMyAccount}
          onNavigateToSettings={handleNavigateToSettings}
          onNavigateToHelpCenter={handleNavigateToHelpCenter}
          policyCount={analyzedPolicies.length}
          policies={analyzedPolicies}
          onViewPolicy={handleViewPolicyDetail}
        />
      )}

      <main id="main-content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          {currentPage === 'landing' && (
          <PageTransition key="landing">
            <LandingPage
              onPoliciesUploaded={handlePoliciesUploaded}
              onNavigateToComparison={handleNavigateToComparison}
              onNavigateToUpload={handleNavigateToUpload}
              onNavigateToDashboard={handleNavigateToDashboard}
              onNavigateToChat={handleNavigateToChat}
              onNavigateToHelpCenter={handleNavigateToHelpCenter}
              onNavigateToMyAccount={handleNavigateToMyAccount}
              onNavigateToSettings={handleNavigateToSettings}
              onNavigateToLanding={handleBackToHome}
              onNavigateToAllSamplesDemo={handleNavigateToAllSamplesDemo}
              policyCount={analyzedPolicies.length}
            />
          </PageTransition>
        )}

        {currentPage === 'comparison' && (
          <PageTransition key="comparison">
            <PolicyUpload
              onPoliciesAnalyzed={handlePoliciesAnalyzed}
              onBack={handleBackToHome}
              onViewPolicyDetail={handleViewPolicyDetail}
            />
          </PageTransition>
        )}

        {currentPage === 'policyDetail' && selectedPolicy && (
          <PageTransition key="policyDetail">
            <PolicyDetailView
              policy={selectedPolicy}
              onBack={handleBackFromDetail}
            />
          </PageTransition>
        )}

        {currentPage === 'dashboard' && (
          <PageTransition key="dashboard">
            <PolicyDashboard
              uploadedPolicies={dashboardPolicies}
              onUploadPolicy={() => setCurrentPage('comparison')}
              onViewPolicy={handleViewPolicy}
              onEditPolicy={handleEditPolicy}
              onDeletePolicy={handleDeletePolicy}
              onBack={handleBackToHome}
            />
          </PageTransition>
        )}

        {currentPage === 'chat' && (
          <PageTransition key="chat">
            <PolicyChat
              uploadedPolicies={dashboardPolicies}
              onBack={handleBackToHome}
            />
          </PageTransition>
        )}

        {currentPage === 'myAccount' && (
          <PageTransition key="myAccount">
            <MyAccount onBack={handleBackToHome} />
          </PageTransition>
        )}

        {currentPage === 'settings' && (
          <PageTransition key="settings">
            <Settings onBack={handleBackToHome} />
          </PageTransition>
        )}

        {currentPage === 'helpCenter' && (
          <PageTransition key="helpCenter">
            <HelpCenter
              onBack={handleBackToHome}
              onNavigateToChat={handleNavigateToChat}
            />
          </PageTransition>
        )}

        {currentPage === 'allSamplesDemo' && (
          <PageTransition key="allSamplesDemo">
            <AllSamplesDemo onBack={handleBackToHome} />
          </PageTransition>
        )}
        </AnimatePresence>
      </main>
    </ErrorBoundary>
  )
}
