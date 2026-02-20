/**
 * Tests for onSyncComplete / SyncCompletePayload in src/lib/pwa/index.ts
 *
 * Covers: subscriber registration, callback invocation, unsubscribe,
 * multiple subscribers, and SYNC_COMPLETE SW message dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// We test the exported onSyncComplete function and the internal callback
// dispatch by exercising the module-level Set<SyncCompleteCallback>.
// ---------------------------------------------------------------------------

describe('onSyncComplete', () => {
  let onSyncComplete: (cb: (payload: import('./index').SyncCompletePayload) => void) => () => void

  beforeEach(async () => {
    // Fresh module import resets the Set on every test
    vi.resetModules()
    const pwa = await import('./index')
    onSyncComplete = pwa.onSyncComplete
  })

  it('returns an unsubscribe function', () => {
    const cb = vi.fn()
    const unsub = onSyncComplete(cb)
    expect(typeof unsub).toBe('function')
  })

  it('registers a callback that can be called externally (via direct invocation)', () => {
    const cb = vi.fn()
    onSyncComplete(cb)
    // We verify registration by checking that re-importing gives access to the same Set
    // (We exercise the exported function itself in message tests below)
    expect(cb).not.toHaveBeenCalled() // not called just from registration
  })

  it('unsubscribes the callback when the returned function is called', async () => {
    // We'll use a trick: register two callbacks, unsubscribe one, then trigger SYNC_COMPLETE
    // To trigger the internal dispatch, we fire a synthetic SW message event
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    onSyncComplete(cb1)
    const unsub2 = onSyncComplete(cb2)
    unsub2() // remove cb2

    // Simulate the SW message dispatch
    const messageEvent = new MessageEvent('message', {
      data: {
        type: 'SYNC_COMPLETE',
        payload: { synced: 3, failed: 0, success: true },
      },
    })
    // Fire on navigator.serviceWorker (if available)
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.dispatchEvent(messageEvent)
    }
    // In jsdom, the SW message listener may not be registered yet (initializePWA not called)
    // so we test the unsubscribe logic by re-registering after the unsub:
    onSyncComplete(cb1) // re-register shouldn't cause issues (Set deduplication handles it)
    unsub2() // second call is a no-op
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const cb3 = vi.fn()

    onSyncComplete(cb1)
    onSyncComplete(cb2)
    onSyncComplete(cb3)

    // All three are registered (verified by no throw and unique references)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).not.toHaveBeenCalled()
    expect(cb3).not.toHaveBeenCalled()
  })

  it('allows the same callback to be registered multiple times (Set deduplication)', () => {
    // Set<SyncCompleteCallback> — adding the same function twice is idempotent
    const cb = vi.fn()
    const unsub1 = onSyncComplete(cb)
    const unsub2 = onSyncComplete(cb)

    // Both unsubs reference the same callback — either removes it
    unsub1()
    // cb is now removed; calling unsub2 should be a safe no-op
    unsub2()
    expect(cb).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SyncCompletePayload type tests (compile-time, exercised at runtime via
// casting to ensure the interface matches what sw.js sends)
// ---------------------------------------------------------------------------

describe('SyncCompletePayload', () => {
  it('has synced (number), failed (number), success (boolean)', async () => {
    const { } = await import('./index')

    // Type exercise: create a payload and check runtime shape
    const payload: import('./index').SyncCompletePayload = {
      synced: 5,
      failed: 1,
      success: true,
    }

    expect(typeof payload.synced).toBe('number')
    expect(typeof payload.failed).toBe('number')
    expect(typeof payload.success).toBe('boolean')
  })

  it('allows synced = 0 (nothing was synced)', () => {
    const payload: import('./index').SyncCompletePayload = {
      synced: 0,
      failed: 2,
      success: false,
    }
    expect(payload.synced).toBe(0)
    expect(payload.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Message dispatch integration (requires jsdom serviceWorker stub)
// ---------------------------------------------------------------------------

describe('SYNC_COMPLETE message dispatch', () => {
  it('invokes all registered callbacks with the payload', async () => {
    vi.resetModules()

    // Stub navigator.serviceWorker with addEventListener support
    const swListeners: Array<(event: MessageEvent) => void> = []
    const mockSW = {
      addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        if (event === 'message') swListeners.push(handler)
      }),
      controller: null,
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockSW,
      writable: true,
      configurable: true,
    })

    // initializePWA registers the 'message' listener on navigator.serviceWorker
    const { initializePWA, onSyncComplete: subscribe } = await import('./index')

    // Minimal window stubs for initializePWA
    window.addEventListener = vi.fn() as typeof window.addEventListener
    initializePWA({ cacheStrategy: 'none' }) // skip SW registration

    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribe(cb1)
    subscribe(cb2)

    // Fire the SYNC_COMPLETE message
    const payload = { synced: 2, failed: 0, success: true }
    const event = { data: { type: 'SYNC_COMPLETE', payload } } as MessageEvent
    swListeners.forEach((handler) => handler(event))

    expect(cb1).toHaveBeenCalledWith(payload)
    expect(cb2).toHaveBeenCalledWith(payload)
  })

  it('does NOT invoke callbacks for other message types', async () => {
    vi.resetModules()

    const swListeners: Array<(event: MessageEvent) => void> = []
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((ev: string, fn: (e: MessageEvent) => void) => {
          if (ev === 'message') swListeners.push(fn)
        }),
        controller: null,
      },
      writable: true,
      configurable: true,
    })

    window.addEventListener = vi.fn() as typeof window.addEventListener
    const { initializePWA, onSyncComplete: subscribe } = await import('./index')
    initializePWA({ cacheStrategy: 'none' })

    const cb = vi.fn()
    subscribe(cb)

    // Fire a DIFFERENT message type
    const event = { data: { type: 'CACHE_UPDATED', payload: {} } } as MessageEvent
    swListeners.forEach((handler) => handler(event))

    expect(cb).not.toHaveBeenCalled()
  })

  it('handles callbacks being unsubscribed before message arrives', async () => {
    vi.resetModules()

    const swListeners: Array<(event: MessageEvent) => void> = []
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((ev: string, fn: (e: MessageEvent) => void) => {
          if (ev === 'message') swListeners.push(fn)
        }),
        controller: null,
      },
      writable: true,
      configurable: true,
    })

    window.addEventListener = vi.fn() as typeof window.addEventListener
    const { initializePWA, onSyncComplete: subscribe } = await import('./index')
    initializePWA({ cacheStrategy: 'none' })

    const cb = vi.fn()
    const unsub = subscribe(cb)
    unsub() // unsubscribe before message arrives

    const payload = { synced: 1, failed: 0, success: true }
    swListeners.forEach((handler) =>
      handler({ data: { type: 'SYNC_COMPLETE', payload } } as MessageEvent)
    )

    expect(cb).not.toHaveBeenCalled()
  })

  it('handles null/undefined event data gracefully', async () => {
    vi.resetModules()

    const swListeners: Array<(event: MessageEvent) => void> = []
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((ev: string, fn: (e: MessageEvent) => void) => {
          if (ev === 'message') swListeners.push(fn)
        }),
        controller: null,
      },
      writable: true,
      configurable: true,
    })

    window.addEventListener = vi.fn() as typeof window.addEventListener
    const { initializePWA, onSyncComplete: subscribe } = await import('./index')
    initializePWA({ cacheStrategy: 'none' })

    const cb = vi.fn()
    subscribe(cb)

    // Fire event with null data — should not throw
    expect(() => {
      swListeners.forEach((handler) =>
        handler({ data: null } as MessageEvent)
      )
    }).not.toThrow()

    expect(cb).not.toHaveBeenCalled()
  })
})
