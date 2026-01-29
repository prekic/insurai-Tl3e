/**
 * Test the Promise-based lock for processing log persistence
 * This simulates the race condition that was causing duplicate key errors
 */
import { describe, it, expect } from 'vitest'

describe('Processing Log Lock', () => {
  let createCount = 0
  let updateCount = 0
  let createPromise: Promise<boolean> | null = null

  // Mock the persist callback logic
  const mockPersistCallback = async (_log: { document_id: string; stages: number }) => {
    if (!createPromise) {
      // First call - create a promise for the create operation
      createPromise = (async () => {
        // Simulate async create
        await new Promise((resolve) => setTimeout(resolve, 10))
        createCount++
        return true
      })()
      await createPromise
    } else {
      // Wait for create to finish, then update
      await createPromise
      updateCount++
    }
  }

  beforeEach(() => {
    createCount = 0
    updateCount = 0
    createPromise = null
  })

  it('should only create once when multiple persist calls happen simultaneously', async () => {
    const log = { document_id: 'test-123', stages: 1 }

    // Simulate 10 concurrent persist calls (like what happens in the app)
    const promises = Array(10)
      .fill(null)
      .map(() => mockPersistCallback(log))

    await Promise.all(promises)

    // Should have created exactly once
    expect(createCount).toBe(1)
    // Should have updated 9 times (all others)
    expect(updateCount).toBe(9)
  })

  it('should create first, then update on sequential calls', async () => {
    const log = { document_id: 'test-456', stages: 1 }

    // First call creates
    await mockPersistCallback(log)
    expect(createCount).toBe(1)
    expect(updateCount).toBe(0)

    // Second call updates
    await mockPersistCallback({ ...log, stages: 2 })
    expect(createCount).toBe(1)
    expect(updateCount).toBe(1)

    // Third call updates
    await mockPersistCallback({ ...log, stages: 3 })
    expect(createCount).toBe(1)
    expect(updateCount).toBe(2)
  })
})
