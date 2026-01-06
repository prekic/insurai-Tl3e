/**
 * Tests for ConfirmationDialog component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmationDialog, useConfirmation, confirmations } from './confirmation-dialog'

describe('ConfirmationDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Test Dialog',
    description: 'Are you sure you want to proceed?',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<ConfirmationDialog {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders dialog when isOpen is true', () => {
      render(<ConfirmationDialog {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Test Dialog')).toBeInTheDocument()
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument()
    })

    it('renders confirm and cancel buttons', () => {
      render(<ConfirmationDialog {...defaultProps} />)
      expect(screen.getByText('Confirm')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders custom button text', () => {
      render(
        <ConfirmationDialog
          {...defaultProps}
          confirmText="Delete"
          cancelText="Keep"
        />
      )
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('Keep')).toBeInTheDocument()
    })
  })

  describe('variants', () => {
    it('applies danger variant styles', () => {
      render(<ConfirmationDialog {...defaultProps} variant="danger" />)
      // The danger variant uses red colors
      const confirmButton = screen.getByText('Confirm')
      expect(confirmButton).toHaveClass('bg-red-600')
    })

    it('applies warning variant styles', () => {
      render(<ConfirmationDialog {...defaultProps} variant="warning" />)
      const confirmButton = screen.getByText('Confirm')
      expect(confirmButton).toHaveClass('bg-amber-600')
    })

    it('applies info variant styles', () => {
      render(<ConfirmationDialog {...defaultProps} variant="info" />)
      const confirmButton = screen.getByText('Confirm')
      expect(confirmButton).toHaveClass('bg-blue-600')
    })
  })

  describe('interactions', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const onClose = vi.fn()
      render(<ConfirmationDialog {...defaultProps} onClose={onClose} />)

      await userEvent.click(screen.getByText('Cancel'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', async () => {
      const onClose = vi.fn()
      render(<ConfirmationDialog {...defaultProps} onClose={onClose} />)

      // Click the backdrop (the element with aria-hidden="true")
      const backdrop = document.querySelector('[aria-hidden="true"]')
      if (backdrop) {
        fireEvent.click(backdrop)
      }
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn()
      render(<ConfirmationDialog {...defaultProps} onClose={onClose} />)

      await userEvent.click(screen.getByLabelText('Close dialog'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onConfirm and onClose when confirm button is clicked', async () => {
      const onConfirm = vi.fn()
      const onClose = vi.fn()
      render(
        <ConfirmationDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )

      await userEvent.click(screen.getByText('Confirm'))
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
      })
    })

    it('handles async onConfirm', async () => {
      const onConfirm = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })
      const onClose = vi.fn()

      render(
        <ConfirmationDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )

      await userEvent.click(screen.getByText('Confirm'))

      // Should show loading state
      expect(screen.getByText('Processing...')).toBeInTheDocument()

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('confirm phrase', () => {
    it('renders input when confirmPhrase is provided', () => {
      render(
        <ConfirmationDialog
          {...defaultProps}
          confirmPhrase="DELETE"
        />
      )
      expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument()
    })

    it('disables confirm button when phrase does not match', () => {
      render(
        <ConfirmationDialog
          {...defaultProps}
          confirmPhrase="DELETE"
        />
      )
      const confirmButton = screen.getByText('Confirm')
      expect(confirmButton).toBeDisabled()
    })

    it('enables confirm button when phrase matches', async () => {
      render(
        <ConfirmationDialog
          {...defaultProps}
          confirmPhrase="DELETE"
        />
      )

      await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE')

      const confirmButton = screen.getByText('Confirm')
      expect(confirmButton).not.toBeDisabled()
    })

    it('does not call onConfirm when phrase does not match', async () => {
      const onConfirm = vi.fn()
      render(
        <ConfirmationDialog
          {...defaultProps}
          onConfirm={onConfirm}
          confirmPhrase="DELETE"
        />
      )

      await userEvent.type(screen.getByPlaceholderText('DELETE'), 'WRONG')
      await userEvent.click(screen.getByText('Confirm'))

      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('loading state', () => {
    it('disables buttons when isLoading is true', () => {
      render(<ConfirmationDialog {...defaultProps} isLoading={true} />)

      expect(screen.getByText('Cancel')).toBeDisabled()
      expect(screen.getByText('Processing...')).toBeDisabled()
    })

    it('disables close button when isLoading is true', () => {
      render(<ConfirmationDialog {...defaultProps} isLoading={true} />)

      expect(screen.getByLabelText('Close dialog')).toBeDisabled()
    })
  })
})

describe('confirmations presets', () => {
  it('has deletePolicy preset', () => {
    expect(confirmations.deletePolicy).toBeDefined()
    expect(confirmations.deletePolicy.title).toBe('Delete Policy')
    expect(confirmations.deletePolicy.variant).toBe('danger')
  })

  it('has clearAllData preset with confirm phrase', () => {
    expect(confirmations.clearAllData).toBeDefined()
    expect(confirmations.clearAllData.title).toBe('Clear All Data')
    expect(confirmations.clearAllData.confirmPhrase).toBe('DELETE')
    expect(confirmations.clearAllData.variant).toBe('danger')
  })

  it('has signOut preset', () => {
    expect(confirmations.signOut).toBeDefined()
    expect(confirmations.signOut.title).toBe('Sign Out')
    expect(confirmations.signOut.variant).toBe('warning')
  })

  it('has deleteAccount preset with confirm phrase', () => {
    expect(confirmations.deleteAccount).toBeDefined()
    expect(confirmations.deleteAccount.title).toBe('Delete Account')
    expect(confirmations.deleteAccount.confirmPhrase).toBe('DELETE MY ACCOUNT')
    expect(confirmations.deleteAccount.variant).toBe('danger')
  })

  it('has removeApiKey preset', () => {
    expect(confirmations.removeApiKey).toBeDefined()
    expect(confirmations.removeApiKey.title).toBe('Remove API Key')
    expect(confirmations.removeApiKey.variant).toBe('warning')
  })
})

describe('useConfirmation hook', () => {
  function TestComponent() {
    const { confirm, ConfirmationDialog: Dialog } = useConfirmation()

    const handleClick = async () => {
      await confirm({
        title: 'Hook Test',
        description: 'Testing the hook',
        onConfirm: () => console.log('confirmed'),
      })
    }

    return (
      <div>
        <button onClick={handleClick}>Open Dialog</button>
        {Dialog}
      </div>
    )
  }

  it('opens dialog when confirm is called', async () => {
    render(<TestComponent />)

    expect(screen.queryByText('Hook Test')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Open Dialog'))

    await waitFor(() => {
      expect(screen.getByText('Hook Test')).toBeInTheDocument()
    })
  })
})
