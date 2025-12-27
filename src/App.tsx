import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
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

export default function App() {
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
    setAnalyzedPolicies((prev) => prev.filter((p) => p.id !== policyId))
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

  return (
    <>
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
    </>
  )
}
