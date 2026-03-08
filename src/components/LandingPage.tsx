import { Suspense, memo } from 'react'
import { lazyRetry } from '@/utils/lazyRetry'
import { Hero } from './landing/Hero'
import { Stats } from './landing/Stats'
import { TrustedProviders } from './landing/TrustedProviders'
import { StickyMobileCTA } from './landing/StickyMobileCTA'
import { LazySection } from '@/hooks/useLazySection'

// Lazy load below-the-fold sections for better FCP/LCP
const HowItWorks = lazyRetry(
  () => import('./landing/HowItWorks').then((m) => ({ default: m.HowItWorks })),
  'HowItWorks'
)
const PolicyComparisonSection = lazyRetry(
  () =>
    import('./landing/PolicyComparisonSection').then((m) => ({
      default: m.PolicyComparisonSection,
    })),
  'PolicyComparisonSection'
)
const Benefits = lazyRetry(
  () => import('./landing/Benefits').then((m) => ({ default: m.Benefits })),
  'Benefits'
)
const WhoItsFor = lazyRetry(
  () => import('./landing/WhoItsFor').then((m) => ({ default: m.WhoItsFor })),
  'WhoItsFor'
)
const WhyChooseUs = lazyRetry(
  () => import('./landing/WhyChooseUs').then((m) => ({ default: m.WhyChooseUs })),
  'WhyChooseUs'
)
const Testimonials = lazyRetry(
  () => import('./landing/Testimonials').then((m) => ({ default: m.Testimonials })),
  'Testimonials'
)
const CompareSection = lazyRetry(
  () => import('./landing/CompareSection').then((m) => ({ default: m.CompareSection })),
  'CompareSection'
)
const FAQ = lazyRetry(() => import('./landing/FAQ').then((m) => ({ default: m.FAQ })), 'FAQ')
const Footer = lazyRetry(
  () => import('./landing/Footer').then((m) => ({ default: m.Footer })),
  'Footer'
)

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

      {/* PolicyComparisonSection hidden on mobile — hero ComparisonMock already demonstrates the feature */}
      <div className="hidden md:block">
        <Suspense fallback={<SectionSkeleton />}>
          <LazySection height="600px" rootMargin="200px">
            <PolicyComparisonSection />
          </LazySection>
        </Suspense>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="500px" rootMargin="200px">
          <Benefits />
        </LazySection>
      </Suspense>

      {/* WhoItsFor hidden on mobile — audience targeting now covered by Testimonials use cases */}
      <div className="hidden md:block">
        <Suspense fallback={<SectionSkeleton />}>
          <LazySection height="400px" rootMargin="200px">
            <WhoItsFor />
          </LazySection>
        </Suspense>
      </div>

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

      {/* Bottom CTA — visible on all screens to capture scroll-through users */}
      <Suspense fallback={<SectionSkeleton />}>
        <LazySection height="300px" rootMargin="200px">
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
