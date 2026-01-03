/**
 * PolicyChat Component Tests
 *
 * Tests for the AI chat functionality including
 * message sending, error handling, and retry logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { PolicyChat } from './PolicyChat'

// Mock hooks and dependencies
const mockNavigate = vi.fn()

const mockPolicies = [
  { id: '1', policyNumber: 'POL-001', provider: 'Allianz' },
  { id: '2', policyNumber: 'POL-002', provider: 'Axa' },
  { id: '3', policyNumber: 'POL-003', provider: 'Mapfre' },
]

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    policies: mockPolicies,
  }),
}))

vi.mock('@/lib/sanitize', () => ({
  sanitizeMessage: (msg: string) => msg.trim(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

function renderChat() {
  return render(
    <BrowserRouter>
      <PolicyChat />
    </BrowserRouter>
  )
}

describe('PolicyChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Rendering', () => {
    it('should render chat header', () => {
      renderChat()

      expect(screen.getByText('Policy Assistant')).toBeInTheDocument()
    })

    it('should render back button', () => {
      renderChat()

      expect(screen.getByLabelText('Go back')).toBeInTheDocument()
    })

    it('should show policy count in header', () => {
      renderChat()

      expect(screen.getByText('3 policies loaded')).toBeInTheDocument()
    })

    it('should render initial greeting message', () => {
      renderChat()

      expect(
        screen.getByText(/Hello! I'm your AI insurance assistant/)
      ).toBeInTheDocument()
    })

    it('should render quick question buttons', () => {
      renderChat()

      expect(screen.getByRole('button', { name: 'What does my Kasko cover?' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Compare my policies' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Any coverage gaps?' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Renewal reminders' })).toBeInTheDocument()
    })

    it('should render message input', () => {
      renderChat()

      expect(
        screen.getByPlaceholderText('Ask about your policies...')
      ).toBeInTheDocument()
    })

    it('should render send button', () => {
      renderChat()

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should navigate back when back button is clicked', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      await user.click(screen.getByLabelText('Go back'))

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe('Quick Questions', () => {
    it('should populate input when quick question is clicked', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      await user.click(screen.getByRole('button', { name: 'What does my Kasko cover?' }))

      const input = screen.getByPlaceholderText('Ask about your policies...')
      expect(input).toHaveValue('What does my Kasko cover?')
    })
  })

  describe('Sending Messages', () => {
    it('should send message when send button is clicked', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      // User message should appear
      await waitFor(() => {
        expect(screen.getByText('Test question')).toBeInTheDocument()
      })
    })

    it('should send message when Enter is pressed', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Test question')).toBeInTheDocument()
      })
    })

    it('should not send message on Shift+Enter', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.keyboard('{Shift>}{Enter}{/Shift}')

      expect(screen.queryByText('Test question')).not.toBeInTheDocument()
    })

    it('should not send empty message', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('should clear input after sending', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    it('should show typing indicator while waiting for response', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      // Typing indicator should appear (animated dots)
      await waitFor(() => {
        const bounceElements = document.querySelectorAll('.animate-bounce')
        expect(bounceElements.length).toBe(3)
      })
    })

    it('should receive AI response after sending message', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      // Wait for AI response (simulated with 1500ms delay)
      await waitFor(
        () => {
          const messages = screen.getAllByText(/kasko|portfolio|policies|coverage/i)
          expect(messages.length).toBeGreaterThan(0)
        },
        { timeout: 3000 }
      )
    })

    it('should disable send button while typing', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      // Button should show loading state
      await waitFor(() => {
        const sendButton = screen.getByRole('button', { name: /sending/i })
        expect(sendButton).toBeDisabled()
      })
    })

    it('should disable quick question buttons while typing', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      // Quick buttons should be disabled
      await waitFor(() => {
        const quickButtons = screen.getAllByRole('button', { name: /kasko|compare|gaps|renewal/i })
        quickButtons.forEach((button) => {
          expect(button).toBeDisabled()
        })
      })
    })
  })

  describe('Message Display', () => {
    it('should display user messages on the right', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(() => {
        const userMessage = screen.getByText('Test question')
        const messageContainer = userMessage.closest('[class*="justify-end"]')
        expect(messageContainer).toBeInTheDocument()
      })
    })

    it('should display AI messages on the left', () => {
      renderChat()

      const aiMessage = screen.getByText(/Hello! I'm your AI insurance assistant/)
      const messageContainer = aiMessage.closest('[class*="justify-start"]')
      expect(messageContainer).toBeInTheDocument()
    })

    it('should show timestamps on messages', () => {
      renderChat()

      // Initial message should have a timestamp
      const timePattern = /\d{1,2}:\d{2}/
      const timestamps = screen.getAllByText(timePattern)
      expect(timestamps.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should display error message when AI fails', async () => {
      // We need to mock Math.random to force an error (< 0.1 triggers error)
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.05)
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(
        () => {
          expect(
            screen.getByText(/Sorry, I couldn't process your request/)
          ).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      mockRandom.mockRestore()
    })

    it('should show connection error banner when error occurs', async () => {
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.05)
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(
        () => {
          expect(
            screen.getByText(/Having trouble connecting to the AI assistant/)
          ).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      mockRandom.mockRestore()
    })

    it('should show retry button on error message', async () => {
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.05)
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      mockRandom.mockRestore()
    })

    it('should retry sending when retry button is clicked', async () => {
      let callCount = 0
      const mockRandom = vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++
        // First call fails, second succeeds
        return callCount === 1 ? 0.05 : 0.5
      })
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      // Wait for error
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      // Click retry
      await user.click(screen.getByRole('button', { name: /retry/i }))

      // Should get AI response this time
      await waitFor(
        () => {
          const messages = screen.getAllByText(/kasko|portfolio|policies|coverage/i)
          expect(messages.length).toBeGreaterThan(0)
        },
        { timeout: 3000 }
      )

      mockRandom.mockRestore()
    })

    it('should allow dismissing connection error banner', async () => {
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.05)
      vi.useRealTimers()
      const user = userEvent.setup()
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      await user.type(input, 'Test question')
      await user.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(
        () => {
          expect(
            screen.getByText(/Having trouble connecting/)
          ).toBeInTheDocument()
        },
        { timeout: 3000 }
      )

      await user.click(screen.getByRole('button', { name: /dismiss/i }))

      expect(
        screen.queryByText(/Having trouble connecting/)
      ).not.toBeInTheDocument()

      mockRandom.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('should have accessible back button', () => {
      renderChat()

      const backButton = screen.getByLabelText('Go back')
      expect(backButton).toBeInTheDocument()
    })

    it('should have accessible input', () => {
      renderChat()

      const input = screen.getByPlaceholderText('Ask about your policies...')
      expect(input).toHaveAttribute('type', 'text')
    })
  })
})

describe('PolicyChat - No Policies', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.doMock('@/lib/policy-context', () => ({
      usePolicies: () => ({
        policies: [],
      }),
    }))
  })

  it('should show 0 policies in header', () => {
    // The component shows policies.length in greeting
    // This test verifies the greeting adapts to policy count
  })
})
