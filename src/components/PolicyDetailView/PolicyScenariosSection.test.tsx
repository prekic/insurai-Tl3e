import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PolicyScenariosSection } from './PolicyScenariosSection'
import type { ScenarioCard } from '@/lib/policy-evaluation/types'

vi.mock('@/lib/i18n/i18n-context', async () => {
  const { EN_TRANSLATIONS } = await vi.importActual<typeof import('@/lib/i18n/translations-en')>(
    '@/lib/i18n/translations-en'
  )
  return {
    useI18n: () => ({
      t: EN_TRANSLATIONS,
      locale: 'en',
      isLoading: false,
      translate: (key: string) => key,
      setLocale: vi.fn(),
      availableLocales: ['en', 'tr'],
      dynamicLocales: [],
      progress: { loaded: 1, total: 1 },
    }),
  }
})

const coveredScenario: ScenarioCard = {
  id: 's-covered',
  title: 'Collision Covered',
  titleTR: 'Çarpma Kapsamda',
  description: 'Standard collision with another vehicle.',
  descriptionTR: 'Başka bir araçla çarpışma.',
  financialStatus: 'covered',
  insurerPays: 'Full repair cost',
  userPays: '₺1,500 deductible',
  trigger: 'Rear-end collision at intersection',
  whyItMatters: 'Typical urban driving exposure',
  riskAmount: '₺35,000 potential loss',
}

const riskScenario: ScenarioCard = {
  id: 's-risk',
  title: 'Flood Uncovered',
  titleTR: 'Sel Kapsam Dışı',
  description: 'Storm-related flood damage to the vehicle.',
  descriptionTR: 'Fırtına kaynaklı sel hasarı.',
  financialStatus: 'risk',
  userPays: 'Full vehicle replacement cost',
  trigger: 'Flash flood in parking garage',
  whyItMatters: 'Uncovered in this policy; urgent gap',
  riskAmount: '₺120,000 potential loss',
}

const partialScenario: ScenarioCard = {
  id: 's-partial',
  title: 'Hailstorm Partial',
  titleTR: 'Dolu Kısmi',
  description: 'Hailstorm hood damage.',
  descriptionTR: 'Dolu hasarı.',
  financialStatus: 'partially_covered',
  insurerPays: 'Up to policy sub-limit',
  userPays: 'Remainder above sub-limit',
  riskAmount: '₺8,000 out-of-pocket',
}

describe('PolicyScenariosSection', () => {
  it('returns null when scenarios is undefined', () => {
    const { container } = render(<PolicyScenariosSection scenarios={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when scenarios is empty', () => {
    const { container } = render(<PolicyScenariosSection scenarios={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders only the Risk group when every scenario is uncovered', () => {
    render(<PolicyScenariosSection scenarios={[riskScenario]} />)
    expect(screen.getByText('Scenario Risk Analysis')).toBeInTheDocument()
    expect(screen.queryByText(/Covered Scenarios/i)).not.toBeInTheDocument()
    expect(screen.getByText('Flood Uncovered')).toBeInTheDocument()
  })

  it('renders only the Covered group when every scenario is covered', () => {
    render(<PolicyScenariosSection scenarios={[coveredScenario]} />)
    expect(screen.queryByText('Scenario Risk Analysis')).not.toBeInTheDocument()
    expect(screen.getByText('Collision Covered')).toBeInTheDocument()
  })

  it('partitions scenarios into Risk and Covered groups', () => {
    render(<PolicyScenariosSection scenarios={[coveredScenario, riskScenario, partialScenario]} />)
    expect(screen.getByText('Scenario Risk Analysis')).toBeInTheDocument()
    expect(screen.getByText('Flood Uncovered')).toBeInTheDocument()
    expect(screen.getByText('Hailstorm Partial')).toBeInTheDocument()
    expect(screen.getByText('Collision Covered')).toBeInTheDocument()
  })

  it('shows partial_covered scenarios inside the Risk group, not Covered', () => {
    render(<PolicyScenariosSection scenarios={[partialScenario]} />)
    // Partial counts as risk (not covered) per the filter predicate.
    expect(screen.getByText('Scenario Risk Analysis')).toBeInTheDocument()
    expect(screen.queryByText(/Covered Scenarios/i)).not.toBeInTheDocument()
    expect(screen.getByText('Hailstorm Partial')).toBeInTheDocument()
  })

  it('renders all scenario metadata rows when present', () => {
    render(<PolicyScenariosSection scenarios={[coveredScenario]} />)
    expect(screen.getByText('Insurer Pays:')).toBeInTheDocument()
    expect(screen.getByText('Full repair cost')).toBeInTheDocument()
    expect(screen.getByText('User Pays:')).toBeInTheDocument()
    expect(screen.getByText('₺1,500 deductible')).toBeInTheDocument()
    expect(screen.getByText('Trigger:')).toBeInTheDocument()
    expect(screen.getByText('Typical urban driving exposure')).toBeInTheDocument()
    expect(screen.getByText('₺35,000 potential loss')).toBeInTheDocument()
  })

  it('omits metadata rows when their fields are absent', () => {
    const minimal: ScenarioCard = {
      id: 's-min',
      title: 'Sparse',
      titleTR: 'Seyrek',
      description: 'Only title/desc.',
      descriptionTR: 'Sadece başlık.',
      financialStatus: 'covered',
    }
    render(<PolicyScenariosSection scenarios={[minimal]} />)
    expect(screen.getByText('Sparse')).toBeInTheDocument()
    expect(screen.queryByText('Insurer Pays:')).not.toBeInTheDocument()
    expect(screen.queryByText('User Pays:')).not.toBeInTheDocument()
    expect(screen.queryByText('Trigger:')).not.toBeInTheDocument()
  })

  it('renders nothing when isUnverified is true, even with populated scenarios', () => {
    // Reviewer feedback (Apr 24): when the extraction completeness gate fires,
    // scenarios computed from incomplete data can be misleading. Suppress
    // entirely rather than dimming — half-gating is the bug we're fixing.
    const { container } = render(
      <PolicyScenariosSection
        scenarios={[riskScenario, coveredScenario, partialScenario]}
        isUnverified
      />
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Flood Uncovered')).not.toBeInTheDocument()
    expect(screen.queryByText('Collision Covered')).not.toBeInTheDocument()
    expect(screen.queryByText('Scenario Risk Analysis')).not.toBeInTheDocument()
  })

  it('renders scenarios when isUnverified is false (default behaviour)', () => {
    render(<PolicyScenariosSection scenarios={[riskScenario]} isUnverified={false} />)
    expect(screen.getByText('Flood Uncovered')).toBeInTheDocument()
  })

  // ── Phase 2 follow-up: render-contract for the IMM carve-out caveat ─
  //
  // The original Phase 2 plan called for an E2E test (`render-contract.spec.ts`
  // test #4) verifying that an unlimited coverage with `carveOuts` populated
  // produces a `[data-testid="scenario-caveat"]` DOM element. That test was
  // skipped in commit 9e4e7a9 because the test environment unavoidably hits
  // the hardcoded benchmark fallback (`benchmarkStatus: 'untrusted'`), which
  // flips `evaluation.isProvisional = true` → `isUnverified = true` →
  // `PolicyScenariosSection` returns null. The benchmark cache populates
  // asynchronously after `evaluatePolicy()` already returned, so a Playwright
  // route mock can't resolve the timing.
  //
  // At the component level the contract is still trivially testable: pass a
  // ScenarioCard with `caveat` populated and assert the DOM. This catches
  // the same regression class — "data has caveat → DOM has caveat row" —
  // without the benchmark-cache E2E plumbing. The full E2E variant remains
  // documented in the spec file as a known-skip with rationale.
  describe('Render-contract — carve-out caveat', () => {
    const carveOutScenario: ScenarioCard = {
      id: 's-imm',
      title: 'At-Fault Major Accident',
      titleTR: 'Kusurlu Büyük Kazada',
      description: 'IMM Sınırsız scenario.',
      descriptionTR: 'IMM Sınırsız senaryosu.',
      financialStatus: 'covered',
      insurerPays: 'Unlimited',
      userPays: '0 TL',
      caveat:
        'Capped at 2,500,000 TL per event at airports, ports, fuel depots, refineries, and similar high-exposure locations.',
      caveatTR:
        'Havalimanı, liman, akaryakıt depoları, rafineri ve benzeri yerlerde olay başı 2.500.000 TL üst sınırı uygulanır.',
    }

    it('renders [data-testid="scenario-caveat"] when caveat is populated', () => {
      render(<PolicyScenariosSection scenarios={[carveOutScenario]} />)
      const caveats = screen.getAllByTestId('scenario-caveat')
      expect(caveats).toHaveLength(1)
    })

    it('caveat text includes the qualifying amount AND location keyword', () => {
      // Sanity guard: a generic / empty caveat pill defeats the purpose.
      // The IMM detector in `evaluator.ts:detectImmCarveOut` always populates
      // either the full bilingual string (location + amount) or the hedged
      // location-only fallback. This test catches the regression where the
      // caveat exists but its CONTENT lost the safety signal.
      render(<PolicyScenariosSection scenarios={[carveOutScenario]} />)
      const caveat = screen.getByTestId('scenario-caveat')
      const text = caveat.textContent ?? ''
      const hasAmount = /2,?500,?000|2[,.]?5\s*milyon/i.test(text)
      const hasLocation =
        /airports?|ports?|fuel\s*depots?|refineries?|havaliman|liman|akaryak/i.test(text)
      expect(hasAmount).toBe(true)
      expect(hasLocation).toBe(true)
    })

    it('does NOT render a caveat row when scenario has no caveat fields', () => {
      // coveredScenario has neither `caveat` nor `caveatTR`.
      render(<PolicyScenariosSection scenarios={[coveredScenario]} />)
      expect(screen.queryByTestId('scenario-caveat')).not.toBeInTheDocument()
    })

    it('renders one caveat row per scenario with caveat (count contract)', () => {
      const second: ScenarioCard = {
        ...carveOutScenario,
        id: 's-imm-2',
        title: 'Secondary IMM Scenario',
        titleTR: 'İkinci IMM Senaryosu',
      }
      render(<PolicyScenariosSection scenarios={[carveOutScenario, second, coveredScenario]} />)
      // 2 scenarios with caveat + 1 without → exactly 2 caveat rows in DOM.
      expect(screen.getAllByTestId('scenario-caveat')).toHaveLength(2)
    })

    it('caveat block carries role="note" for screen readers', () => {
      render(<PolicyScenariosSection scenarios={[carveOutScenario]} />)
      const caveat = screen.getByTestId('scenario-caveat')
      expect(caveat).toHaveAttribute('role', 'note')
    })

    it('SUPPRESSED when isUnverified=true (regression test for the half-gate)', () => {
      // Mirror of the existing "renders nothing when isUnverified is true"
      // test, but specifically asserting that the caveat doesn't leak through.
      // This catches the case where a future change might bypass the
      // top-level isUnverified return for some "important safety info" reason
      // and silently surface caveats from incomplete extractions.
      const { container } = render(
        <PolicyScenariosSection scenarios={[carveOutScenario]} isUnverified />
      )
      expect(container.firstChild).toBeNull()
      expect(screen.queryByTestId('scenario-caveat')).not.toBeInTheDocument()
    })
  })
})
