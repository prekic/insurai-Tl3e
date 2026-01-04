/**
 * Tests for Supabase Client
 * Tests isSupabaseConfigured function
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

  it('should have auth property', () => {
    expect(supabase.auth).toBeDefined()
  })

  it('should have from method', () => {
    expect(typeof supabase.from).toBe('function')
  })

  it('should have storage property', () => {
    expect(supabase.storage).toBeDefined()
  })

  it('should have functions property', () => {
    expect(supabase.functions).toBeDefined()
  })
})

// =============================================================================
// Auth Configuration Tests
// =============================================================================

describe('Auth Configuration', () => {
  it('should have auth object on client', () => {
    expect(supabase.auth).toBeDefined()
    expect(typeof supabase.auth).toBe('object')
  })

  it('should have getSession method', () => {
    expect(typeof supabase.auth.getSession).toBe('function')
  })

  it('should have getUser method', () => {
    expect(typeof supabase.auth.getUser).toBe('function')
  })

  it('should have signIn methods', () => {
    expect(typeof supabase.auth.signInWithPassword).toBe('function')
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
  })

  it('should have signOut method', () => {
    expect(typeof supabase.auth.signOut).toBe('function')
  })

  it('should have onAuthStateChange method', () => {
    expect(typeof supabase.auth.onAuthStateChange).toBe('function')
  })
})

// =============================================================================
// Storage Tests
// =============================================================================

describe('Storage', () => {
  it('should have storage from method', () => {
    expect(typeof supabase.storage.from).toBe('function')
  })
})

// =============================================================================
// Database Query Tests
// =============================================================================

describe('Database Queries', () => {
  it('should create query builder with from()', () => {
    const query = supabase.from('policies')
    expect(query).toBeDefined()
  })

  it('should have select method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.select).toBe('function')
  })

  it('should have insert method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.insert).toBe('function')
  })

  it('should have update method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.update).toBe('function')
  })

  it('should have delete method on query builder', () => {
    const query = supabase.from('policies')
    expect(typeof query.delete).toBe('function')
  })

  it('should allow chaining select with eq', () => {
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
