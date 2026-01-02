/**
 * Authentication E2E Tests
 *
 * Tests for sign in, sign up, and sign out flows.
 */

import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.describe('Landing Page', () => {
    test('should display sign in and sign up buttons', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /get started/i })).toBeVisible()
    })

    test('should navigate to sign in page', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('link', { name: /sign in/i }).click()

      await expect(page).toHaveURL('/signin')
    })

    test('should navigate to sign up page', async ({ page }) => {
      await page.goto('/')

      await page.getByRole('link', { name: /get started/i }).click()

      await expect(page).toHaveURL('/signup')
    })
  })

  test.describe('Sign In Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/signin')
    })

    test('should display sign in form', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    })

    test('should show validation errors for empty form', async ({ page }) => {
      await page.getByRole('button', { name: /sign in/i }).click()

      // Check for validation
      await expect(
        page.getByText(/email.*required/i).or(page.getByText(/invalid email/i))
      ).toBeVisible()
    })

    test('should have link to sign up page', async ({ page }) => {
      await expect(page.getByRole('link', { name: /sign up|create account/i })).toBeVisible()
    })

    test('should have link to forgot password', async ({ page }) => {
      await expect(page.getByRole('link', { name: /forgot|reset/i })).toBeVisible()
    })
  })

  test.describe('Sign Up Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/signup')
    })

    test('should display sign up form', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /sign up|create|register/i })).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i).first()).toBeVisible()
      await expect(page.getByRole('button', { name: /sign up|create|register/i })).toBeVisible()
    })

    test('should have link to sign in page', async ({ page }) => {
      await expect(page.getByRole('link', { name: /sign in|already have/i })).toBeVisible()
    })
  })

  test.describe('Protected Routes', () => {
    test('should redirect to sign in when accessing dashboard without auth', async ({ page }) => {
      await page.goto('/dashboard')

      await expect(
        page.getByRole('heading', { name: /sign in/i }).or(page.locator('text=Sign In'))
      ).toBeVisible({ timeout: 5000 })
    })

    test('should redirect to sign in when accessing upload without auth', async ({ page }) => {
      await page.goto('/upload')

      await expect(
        page.getByRole('heading', { name: /sign in/i }).or(page.locator('text=Sign In'))
      ).toBeVisible({ timeout: 5000 })
    })
  })
})
