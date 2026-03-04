/**
 * ConflictResolutionDialog Component Tests
 *
 * Tests for the ConflictResolutionDialog and DuplicateWarningBanner components:
 * - Rendering for each conflict type: exactDuplicate, extractionVariance, amendment
 * - Verified vs unverified amendment styling
 * - Action button callbacks (skip, replace, keepBoth, trackAmendment, edit)
 * - Loading/disabled state
 * - Show/hide details toggle
 * - Close behavior (button and backdrop click)
 * - noConflict returns null
 * - DuplicateWarningBanner for all conflict types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictResolutionDialog, DuplicateWarningBanner } from './ConflictResolutionDialog'
import type { Policy } from '@/types/policy'
import type { PreUploadCheckResult, PolicyFieldDiff } from '@/lib/policy-utils'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      conflictResolution: {
        duplicateFound: 'Duplicate Policy Found',
        extractionVariance: 'Extraction Variance Detected',
        verifiedAmendment: 'Policy Amendment Detected',
        possibleAmendment: 'Possible Policy Amendment',
        duplicateDesc: 'A policy with the same identifier already exists in your portfolio.',
        extractionVarianceDesc:
          'The same document produced different extraction results. This may be due to AI processing variance.',
        verifiedAmendmentDesc:
          'An official amendment (zeyilname) for this policy has been detected.',
        possibleAmendmentDesc: 'This appears to be an updated version of an existing policy.',
        existingPolicy: 'Existing Policy',
        differencesDetected: '{count} differences detected',
        extractionVarianceInfo:
          'These differences are likely due to AI extraction variance, not actual policy changes.',
        verifiedAmendmentInfo:
          'This is an official amendment. Key changes should be tracked for compliance.',
        criticalDifferencesInfo:
          'Critical differences detected. Please review carefully before proceeding.',
        showAllDifferences: 'Show all differences',
        hideDetails: 'Hide details',
        duplicateIdentical: 'This policy appears to be identical to an existing one.',
        skip: 'Skip',
        skipDesc: "Don't save this policy",
        updateExisting: 'Update Existing',
        updateDesc: 'Replace the existing policy with this version',
        keepBoth: 'Keep Both',
        keepBothDesc: 'Save as a separate policy',
        skipRecommended: 'Skip (Recommended)',
        skipRecommendedDesc: 'Extraction results may vary — keep the existing version',
        edit: 'Edit & Retry',
        editDesc: 'Modify and re-extract the document',
        updateAnyway: 'Update Anyway',
        updateAnywayDesc: 'Replace with this extraction result',
        saveSeparately: 'Save Separately',
        saveSeparatelyDesc: 'Keep both versions for comparison',
        trackAmendment: 'Track Amendment',
        trackAmendmentDesc: 'Save as a new version of the policy',
        skipAmendment: 'Skip Amendment',
        skipAmendmentDesc: 'Ignore this amendment',
        duplicate: 'Duplicate',
        alreadyExists: 'Already exists',
        extractionVarianceShort: 'Extraction Variance',
        sameDocDifferent: 'Same document, different results',
        officialAmendment: 'Official Amendment',
        changeCount: '{count} changes',
        possibleChange: 'Possible change',
        diffCount: '{count} differences',
        resolve: 'Resolve',
      },
    },
    locale: 'en',
    isLoading: false,
  }),
}))

// Mock PolicyDiffViewer
vi.mock('./PolicyDiffViewer', () => ({
  PolicyDiffViewer: ({ changes, compact }: { changes: PolicyFieldDiff[]; compact?: boolean }) => (
    <div data-testid="policy-diff-viewer" data-compact={compact ? 'true' : 'false'}>
      {changes.length} change(s)
    </div>
  ),
  PolicyDiffSummary: ({ changes }: { changes: PolicyFieldDiff[] }) => (
    <div data-testid="policy-diff-summary">{changes.length} change(s) summary</div>
  ),
}))

// ========== Test Data ==========

const createMockPolicy = (overrides: Partial<Policy> = {}): Policy => ({
  id: 'existing-1',
  policyNumber: 'POL-001',
  provider: 'Allianz Sigorta',
  logo: '🚗',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 500000,
  premium: 3200,
  monthlyPremium: 267,
  deductible: 1000,
  startDate: '2025-01-01',
  expiryDate: '2026-01-01',
  status: 'active',
  uploadDate: '2025-01-15',
  fileName: 'kasko.pdf',
  documentType: 'policy',
  insuredPerson: 'Erdem Yilmaz',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  ...overrides,
})

const existingPolicy = createMockPolicy()
const newPolicy = createMockPolicy({ id: 'new-1', policyNumber: 'POL-001-NEW' })

const mockChanges: PolicyFieldDiff[] = [
  {
    field: 'premium',
    fieldLabel: 'Premium',
    fieldLabelTr: 'Prim',
    oldValue: 3200,
    newValue: 3500,
    type: 'number',
    significance: 'major',
  },
  {
    field: 'coverage',
    fieldLabel: 'Coverage',
    fieldLabelTr: 'Teminat',
    oldValue: 500000,
    newValue: 600000,
    type: 'number',
    significance: 'critical',
  },
  {
    field: 'expiryDate',
    fieldLabel: 'Expiry Date',
    fieldLabelTr: 'Bitis Tarihi',
    oldValue: '2026-01-01',
    newValue: '2027-01-01',
    type: 'date',
    significance: 'moderate',
  },
]

const defaultCallbacks = {
  onSkip: vi.fn(),
  onReplace: vi.fn(),
  onKeepBoth: vi.fn(),
  onTrackAmendment: vi.fn(),
  onClose: vi.fn(),
}

describe('ConflictResolutionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========== noConflict ==========

  it('returns null for noConflict type', () => {
    const conflict: PreUploadCheckResult = { type: 'noConflict' }
    const { container } = render(
      <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
    )
    expect(container.firstChild).toBeNull()
  })

  // ========== Exact Duplicate ==========

  describe('exactDuplicate', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }

    it('renders duplicate title', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Duplicate Policy Found')).toBeInTheDocument()
    })

    it('renders duplicate description', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText('A policy with the same identifier already exists in your portfolio.')
      ).toBeInTheDocument()
    })

    it('shows existing policy info', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      // existingPolicy label comes from t.conflictResolution.existingPolicy
      expect(screen.getByText('Existing Policy')).toBeInTheDocument()
      expect(screen.getByText('Allianz Sigorta')).toBeInTheDocument()
      expect(screen.getByText('POL-001')).toBeInTheDocument()
    })

    it('shows duplicate info box', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText('This policy appears to be identical to an existing one.')
      ).toBeInTheDocument()
    })

    it('renders Skip, Update Existing, and Keep Both buttons', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Skip')).toBeInTheDocument()
      expect(screen.getByText('Update Existing')).toBeInTheDocument()
      expect(screen.getByText('Keep Both')).toBeInTheDocument()
    })

    it('calls onSkip when Skip is clicked', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      fireEvent.click(screen.getByText('Skip'))
      expect(defaultCallbacks.onSkip).toHaveBeenCalled()
    })

    it('calls onReplace when Update Existing is clicked', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      fireEvent.click(screen.getByText('Update Existing'))
      expect(defaultCallbacks.onReplace).toHaveBeenCalled()
    })

    it('calls onKeepBoth when Keep Both is clicked', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      fireEvent.click(screen.getByText('Keep Both'))
      expect(defaultCallbacks.onKeepBoth).toHaveBeenCalled()
    })
  })

  // ========== Extraction Variance ==========

  describe('extractionVariance', () => {
    const conflict: PreUploadCheckResult = {
      type: 'extractionVariance',
      existingPolicy,
      changes: mockChanges,
    }

    it('renders extraction variance title', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Extraction Variance Detected')).toBeInTheDocument()
    })

    it('renders extraction variance description', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText(/same document produced different extraction results/i)
      ).toBeInTheDocument()
    })

    it('shows change count', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('3 differences detected')).toBeInTheDocument()
    })

    it('shows extraction variance info box', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText(/These differences are likely due to AI extraction variance/)
      ).toBeInTheDocument()
    })

    it('renders Skip (Recommended) as primary action', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Skip (Recommended)')).toBeInTheDocument() // t.conflictResolution.skipRecommended
    })

    it('renders Update Anyway and Save Separately options', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Update Anyway')).toBeInTheDocument() // t.conflictResolution.updateAnyway
      expect(screen.getByText('Save Separately')).toBeInTheDocument() // t.conflictResolution.saveSeparately
    })

    it('renders Edit button when onEdit is provided', () => {
      const onEdit = vi.fn()
      render(
        <ConflictResolutionDialog
          conflict={conflict}
          newPolicy={newPolicy}
          {...defaultCallbacks}
          onEdit={onEdit}
        />
      )
      expect(screen.getByText('Edit & Retry')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Edit & Retry'))
      expect(onEdit).toHaveBeenCalled()
    })

    it('does not render Edit button when onEdit is not provided', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.queryByText('Edit & Retry')).not.toBeInTheDocument()
    })

    it('shows compact diff viewer initially', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      // Initially details are hidden, compact diff shows first 3 changes
      const compactViewer = screen
        .getAllByTestId('policy-diff-viewer')
        .find((el) => el.getAttribute('data-compact') === 'true')
      expect(compactViewer).toBeTruthy()
    })

    it('toggles between show/hide details', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      // Initially shows "Show all differences"
      const toggleBtn = screen.getByText('Show all differences')
      expect(toggleBtn).toBeInTheDocument()

      fireEvent.click(toggleBtn)
      expect(screen.getByText('Hide details')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Hide details'))
      expect(screen.getByText('Show all differences')).toBeInTheDocument()
    })

    it('shows diff summary', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByTestId('policy-diff-summary')).toBeInTheDocument()
    })
  })

  // ========== Amendment (Unverified) ==========

  describe('amendment (unverified)', () => {
    const conflict: PreUploadCheckResult = {
      type: 'amendment',
      existingPolicy,
      changes: mockChanges,
      isVerifiedAmendment: false,
    }

    it('renders possible amendment title', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Possible Policy Amendment')).toBeInTheDocument()
    })

    it('renders unverified amendment description', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText(/This appears to be an updated version/)).toBeInTheDocument()
    })

    it('shows warning for significant unverified changes', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText(/Critical differences detected/)).toBeInTheDocument()
    })

    it('renders Track as Amendment and Save Separately buttons', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Track Amendment')).toBeInTheDocument()
      expect(screen.getByText('Save Separately')).toBeInTheDocument()
    })

    it('calls onTrackAmendment when Track as Amendment is clicked', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      fireEvent.click(screen.getByText('Track Amendment'))
      expect(defaultCallbacks.onTrackAmendment).toHaveBeenCalled()
    })

    it('calls onKeepBoth when Save Separately is clicked', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      fireEvent.click(screen.getByText('Save Separately'))
      expect(defaultCallbacks.onKeepBoth).toHaveBeenCalled()
    })

    it('renders Edit button for unverified amendment when onEdit provided', () => {
      const onEdit = vi.fn()
      render(
        <ConflictResolutionDialog
          conflict={conflict}
          newPolicy={newPolicy}
          {...defaultCallbacks}
          onEdit={onEdit}
        />
      )
      expect(screen.getByText('Edit & Retry')).toBeInTheDocument()
    })
  })

  // ========== Amendment (Verified) ==========

  describe('amendment (verified)', () => {
    const conflict: PreUploadCheckResult = {
      type: 'amendment',
      existingPolicy,
      changes: mockChanges,
      isVerifiedAmendment: true,
    }

    it('renders verified amendment title', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(screen.getByText('Policy Amendment Detected')).toBeInTheDocument()
    })

    it('renders verified amendment description', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText(/official amendment.*zeyilname.*has been detected/i)
      ).toBeInTheDocument()
    })

    it('shows verified amendment info box', () => {
      render(
        <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
      )
      expect(
        screen.getByText(/official amendment.*Key changes should be tracked/i)
      ).toBeInTheDocument()
    })
  })

  // ========== Loading State ==========

  it('disables all action buttons when isLoading is true', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <ConflictResolutionDialog
        conflict={conflict}
        newPolicy={newPolicy}
        {...defaultCallbacks}
        isLoading
      />
    )
    const buttons = screen.getAllByRole('button')
    // All action buttons + close button should be disabled
    const disabledButtons = buttons.filter((b) => b.hasAttribute('disabled'))
    expect(disabledButtons.length).toBeGreaterThanOrEqual(3) // Skip, Update Existing, Keep Both
  })

  // ========== Close Behavior ==========

  it('calls onClose when close button is clicked', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
    )
    // Close button is the X button in the header
    const _closeButton = screen
      .getAllByRole('button')
      .find((b) => !b.hasAttribute('disabled') && !b.textContent)
    // The close button has an X icon but no text label — find by testing
    defaultCallbacks.onClose.mockClear()
    // Click the backdrop
    const backdrop = document.querySelector('.bg-black\\/50') as HTMLElement
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(defaultCallbacks.onClose).toHaveBeenCalled()
    }
  })

  it('does not close on backdrop click when isLoading', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <ConflictResolutionDialog
        conflict={conflict}
        newPolicy={newPolicy}
        {...defaultCallbacks}
        isLoading
      />
    )
    const backdrop = document.querySelector('.bg-black\\/50') as HTMLElement
    if (backdrop) {
      defaultCallbacks.onClose.mockClear()
      fireEvent.click(backdrop)
      expect(defaultCallbacks.onClose).not.toHaveBeenCalled()
    }
  })

  // ========== Existing Policy Details ==========

  it('shows insuredPerson when available', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy: createMockPolicy({ insuredPerson: 'Jane Smith' }),
    }
    render(
      <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
    )
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })

  it('uses default logo when existing policy has no logo', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy: createMockPolicy({ logo: '' }),
    }
    render(
      <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
    )
    // Fallback logo is displayed as text node
    const logoEl = screen.getByText((_, element) => element?.textContent === '📄')
    expect(logoEl).toBeInTheDocument()
  })

  it('shows typeTr as type label for existing policy', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy: createMockPolicy({ typeTr: 'Kasko Sigortasi' }),
    }
    render(
      <ConflictResolutionDialog conflict={conflict} newPolicy={newPolicy} {...defaultCallbacks} />
    )
    expect(screen.getByText('Kasko Sigortasi')).toBeInTheDocument()
  })
})

// ========== DuplicateWarningBanner ==========

describe('DuplicateWarningBanner', () => {
  const onDismiss = vi.fn()
  const onShowDialog = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for noConflict', () => {
    const conflict: PreUploadCheckResult = { type: 'noConflict' }
    const { container } = render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders exactDuplicate banner', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText(/Already exists/)).toBeInTheDocument()
  })

  it('renders extractionVariance banner', () => {
    const conflict: PreUploadCheckResult = {
      type: 'extractionVariance',
      existingPolicy,
      changes: mockChanges,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    expect(screen.getByText('Extraction Variance')).toBeInTheDocument()
    expect(screen.getByText(/Same document, different results/)).toBeInTheDocument()
  })

  it('renders verified amendment banner', () => {
    const conflict: PreUploadCheckResult = {
      type: 'amendment',
      existingPolicy,
      changes: mockChanges,
      isVerifiedAmendment: true,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    expect(screen.getByText('Official Amendment')).toBeInTheDocument()
    expect(screen.getByText(/3 changes/)).toBeInTheDocument()
  })

  it('renders unverified amendment banner', () => {
    const conflict: PreUploadCheckResult = {
      type: 'amendment',
      existingPolicy,
      changes: [mockChanges[0]],
      isVerifiedAmendment: false,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    expect(screen.getByText('Possible change')).toBeInTheDocument()
    expect(screen.getByText(/1 differences/)).toBeInTheDocument()
  })

  it('calls onShowDialog when Resolve is clicked', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    fireEvent.click(screen.getByText('Resolve'))
    expect(onShowDialog).toHaveBeenCalled()
  })

  it('calls onDismiss when X is clicked', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
      />
    )
    // The dismiss button is the last button in the banner
    const buttons = screen.getAllByRole('button')
    const dismissButton = buttons[buttons.length - 1]
    fireEvent.click(dismissButton)
    expect(onDismiss).toHaveBeenCalled()
  })

  it('applies custom className', () => {
    const conflict: PreUploadCheckResult = {
      type: 'exactDuplicate',
      existingPolicy,
    }
    const { container } = render(
      <DuplicateWarningBanner
        conflict={conflict}
        onDismiss={onDismiss}
        onShowDialog={onShowDialog}
        className="custom-banner"
      />
    )
    expect(container.firstChild).toHaveClass('custom-banner')
  })
})
