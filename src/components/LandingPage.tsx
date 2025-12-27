import { Hero } from './landing/Hero'
import { Stats } from './landing/Stats'
import { HowItWorks } from './landing/HowItWorks'
import { Benefits } from './landing/Benefits'
import { WhyChooseUs } from './landing/WhyChooseUs'
import { Testimonials } from './landing/Testimonials'
import { CompareSection } from './landing/CompareSection'
import { FAQ } from './landing/FAQ'
import { Footer } from './landing/Footer'
import { PolicyComparisonSection } from './landing/PolicyComparisonSection'
import { WhoItsFor } from './landing/WhoItsFor'

type Policy = {
  id: string
  name: string
  provider: string
  type: string
  premium: number
  coverage: number
  deductible: number
  uploadedAt: Date
}

interface LandingPageProps {
  onPoliciesUploaded: (policies: Policy[]) => void
  onNavigateToComparison: () => void
  onNavigateToUpload: () => void
  onNavigateToDashboard?: () => void
  onNavigateToChat?: () => void
  onNavigateToHelpCenter?: () => void
  onNavigateToMyAccount?: () => void
  onNavigateToSettings?: () => void
  onNavigateToLanding?: () => void
  onNavigateToAllSamplesDemo?: () => void
  policyCount?: number
}

export function LandingPage({
  onPoliciesUploaded,
  onNavigateToComparison,
  onNavigateToUpload,
  onNavigateToDashboard,
  onNavigateToChat,
  onNavigateToHelpCenter,
  onNavigateToMyAccount,
  onNavigateToSettings,
  onNavigateToLanding,
  onNavigateToAllSamplesDemo,
  policyCount = 0
}: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <Hero
        onPoliciesUploaded={onPoliciesUploaded}
        onNavigateToComparison={onNavigateToComparison}
        onNavigateToUpload={onNavigateToUpload}
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToChat={onNavigateToChat}
        onNavigateToHelpCenter={onNavigateToHelpCenter}
        onNavigateToMyAccount={onNavigateToMyAccount}
        onNavigateToSettings={onNavigateToSettings}
        onNavigateToLanding={onNavigateToLanding}
        onNavigateToAllSamplesDemo={onNavigateToAllSamplesDemo}
        policyCount={policyCount}
      />
      <Stats />
      <HowItWorks />
      <PolicyComparisonSection />
      <Benefits />
      <WhoItsFor />
      <WhyChooseUs />
      <Testimonials />
      <CompareSection onPoliciesUploaded={onPoliciesUploaded} onNavigateToUpload={onNavigateToUpload} />
      <FAQ />
      <Footer />
    </div>
  )
}
