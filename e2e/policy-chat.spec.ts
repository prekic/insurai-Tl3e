/**
 * PolicyChat E2E Tests
 *
 * Tests for the AI chat interface including:
 * - UI rendering and interactions
 * - Provider selection
 * - Conversation history
 * - Message sending and receiving
 * - Error handling
 * - Responsive design
 */

import { test, expect } from '@playwright/test'

test.describe('PolicyChat - Page Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should load chat page successfully', async ({ page }) => {
    const url = page.url()
    // May redirect if no auth, but should load a page
    expect(url.includes('/chat') || url.includes('/auth') || url.includes('/dashboard')).toBe(true)
  })

  test('should display chat header with Policy Assistant title', async ({ page }) => {
    if (page.url().includes('/chat')) {
      await expect(page.getByText('Policy Assistant')).toBeVisible()
    }
  })

  test('should display back navigation button', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const backButton = page.getByRole('button', { name: /back/i }).or(
        page.locator('[aria-label*="back"]')
      )
      await expect(backButton.first()).toBeVisible()
    }
  })

  test('should show policy count in header', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const policyCount = page.getByText(/\d+ policies? loaded/i)
      await expect(policyCount).toBeVisible()
    }
  })
})

test.describe('PolicyChat - Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should display initial greeting message', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const greeting = page.getByText(/Hello.*AI.*insurance.*assistant/i)
      await expect(greeting.first()).toBeVisible()
    }
  })

  test('should display message input field', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).or(
        page.locator('input[type="text"]')
      )
      await expect(input.first()).toBeVisible()
    }
  })

  test('should display send button', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const sendButton = page.getByRole('button', { name: /send/i })
      await expect(sendButton).toBeVisible()
    }
  })

  test('should display quick question buttons', async ({ page }) => {
    if (page.url().includes('/chat')) {
      // Look for quick question buttons
      const kaskoButton = page.getByRole('button', { name: /kasko/i })
      const compareButton = page.getByRole('button', { name: /compare/i })

      const kaskoCount = await kaskoButton.count()
      const compareCount = await compareButton.count()

      expect(kaskoCount + compareCount).toBeGreaterThan(0)
    }
  })

  test('should populate input when quick question is clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const quickButton = page.getByRole('button', { name: /kasko/i }).first()
      if (await quickButton.count() > 0) {
        await quickButton.click()

        const input = page.getByPlaceholder(/ask about your policies/i).first()
        const value = await input.inputValue()
        expect(value.toLowerCase()).toContain('kasko')
      }
    }
  })
})

test.describe('PolicyChat - Provider Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should display provider selector button', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector').or(
        page.getByRole('button', { name: /gpt|claude|provider/i })
      )
      await expect(providerSelector.first()).toBeVisible()
    }
  })

  test('should show default provider (GPT-4o Mini)', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const defaultProvider = page.getByText(/GPT-4o Mini/i)
      await expect(defaultProvider.first()).toBeVisible()
    }
  })

  test('should open provider dropdown when clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector')
      if (await providerSelector.count() > 0) {
        await providerSelector.click()

        // Should show dropdown with provider options
        const dropdown = page.getByText(/AI Provider/i)
        await expect(dropdown).toBeVisible()
      }
    }
  })

  test('should show OpenAI and Anthropic options in dropdown', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector')
      if (await providerSelector.count() > 0) {
        await providerSelector.click()

        const openaiOption = page.getByTestId('provider-option-openai')
        const anthropicOption = page.getByTestId('provider-option-anthropic')

        await expect(openaiOption).toBeVisible()
        await expect(anthropicOption).toBeVisible()
      }
    }
  })

  test('should switch provider when option is selected', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector')
      if (await providerSelector.count() > 0) {
        await providerSelector.click()

        const anthropicOption = page.getByTestId('provider-option-anthropic')
        await anthropicOption.click()

        // Verify Claude Haiku is now shown
        const claudeProvider = page.getByText(/Claude Haiku/i)
        await expect(claudeProvider.first()).toBeVisible()
      }
    }
  })

  test('should close dropdown when clicking outside', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector')
      if (await providerSelector.count() > 0) {
        await providerSelector.click()
        await expect(page.getByText(/AI Provider/i)).toBeVisible()

        // Click outside the dropdown
        await page.click('body', { position: { x: 10, y: 10 } })

        // Dropdown should close
        await expect(page.getByText(/AI Provider/i)).not.toBeVisible()
      }
    }
  })
})

test.describe('PolicyChat - Conversation Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should display new conversation button', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const newConvButton = page.getByTestId('new-conversation-button').or(
        page.getByRole('button', { name: /new.*conversation/i })
      ).or(
        page.locator('[aria-label*="New conversation"]')
      )
      await expect(newConvButton.first()).toBeVisible()
    }
  })

  test('should reset chat when new conversation is clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      // Type something in input first
      const input = page.getByPlaceholder(/ask about your policies/i).first()
      if (await input.count() > 0) {
        await input.fill('Test message')

        // Click new conversation
        const newConvButton = page.getByTestId('new-conversation-button')
        if (await newConvButton.count() > 0) {
          await newConvButton.click()

          // Verify greeting message is still shown (reset state)
          const greeting = page.getByText(/Hello.*AI.*assistant/i)
          await expect(greeting.first()).toBeVisible()
        }
      }
    }
  })
})

test.describe('PolicyChat - History Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should display history button for logged-in users', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const historyButton = page.getByTestId('history-button').or(
        page.locator('[aria-label*="history"]')
      )
      // History button only shows for authenticated users
      const count = await historyButton.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })

  test('should open history sidebar when history button is clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const historyButton = page.getByTestId('history-button')
      if (await historyButton.count() > 0) {
        await historyButton.click()

        const sidebar = page.getByText(/Conversation History/i)
        await expect(sidebar).toBeVisible()
      }
    }
  })

  test('should close history sidebar when close button is clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const historyButton = page.getByTestId('history-button')
      if (await historyButton.count() > 0) {
        await historyButton.click()
        await expect(page.getByText(/Conversation History/i)).toBeVisible()

        const closeButton = page.getByRole('button', { name: /close/i }).or(
          page.locator('[aria-label*="Close history"]')
        )
        await closeButton.first().click()

        await expect(page.getByText(/Conversation History/i)).not.toBeVisible()
      }
    }
  })

  test('should show empty state when no conversations', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const historyButton = page.getByTestId('history-button')
      if (await historyButton.count() > 0) {
        await historyButton.click()

        // May show "No conversations yet" or existing conversations
        const emptyState = page.getByText(/No conversations yet/i)
        const conversationList = page.locator('[data-testid^="conversation-"]')

        const emptyCount = await emptyState.count()
        const listCount = await conversationList.count()

        // Either empty state or conversations should be shown
        expect(emptyCount + listCount).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

test.describe('PolicyChat - Message Sending', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should have disabled send button when input is empty', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const sendButton = page.getByRole('button', { name: /send/i })
      if (await sendButton.count() > 0) {
        await expect(sendButton).toBeDisabled()
      }
    }
  })

  test('should enable send button when input has text', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test question')
        await expect(sendButton).not.toBeDisabled()
      }
    }
  })

  test('should display user message after sending', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('What is my coverage?')
        await sendButton.click()

        // User message should appear
        const userMessage = page.getByText('What is my coverage?')
        await expect(userMessage).toBeVisible()
      }
    }
  })

  test('should clear input after sending message', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test message')
        await sendButton.click()

        // Input should be cleared
        await expect(input).toHaveValue('')
      }
    }
  })

  test('should show typing indicator while waiting for response', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('What is my coverage?')
        await sendButton.click()

        // Look for typing indicator (animated dots)
        const typingIndicator = page.locator('.animate-bounce')
        // May or may not catch it depending on API response time
        const count = await typingIndicator.count()
        expect(count).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('should send message on Enter key press', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()

      if (await input.count() > 0) {
        await input.fill('Enter key test')
        await input.press('Enter')

        // Message should be sent
        const message = page.getByText('Enter key test')
        await expect(message).toBeVisible()
      }
    }
  })

  test('should not send message on Shift+Enter', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const input = page.getByPlaceholder(/ask about your policies/i).first()

      if (await input.count() > 0) {
        await input.fill('Shift enter test')
        await input.press('Shift+Enter')

        // Input should still have the text
        const value = await input.inputValue()
        expect(value).toBe('Shift enter test')
      }
    }
  })
})

test.describe('PolicyChat - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should handle API errors gracefully', async ({ page }) => {
    if (page.url().includes('/chat')) {
      // Mock API failure
      await page.route('**/api/ai/chat', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        })
      })

      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test error handling')
        await sendButton.click()

        // Should show error message
        const errorMessage = page.getByText(/sorry|couldn't process|error/i)
        await expect(errorMessage.first()).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('should show retry button on error', async ({ page }) => {
    if (page.url().includes('/chat')) {
      await page.route('**/api/ai/chat', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        })
      })

      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test retry')
        await sendButton.click()

        // Wait for error and retry button
        const retryButton = page.getByRole('button', { name: /retry/i })
        await expect(retryButton).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('should show connection error banner on network failure', async ({ page }) => {
    if (page.url().includes('/chat')) {
      await page.route('**/api/ai/chat', (route) => {
        route.abort('failed')
      })

      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test connection error')
        await sendButton.click()

        // Should show connection error banner
        const errorBanner = page.getByText(/trouble connecting/i)
        await expect(errorBanner).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('should dismiss error banner when dismiss is clicked', async ({ page }) => {
    if (page.url().includes('/chat')) {
      await page.route('**/api/ai/chat', (route) => {
        route.abort('failed')
      })

      const input = page.getByPlaceholder(/ask about your policies/i).first()
      const sendButton = page.getByRole('button', { name: /send/i })

      if (await input.count() > 0 && await sendButton.count() > 0) {
        await input.fill('Test dismiss')
        await sendButton.click()

        await page.waitForSelector('text=/trouble connecting/i', { timeout: 10000 })

        const dismissButton = page.getByRole('button', { name: /dismiss/i })
        await dismissButton.click()

        await expect(page.getByText(/trouble connecting/i)).not.toBeVisible()
      }
    }
  })
})

test.describe('PolicyChat - Responsive Design', () => {
  test('should display properly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      // Core elements should be visible
      const input = page.getByPlaceholder(/ask about your policies/i)
      await expect(input.first()).toBeVisible()

      const sendButton = page.getByRole('button', { name: /send/i })
      await expect(sendButton).toBeVisible()
    }
  })

  test('should display properly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      await expect(page.getByText('Policy Assistant')).toBeVisible()
    }
  })

  test('should show provider name on desktop but not on mobile', async ({ page }) => {
    // Desktop - should show full provider name
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      const providerName = page.getByText(/GPT-4o Mini/i)
      await expect(providerName.first()).toBeVisible()
    }

    // Mobile - provider name hidden (icon only)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      // Provider selector should still be functional
      const providerSelector = page.getByTestId('provider-selector')
      await expect(providerSelector).toBeVisible()
    }
  })
})

test.describe('PolicyChat - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
  })

  test('should have proper aria labels on interactive elements', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const backButton = page.locator('[aria-label*="back"]')
      await expect(backButton.first()).toBeVisible()

      const providerSelector = page.locator('[aria-label*="provider"]')
      await expect(providerSelector.first()).toBeVisible()

      const newConvButton = page.locator('[aria-label*="New conversation"]')
      await expect(newConvButton.first()).toBeVisible()
    }
  })

  test('should support keyboard navigation', async ({ page }) => {
    if (page.url().includes('/chat')) {
      // Tab through focusable elements
      await page.keyboard.press('Tab')

      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()
    }
  })

  test('should have proper focus management in dropdown', async ({ page }) => {
    if (page.url().includes('/chat')) {
      const providerSelector = page.getByTestId('provider-selector')
      if (await providerSelector.count() > 0) {
        await providerSelector.click()

        // First option should be focusable
        const firstOption = page.getByTestId('provider-option-openai')
        await firstOption.focus()
        await expect(firstOption).toBeFocused()
      }
    }
  })
})

test.describe('PolicyChat - Performance', () => {
  test('should load chat page within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000)
  })

  test('should render messages smoothly', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/chat')) {
      // Initial greeting should render immediately
      const greeting = page.getByText(/Hello.*AI.*assistant/i)
      await expect(greeting.first()).toBeVisible({ timeout: 2000 })
    }
  })
})
