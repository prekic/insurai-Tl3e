import { lazy, Suspense, memo } from 'react'
import { Hero } from './landing/Hero'
import { Stats } from './landing/Stats'
import { TrustedProviders } from './landing/TrustedProviders'
import { StickyMobileCTA } from './landing/StickyMobileCTA'
import { LazySection } from '@/hooks/useLazySection'

// Lazy load below-the-fold sections for better FCP/LCP
const HowItWorks = lazy(() => import('./landing/HowItWorks').then(m => ({ default: m.HowItWorks })))
const PolicyComparisonSection = lazy(() => import('./landing/PolicyComparisonSection').then(m => ({ default: m.PolicyComparisonSection })))
const Benefits = lazy(() => import('./landing/Benefits').then(m => ({ default: m.Benefits })))
const WhoItsFor = lazy(() => import('./landing/WhoItsFor').then(m => ({ default: m.WhoItsFor })))
const WhyChooseUs = lazy(() => import('./landing/WhyChooseUs').then(m => ({ default: m.WhyChooseUs })))
const Testimonials = lazy(() => import('./landing/Testimonials').then(m => ({ default: m.Testimonials })))
const CompareSection = lazy(() => import('./landing/CompareSection').then(m => ({ default: m.CompareSection })))
const FAQ = lazy(() => import('./landing/FAQ').then(m => ({ default: m.FAQ })))
const Footer = lazy(() => import('./landing/Footer').then(m => ({ default: m.Footer })))

// Minimal skeleton for lazy sections
function SectionSkeleton() {
  return (
    <div className="py-16 px-4 bg-gray-50 animate-pulse">
      <div className="max-w-4xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto mb-8" />
        <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto mb-4" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
      </div>
    </div>
  )
}

// Memoized to prevent unnecessary re-renders
export const LandingPage = memo(function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Above-the-fold content - loads immediately */}
      <Hero />
      <Stats />
      <TrustedProviders />

      {/* Below-the-fold content - lazy loaded when scrolled into view */}
      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="500px" rootMargin="200px">
          <HowItWorks />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="600px" rootMargin="200px">
          <PolicyComparisonSection />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="500px" rootMargin="200px">
          <Benefits />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="400px" rootMargin="200px">
          <WhoItsFor />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="400px" rootMargin="200px">
          <WhyChooseUs />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="400px" rootMargin="200px">
          <Testimonials />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="500px" rootMargin="200px">
          <CompareSection />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="500px" rootMargin="200px">
          <FAQ />
        </LazySection>
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="300px" rootMargin="200px">
          <Footer />
        </LazySection>
      </Suspense>

      {/* Sticky mobile CTA - appears after scrolling past hero */}
      <StickyMobileCTA />
    </div>
  )
})
