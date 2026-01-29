/**
 * Tests for Supabase Client
 * Tests isSupabaseConfigured function and secure client behavior
 */

import { describe, it, expect } from 'vitest'
import { isSupabaseConfigured, supabase } from './client'

// =============================================================================
// isSupabaseConfigured Tests
// =============================================================================

describe('isSupabaseConfigured', () => {
  it('should return a boolean', () => {
    const result = isSupabaseConfigured()
    expect(typeof result).toBe('boolean')
  })

  it('should be consistent on multiple calls', () => {
    const result1 = isSupabaseConfigured()
    const result2 = isSupabaseConfigured()
    expect(result1).toBe(result2)
  })
})

// =============================================================================
// Supabase Client Export Tests
// =============================================================================

describe('Supabase Client', () => {
  it('should export supabase client', () => {
    expect(supabase).toBeDefined()
  })

  it('should be an object (real client or proxy)', () => {
    expect(typeof supabase).toBe('object')
  })
})

// =============================================================================
// Unconfigured Client Security Tests
// =============================================================================

describe('Unconfigured Client Security', () => {
  // These tests verify the security behavior when Supabase is NOT configured
  // The client should throw helpful errors instead of using placeholder URLs

  it('should throw descriptive error when accessing auth if not configured', () => {
    if (!isSupabaseConfigured()) {
      expect(() => supabase.auth).toThrow('Supabase is not configured')
    } else {
      // If configured, auth should be accessible
      expect(supabase.auth).toBeDefined()
    }
  })

  it('should throw descriptive error when calling from() if not configured', () => {
    if (!isSupabaseConfigured()) {
      expect(() => supabase.from('policies')).toThrow('Supabase is not configured')
    } else {
      // If configured, from() should work
      const query = supabase.from('policies')
      expect(query).toBeDefined()
    }
  })

  it('should throw descriptive error when accessing storage if not configured', () => {
    if (!isSupabaseConfigured()) {
      expect(() => supabase.storage).toThrow('Supabase is not configured')
    } else {
      expect(supabase.storage).toBeDefined()
    }
  })

  it('should include configuration instructions in error message', () => {
    if (!isSupabaseConfigured()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        supabase.auth
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect((error as Error).message).toContain('VITE_SUPABASE_URL')
        expect((error as Error).message).toContain('VITE_SUPABASE_ANON_KEY')
        expect((error as Error).message).toContain('local-only mode')
      }
    }
  })
})

// =============================================================================
// Configured Client Tests (only run if configured)
// =============================================================================

describe('Configured Client', () => {
  // Skip these tests if Supabase is not configured
  const runIfConfigured = isSupabaseConfigured() ? it : it.skip

  runIfConfigured('should have auth property', () => {
    expect(supabase.auth).toBeDefined()
  })

  runIfConfigured('should have from method', () => {
    expect(typeof supabase.from).toBe('function')
  })

  runIfConfigured('should have storage property', () => {
    expect(supabase.storage).toBeDefined()
  })

  runIfConfigured('should have functions property', () => {
    expect(supabase.functions).toBeDefined()
  })
})

// =============================================================================
// Auth Configuration Tests (only run if configured)
// =============================================================================

describe('Auth Configuration', () => {
  const runIfConfigured = isSupabaseConfigured() ? it : it.skip

  runIfConfigured('should have auth object on client', () => {
    expect(supabase.auth).toBeDefined()
    expect(typeof supabase.auth).toBe('object')
  })

  runIfConfigured('should have getSession method', () => {
    expect(typeof supabase.auth.getSession).toBe('function')
  })

  runIfConfigured('should have getUser method', () => {
    expect(typeof supabase.auth.getUser).toBe('function')
  })

  runIfConfigured('should have signIn methods', () => {
    expect(typeof supabase.auth.signInWithPassword).toBe('function')
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
  })

  runIfConfigured('should have signOut method', () => {
    expect(typeof supabase.auth.signOut).toBe('function')
  })

  runIfConfigured('should have onAuthStateChange method', () => {
    expect(typeof supabase.auth.onAuthStateChange).toBe('function')
  })
})

// =============================================================================
// Storage Tests (only run if configured)
// =============================================================================

describe('Storage', () => {
  const runIfConfigured = isSupabaseConfigured() ? it : it.skip

  runIfConfigured('should have storage from method', () => {
    expect(typeof supabase.storage.from).toBe('function')
  })
})

// =============================================================================
// Database Query Tests (only run if configured)
// =============================================================================

describe('Database Queries', () => {
  const runIfConfigured = isSupabaseConfigured() ? it : it.skip

  runIfConfigured('should create query builder with from()', () => {
    const query = supabase.from('policies')
    expect(query).toBeDefined()
  })

  runIfConfigured('should have select method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.select).toBe('function')
  })

  runIfConfigured('should have insert method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.insert).toBe('function')
  })

  runIfConfigured('should have update method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.update).toBe('function')
  })

  runIfConfigured('should have delete method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.delete).toBe('function')
  })

  runIfConfigured('should allow chaining select with eq', () => {
    const query = supabase.from('policies').select('*')
    expect(typeof query.eq).toBe('function')
  })
})

// =============================================================================
// Client Type Tests
// =============================================================================

describe('Client Type', () => {
  it('should export SupabaseClient type', async () => {
    // Type import test - if this compiles, the type is exported
    const module = await import('./client')
    expect(module.supabase).toBeDefined()
  })
})
