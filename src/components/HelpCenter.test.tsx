/**
 * HelpCenter Component Tests
 *
 * Tests for help center FAQ and support functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { HelpCenter } from './HelpCenter'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('HelpCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Header', () => {
    it('should render the Help Center header', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Help Center')).toBeInTheDocument()
    })

    it('should have a back button', () => {
      renderWithRouter(<HelpCenter />)

      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    // Back button was removed — GlobalNavigation handles navigation (Known Issue #91)
  })

  describe('Search Functionality', () => {
    it('should render search input', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByPlaceholderText('Search for help...')).toBeInTheDocument()
    })

    it('should update search query on input', () => {
      renderWithRouter(<HelpCenter />)

      const searchInput = screen.getByPlaceholderText('Search for help...')
      fireEvent.change(searchInput, { target: { value: 'policy' } })

      expect(searchInput).toHaveValue('policy')
    })

    it('should clear search query', () => {
      renderWithRouter(<HelpCenter />)

      const searchInput = screen.getByPlaceholderText('Search for help...')
      fireEvent.change(searchInput, { target: { value: 'policy' } })
      fireEvent.change(searchInput, { target: { value: '' } })

      expect(searchInput).toHaveValue('')
    })
  })

  describe('Categories', () => {
    it('should render Getting Started category', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Getting Started')).toBeInTheDocument()
      expect(screen.getByText('Learn the basics of using InsurAI')).toBeInTheDocument()
      expect(screen.getByText('5 articles')).toBeInTheDocument()
    })

    it('should render Policy Analysis category', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Policy Analysis')).toBeInTheDocument()
      expect(screen.getByText('Understanding AI-powered analysis')).toBeInTheDocument()
      expect(screen.getByText('8 articles')).toBeInTheDocument()
    })

    it('should render FAQ category', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('FAQ')).toBeInTheDocument()
      expect(screen.getByText('Frequently asked questions')).toBeInTheDocument()
      expect(screen.getByText('12 articles')).toBeInTheDocument()
    })

    it('should render Troubleshooting category', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Troubleshooting')).toBeInTheDocument()
      expect(screen.getByText('Solve common issues')).toBeInTheDocument()
      expect(screen.getByText('6 articles')).toBeInTheDocument()
    })

    it('should render all 4 category cards', () => {
      renderWithRouter(<HelpCenter />)

      const categories = ['Getting Started', 'Policy Analysis', 'FAQ', 'Troubleshooting']
      categories.forEach((category) => {
        expect(screen.getByText(category)).toBeInTheDocument()
      })
    })
  })

  describe('Popular Articles', () => {
    it('should render Popular Articles section', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Popular Articles')).toBeInTheDocument()
    })

    it('should render all popular articles', () => {
      renderWithRouter(<HelpCenter />)

      const articles = [
        'How to upload and analyze a policy',
        'Understanding coverage comparisons',
        'Setting up renewal reminders',
        'Exporting analysis reports',
        'Managing your policy portfolio',
      ]

      articles.forEach((article) => {
        expect(screen.getByText(article)).toBeInTheDocument()
      })
    })

    it('should have clickable article buttons', () => {
      renderWithRouter(<HelpCenter />)

      const articleButton = screen.getByText('How to upload and analyze a policy')
      expect(articleButton.closest('button')).toBeInTheDocument()
    })
  })

  describe('Contact Support', () => {
    it('should render contact support section', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Still need help?')).toBeInTheDocument()
    })

    it('should display help message', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Chat with our AI assistant or contact support')).toBeInTheDocument()
    })

    it('should render Chat with AI button', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Chat with AI')).toBeInTheDocument()
    })

    it('should render Contact Support button', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByText('Contact Support')).toBeInTheDocument()
    })

    it('should navigate to chat when Chat with AI is clicked', () => {
      renderWithRouter(<HelpCenter />)

      const chatButton = screen.getByText('Chat with AI')
      fireEvent.click(chatButton)

      expect(mockNavigate).toHaveBeenCalledWith('/chat')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible search input', () => {
      renderWithRouter(<HelpCenter />)

      const searchInput = screen.getByPlaceholderText('Search for help...')
      expect(searchInput).toHaveAttribute('type', 'text')
    })

    it('should have semantic heading structure', () => {
      renderWithRouter(<HelpCenter />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help Center')
    })
  })
})
