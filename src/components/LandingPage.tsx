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

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Stats />
      <HowItWorks />
      <PolicyComparisonSection />
      <Benefits />
      <WhoItsFor />
      <WhyChooseUs />
      <Testimonials />
      <CompareSection />
      <FAQ />
      <Footer />
    </div>
  )
}
