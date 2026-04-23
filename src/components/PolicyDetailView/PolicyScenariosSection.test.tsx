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
})
