/**
 * PolicyDetailView Component Tests
 *
 * Tests for the policy detail view page including policy display,
 * coverage details, exclusions, AI insights, and market comparison.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PolicyDetailView } from './PolicyDetailView'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock hooks and dependencies
const mockNavigate = vi.fn()

const mockPolicy: AnalyzedPolicy = {
  id: 'policy-1',
  policyNumber: 'POL-TEST-001',
  provider: 'Test Insurance Co',
  typeTr: 'Konut Sigortası',
  type: 'home',
  coverage: 500000,
  premium: 2500,
  deductible: 1000,
  startDate: '2024-01-01',
  expiryDate: '2025-01-01',
  status: 'active',
  insuredPerson: 'John Doe',
  documentType: 'policy',
  uploadDate: '2024-01-15',
  logo: '🏠',
  fileName: 'policy.pdf',
  location: 'Istanbul, Turkey',
  coverages: [
    { name: 'Fire', nameTr: 'Yangın', included: true, limit: 500000, deductible: 500 },
    { name: 'Theft', nameTr: 'Hırsızlık', included: true, limit: 100000, deductible: 1000 },
    { name: 'Flood', nameTr: 'Sel', included: false, limit: 0, deductible: 0 },
  ],
  exclusions: ['War damage', 'Nuclear events', 'Intentional damage'],
  specialConditions: ['24-hour monitoring required'],
  insuranceLine: 'Property',
  aiConfidence: 0.95,
  aiInsights: ['Good coverage for standard risks', 'Consider adding flood coverage'],
  monthlyPremium: 208,
  marketComparison: {
    averagePremium: 3000,
    averageCoverage: 100000,
    percentile: 25,
  },
}

const mockGetPolicyById = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    getPolicyById: mockGetPolicyById,
  }),
}))

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils')
  return {
    ...actual,
    formatCurrency: (amount: number) => `₺${amount.toLocaleString()}`,
    formatDate: (date: string) => new Date(date).toLocaleDateString('tr-TR'),
  }
})

vi.mock('./PolicyDocuments', () => ({
  PolicyDocuments: ({ policyId }: { policyId: string }) => (
    <div data-testid="policy-documents">Documents for {policyId}</div>
  ),
}))

function renderPolicyDetailView(policyId = 'policy-1') {
  return render(
    <MemoryRouter initialEntries={[`/policy/${policyId}`]}>
      <Routes>
        <Route path="/policy/:id" element={<PolicyDetailView />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PolicyDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPolicyById.mockReturnValue(mockPolicy)
  })

  describe('Policy Not Found', () => {
    it('should render not found message when policy does not exist', () => {
      mockGetPolicyById.mockReturnValue(undefined)
      renderPolicyDetailView('nonexistent-id')

      expect(screen.getByText('Policy not found')).toBeInTheDocument()
      expect(screen.getByText("The policy you're looking for doesn't exist.")).toBeInTheDocument()
    })

    it('should show Go to Dashboard button when policy not found', () => {
      mockGetPolicyById.mockReturnValue(undefined)
      renderPolicyDetailView('nonexistent-id')

      expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
    })

    it('should navigate to dashboard when button is clicked', async () => {
      mockGetPolicyById.mockReturnValue(undefined)
      const user = userEvent.setup()
      renderPolicyDetailView('nonexistent-id')

      await user.click(screen.getByRole('button', { name: /go to dashboard/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  describe('Policy Header', () => {
    it('should render provider name', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Test Insurance Co')).toBeInTheDocument()
    })

    it('should render policy number', () => {
      renderPolicyDetailView()

      expect(screen.getByText('POL-TEST-001')).toBeInTheDocument()
    })

    it('should render policy logo', () => {
      renderPolicyDetailView()

      expect(screen.getByText('🏠')).toBeInTheDocument()
    })

    it('should render Share and Download buttons', () => {
      renderPolicyDetailView()

      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
    })

    it('should navigate back when back button is clicked', async () => {
      const user = userEvent.setup()
      renderPolicyDetailView()

      const backButton = document.querySelector('button[class*="hover:bg-white"]')
      await user.click(backButton!)

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe('Policy Overview', () => {
    it('should render Policy Overview section', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Policy Overview')).toBeInTheDocument()
    })

    it('should display policy type', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Policy Type')).toBeInTheDocument()
      expect(screen.getByText('Konut Sigortası')).toBeInTheDocument()
    })

    it('should display insured person', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Insured Person')).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('should display location', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Location')).toBeInTheDocument()
      expect(screen.getByText('Istanbul, Turkey')).toBeInTheDocument()
    })

    it('should display coverage limit', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Coverage Limit')).toBeInTheDocument()
      expect(screen.getAllByText('₺500,000').length).toBeGreaterThan(0)
    })

    it('should display annual premium', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Annual Premium')).toBeInTheDocument()
      expect(screen.getAllByText('₺2,500').length).toBeGreaterThan(0)
    })

    it('should display deductible', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Deductible')).toBeInTheDocument()
      expect(screen.getByText('₺1,000')).toBeInTheDocument()
    })

    it('should show N/A when insured person is not provided', () => {
      mockGetPolicyById.mockReturnValue({ ...mockPolicy, insuredPerson: undefined })
      renderPolicyDetailView()

      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('should show N/A when location is not provided', () => {
      mockGetPolicyById.mockReturnValue({ ...mockPolicy, location: undefined })
      renderPolicyDetailView()

      expect(screen.getAllByText('N/A')).toHaveLength(1)
    })
  })

  describe('Coverage Details', () => {
    it('should render Coverage Details section', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Coverage Details')).toBeInTheDocument()
    })

    it('should display included coverages', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Fire')).toBeInTheDocument()
      expect(screen.getByText('Yangın')).toBeInTheDocument()
      expect(screen.getByText('Theft')).toBeInTheDocument()
      expect(screen.getByText('Hırsızlık')).toBeInTheDocument()
    })

    it('should display non-included coverages', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Flood')).toBeInTheDocument()
      expect(screen.getByText('Sel')).toBeInTheDocument()
    })

    it('should display coverage limits', () => {
      renderPolicyDetailView()

      // Multiple elements may have the same coverage amount
      expect(screen.getAllByText('₺500,000').length).toBeGreaterThan(0)
      expect(screen.getByText('₺100,000')).toBeInTheDocument()
    })

    it('should display coverage deductibles', () => {
      renderPolicyDetailView()

      // Look for deductible text that includes specific amounts
      expect(screen.getAllByText(/Deductible:/).length).toBeGreaterThan(0)
    })

    it('should apply green background for included coverages', () => {
      renderPolicyDetailView()

      const fireSection = screen.getByText('Fire').closest('[class*="rounded-xl"]')
      expect(fireSection?.className).toContain('bg-green-50')
    })

    it('should apply gray background for non-included coverages', () => {
      renderPolicyDetailView()

      const floodSection = screen.getByText('Flood').closest('[class*="rounded-xl"]')
      expect(floodSection?.className).toContain('bg-gray-50')
    })
  })

  describe('Exclusions', () => {
    it('should render Exclusions section', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Exclusions')).toBeInTheDocument()
    })

    it('should display all exclusions', () => {
      renderPolicyDetailView()

      expect(screen.getByText('War damage')).toBeInTheDocument()
      expect(screen.getByText('Nuclear events')).toBeInTheDocument()
      expect(screen.getByText('Intentional damage')).toBeInTheDocument()
    })
  })

  describe('Status Card', () => {
    it('should display Active badge for active policies', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('should display Expiring Soon badge for expiring policies', () => {
      mockGetPolicyById.mockReturnValue({ ...mockPolicy, status: 'expiring' })
      renderPolicyDetailView()

      expect(screen.getByText('Expiring Soon')).toBeInTheDocument()
    })

    it('should display start and expiry dates', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Start Date')).toBeInTheDocument()
      expect(screen.getByText('Expiry Date')).toBeInTheDocument()
    })
  })

  describe('Policy Documents', () => {
    it('should render PolicyDocuments component', () => {
      renderPolicyDetailView()

      expect(screen.getByTestId('policy-documents')).toBeInTheDocument()
      expect(screen.getByText('Documents for policy-1')).toBeInTheDocument()
    })
  })

  describe('AI Insights', () => {
    it('should render AI Insights section', () => {
      renderPolicyDetailView()

      expect(screen.getByText('AI Insights')).toBeInTheDocument()
    })

    it('should display AI confidence percentage', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Confidence:')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
    })

    it('should display all AI insights', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Good coverage for standard risks')).toBeInTheDocument()
      expect(screen.getByText('Consider adding flood coverage')).toBeInTheDocument()
    })
  })

  describe('Market Comparison', () => {
    it('should render Market Comparison section when data is available', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Market Comparison')).toBeInTheDocument()
    })

    it('should display market average premium', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Market Avg')).toBeInTheDocument()
      expect(screen.getByText('₺3,000')).toBeInTheDocument()
    })

    it('should display percentile comparison', () => {
      renderPolicyDetailView()

      expect(screen.getByText('Market Percentile')).toBeInTheDocument()
      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('should show below average indicator when premium is lower', () => {
      renderPolicyDetailView()

      expect(screen.getByText(/below average/i)).toBeInTheDocument()
    })

    it('should not render Market Comparison when data is not available', () => {
      mockGetPolicyById.mockReturnValue({ ...mockPolicy, marketComparison: undefined })
      renderPolicyDetailView()

      expect(screen.queryByText('Market Comparison')).not.toBeInTheDocument()
    })
  })

  describe('Premium Comparison', () => {
    it('should not show below average when premium is equal to market average', () => {
      mockGetPolicyById.mockReturnValue({
        ...mockPolicy,
        premium: 3000, // Same as average
        marketComparison: { averagePremium: 3000, percentile: 50, similarPolicies: 100 },
      })
      renderPolicyDetailView()

      expect(screen.queryByText(/below average/i)).not.toBeInTheDocument()
    })

    it('should not show below average when premium is higher than market average', () => {
      mockGetPolicyById.mockReturnValue({
        ...mockPolicy,
        premium: 4000, // Higher than average
        marketComparison: { averagePremium: 3000, percentile: 75, similarPolicies: 100 },
      })
      renderPolicyDetailView()

      expect(screen.queryByText(/below average/i)).not.toBeInTheDocument()
    })
  })
})

describe('PolicyDetailView Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle policy with no coverages', () => {
    mockGetPolicyById.mockReturnValue({ ...mockPolicy, coverages: [] })
    renderPolicyDetailView()

    expect(screen.getByText('Coverage Details')).toBeInTheDocument()
  })

  it('should handle policy with no exclusions', () => {
    mockGetPolicyById.mockReturnValue({ ...mockPolicy, exclusions: [] })
    renderPolicyDetailView()

    expect(screen.getByText('Exclusions')).toBeInTheDocument()
  })

  it('should handle policy with no AI insights', () => {
    mockGetPolicyById.mockReturnValue({ ...mockPolicy, aiInsights: [] })
    renderPolicyDetailView()

    expect(screen.getByText('AI Insights')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument() // Still shows confidence
  })

  it('should handle coverage without deductible', () => {
    mockGetPolicyById.mockReturnValue({
      ...mockPolicy,
      coverages: [
        { name: 'Basic', nameTr: 'Temel', included: true, limit: 100000, deductible: 0 },
      ],
    })
    renderPolicyDetailView()

    expect(screen.queryByText('Deductible: ₺0')).not.toBeInTheDocument()
  })
})
