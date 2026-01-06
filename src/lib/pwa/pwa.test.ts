/**
 * PWA and Offline Experience Tests
 *
 * Comprehensive tests for service worker, caching, and offline functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isServiceWorkerSupported,
  isStandalone,
  canInstall,
  getOnlineStatus,
  isOnline,
  isOffline,
  registerServiceWorker,
  unregisterServiceWorker,
  checkForUpdates,
  skipWaiting,
  onOnlineStatusChange,
  onSWStateChange,
  onInstallPrompt,
  onUpdateAvailable,
  promptInstall,
  cacheUrls,
  clearAllCaches,
  getCacheStatus,
  getCacheSize,
  requestPersistentStorage,
  isStoragePersistent,
  registerBackgroundSync,
  subscribeToPush,
  getPushSubscription,
  unsubscribeFromPush,
  initializePWA,
  getPWAReadyState,
  DEFAULT_PWA_CONFIG,
  type SWRegistrationState,
  type OnlineStatus,
  type CacheStatus,
  type BeforeInstallPromptEvent,
} from './index'

// Mock service worker registration
const mockRegistration = {
  scope: '/',
  installing: null as ServiceWorker | null,
  waiting: null as ServiceWorker | null,
  active: null as ServiceWorker | null,
  update: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(true),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  pushManager: {
    subscribe: vi.fn(),
    getSubscription: vi.fn().mockResolvedValue(null),
  },
  sync: {
    register: vi.fn().mockResolvedValue(undefined),
  },
}

// Mock service worker
const mockServiceWorker = {
  state: 'activated' as ServiceWorkerState,
  scriptURL: '/sw.js',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  postMessage: vi.fn(),
}

// Mock push subscription
const mockPushSubscription = {
  endpoint: 'https://push.example.com/123',
  options: {},
  getKey: vi.fn(),
  toJSON: vi.fn(),
  unsubscribe: vi.fn().mockResolvedValue(true),
}

describe('PWA and Offline Experience', () => {
  describe('Configuration', () => {
    it('should have correct default configuration', () => {
      expect(DEFAULT_PWA_CONFIG.swPath).toBe('/sw.js')
      expect(DEFAULT_PWA_CONFIG.swScope).toBe('/')
      expect(DEFAULT_PWA_CONFIG.enableOfflineAnalytics).toBe(true)
      expect(DEFAULT_PWA_CONFIG.enableBackgroundSync).toBe(true)
      expect(DEFAULT_PWA_CONFIG.cacheStrategy).toBe('aggressive')
    })
  })

  describe('Service Worker Support Detection', () => {
    beforeEach(() => {
      // Reset navigator mock
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn(),
          getRegistrations: vi.fn(),
          controller: mockServiceWorker,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        onLine: true,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should detect service worker support', () => {
      expect(isServiceWorkerSupported()).toBe(true)
    })

    it('should detect when service workers are not supported', () => {
      vi.stubGlobal('navigator', { onLine: true })
      expect(isServiceWorkerSupported()).toBe(false)
    })
  })

  describe('Standalone Mode Detection', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: { standalone: undefined },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('document', {
        referrer: '',
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should detect standalone mode via display-mode', () => {
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
        navigator: {},
        addEventListener: vi.fn(),
      })
      vi.stubGlobal('document', { referrer: '' })

      expect(isStandalone()).toBe(true)
    })

    it('should detect standalone mode via navigator.standalone (iOS)', () => {
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: { standalone: true },
        addEventListener: vi.fn(),
      })
      vi.stubGlobal('document', { referrer: '' })

      expect(isStandalone()).toBe(true)
    })

    it('should detect standalone mode via Android TWA referrer', () => {
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: {},
        addEventListener: vi.fn(),
      })
      vi.stubGlobal('document', { referrer: 'android-app://com.example' })

      expect(isStandalone()).toBe(true)
    })

    it('should return false when not in standalone mode', () => {
      expect(isStandalone()).toBe(false)
    })
  })

  describe('Online Status', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should return online when navigator.onLine is true', () => {
      vi.stubGlobal('navigator', { onLine: true })
      expect(getOnlineStatus()).toBe('online')
      expect(isOnline()).toBe(true)
      expect(isOffline()).toBe(false)
    })

    it('should return offline when navigator.onLine is false', () => {
      vi.stubGlobal('navigator', { onLine: false })
      expect(getOnlineStatus()).toBe('offline')
      expect(isOnline()).toBe(false)
      expect(isOffline()).toBe(true)
    })

    it('should detect slow connection from Network Information API', () => {
      vi.stubGlobal('navigator', {
        onLine: true,
        connection: {
          effectiveType: 'slow-2g',
        },
      })
      expect(getOnlineStatus()).toBe('slow')
    })

    it('should detect slow connection from low downlink', () => {
      vi.stubGlobal('navigator', {
        onLine: true,
        connection: {
          effectiveType: '4g',
          downlink: 0.3,
        },
      })
      expect(getOnlineStatus()).toBe('slow')
    })

    it('should return online for good connection', () => {
      vi.stubGlobal('navigator', {
        onLine: true,
        connection: {
          effectiveType: '4g',
          downlink: 10,
        },
      })
      expect(getOnlineStatus()).toBe('online')
    })
  })

  describe('Service Worker Registration', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
          controller: mockServiceWorker,
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should register service worker successfully', async () => {
      const registration = await registerServiceWorker()
      expect(registration).toBeDefined()
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
      })
    })

    it('should register service worker with custom config', async () => {
      await registerServiceWorker({
        swPath: '/custom-sw.js',
        swScope: '/app/',
      })
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
        '/custom-sw.js',
        { scope: '/app/' }
      )
    })

    it('should return null when service workers not supported', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      const registration = await registerServiceWorker()
      expect(registration).toBeNull()
    })

    it('should handle registration failure', async () => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockRejectedValue(new Error('Registration failed')),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      const registration = await registerServiceWorker()
      expect(registration).toBeNull()
    })
  })

  describe('Service Worker Unregistration', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should unregister all service workers', async () => {
      const result = await unregisterServiceWorker()
      expect(result).toBe(true)
      expect(mockRegistration.unregister).toHaveBeenCalled()
    })

    it('should return false when service workers not supported', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      const result = await unregisterServiceWorker()
      expect(result).toBe(false)
    })
  })

  describe('Update Checking', () => {
    it('should check for updates', async () => {
      // First register a service worker
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      const updateInfo = await checkForUpdates()

      expect(mockRegistration.update).toHaveBeenCalled()
      expect(updateInfo).toHaveProperty('hasUpdate')
      expect(updateInfo).toHaveProperty('waiting')
      expect(updateInfo).toHaveProperty('installing')
    })

    it('should return no update when no registration', async () => {
      const updateInfo = await checkForUpdates()
      expect(updateInfo.hasUpdate).toBe(false)
    })
  })

  describe('Event Subscriptions', () => {
    it('should subscribe to online status changes', () => {
      const callback = vi.fn()
      const unsubscribe = onOnlineStatusChange(callback)
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })

    it('should subscribe to SW state changes', () => {
      const callback = vi.fn()
      const unsubscribe = onSWStateChange(callback)
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })

    it('should subscribe to install prompts', () => {
      const callback = vi.fn()
      const unsubscribe = onInstallPrompt(callback)
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })

    it('should subscribe to updates', () => {
      const callback = vi.fn()
      const unsubscribe = onUpdateAvailable(callback)
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('Install Prompt', () => {
    it('should return false when no install prompt available', () => {
      expect(canInstall()).toBe(false)
    })

    it('should return null when prompting without deferred event', async () => {
      const result = await promptInstall()
      expect(result).toBeNull()
    })
  })

  describe('Cache Management', () => {
    beforeEach(() => {
      vi.stubGlobal('caches', {
        keys: vi.fn().mockResolvedValue(['cache-1', 'cache-2']),
        open: vi.fn().mockResolvedValue({
          keys: vi.fn().mockResolvedValue([
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
          ]),
        }),
        delete: vi.fn().mockResolvedValue(true),
      })
      vi.stubGlobal('navigator', {
        serviceWorker: {
          controller: {
            postMessage: vi.fn(),
          },
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should cache specific URLs', async () => {
      await cacheUrls(['/page1', '/page2'])
      expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
        type: 'CACHE_URLS',
        payload: { urls: ['/page1', '/page2'] },
      })
    })

    it('should clear all caches', async () => {
      const result = await clearAllCaches()
      expect(result).toBe(true)
      expect(caches.delete).toHaveBeenCalledWith('cache-1')
      expect(caches.delete).toHaveBeenCalledWith('cache-2')
    })

    it('should get cache status', async () => {
      const status = await getCacheStatus()
      expect(status).toHaveProperty('cache-1')
      expect(status).toHaveProperty('cache-2')
      expect(status['cache-1'].count).toBe(2)
    })

    it('should handle cache status errors gracefully', async () => {
      vi.stubGlobal('caches', {
        keys: vi.fn().mockRejectedValue(new Error('Cache error')),
      })

      const status = await getCacheStatus()
      expect(status).toEqual({})
    })
  })

  describe('Storage Estimation', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should get cache size', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn().mockResolvedValue({ usage: 1024 * 1024 }),
        },
        onLine: true,
      })

      const size = await getCacheSize()
      expect(size).toBe(1024 * 1024)
    })

    it('should return 0 when storage API not available', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      const size = await getCacheSize()
      expect(size).toBe(0)
    })

    it('should handle estimation errors', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn().mockRejectedValue(new Error('Error')),
        },
        onLine: true,
      })

      const size = await getCacheSize()
      expect(size).toBe(0)
    })
  })

  describe('Persistent Storage', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should request persistent storage', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          persist: vi.fn().mockResolvedValue(true),
        },
        onLine: true,
      })

      const result = await requestPersistentStorage()
      expect(result).toBe(true)
    })

    it('should check if storage is persistent', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          persisted: vi.fn().mockResolvedValue(true),
        },
        onLine: true,
      })

      const result = await isStoragePersistent()
      expect(result).toBe(true)
    })

    it('should return false when storage API not available', async () => {
      vi.stubGlobal('navigator', { onLine: true })

      expect(await requestPersistentStorage()).toBe(false)
      expect(await isStoragePersistent()).toBe(false)
    })
  })

  describe('Background Sync', () => {
    beforeEach(async () => {
      mockRegistration.sync = {
        register: vi.fn().mockResolvedValue(undefined),
      }
      // Clear any previous registration
      vi.stubGlobal('navigator', {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([]),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
      await unregisterServiceWorker()
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should register background sync', async () => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      const result = await registerBackgroundSync('sync-policies')

      expect(result).toBe(true)
      expect(mockRegistration.sync.register).toHaveBeenCalledWith('sync-policies')
    })

    it('should return false when no registration', async () => {
      // Ensure no registration exists
      vi.stubGlobal('navigator', { onLine: true })
      const result = await registerBackgroundSync('sync-policies')
      expect(result).toBe(false)
    })
  })

  describe('Push Notifications', () => {
    beforeEach(async () => {
      mockRegistration.pushManager = {
        subscribe: vi.fn().mockResolvedValue(mockPushSubscription),
        getSubscription: vi.fn().mockResolvedValue(mockPushSubscription),
      }
      // Clear any previous registration
      vi.stubGlobal('navigator', {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([]),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
      await unregisterServiceWorker()
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should subscribe to push notifications', async () => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      const subscription = await subscribeToPush('test-vapid-key')

      expect(subscription).toBeDefined()
    })

    it('should get current push subscription', async () => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      const subscription = await getPushSubscription()

      expect(subscription).toBeDefined()
    })

    it('should unsubscribe from push', async () => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      const result = await unsubscribeFromPush()

      expect(result).toBe(true)
    })

    it('should return null when no registration', async () => {
      // Ensure no registration exists
      vi.stubGlobal('navigator', { onLine: true })
      const subscription = await subscribeToPush('test-key')
      expect(subscription).toBeNull()
    })
  })

  describe('Skip Waiting', () => {
    it('should skip waiting when there is a waiting worker', async () => {
      const waitingWorker = { ...mockServiceWorker, postMessage: vi.fn() }
      mockRegistration.waiting = waitingWorker as unknown as ServiceWorker

      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()
      await skipWaiting()

      expect(waitingWorker.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      })
    })
  })

  describe('PWA Ready State', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn(),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
      vi.stubGlobal('window', {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: {},
        addEventListener: vi.fn(),
      })
      vi.stubGlobal('document', { referrer: '' })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should return correct ready state', () => {
      const state = getPWAReadyState()

      expect(state).toHaveProperty('isSupported')
      expect(state).toHaveProperty('isStandalone')
      expect(state).toHaveProperty('isOnline')
      expect(state).toHaveProperty('canInstall')
      expect(state).toHaveProperty('hasRegistration')
    })

    it('should reflect service worker support', () => {
      const state = getPWAReadyState()
      expect(state.isSupported).toBe(true)
    })

    it('should reflect online status', () => {
      const state = getPWAReadyState()
      expect(state.isOnline).toBe(true)
    })
  })

  describe('Initialize PWA', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        addEventListener: vi.fn(),
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
        navigator: {},
      })
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })
      vi.stubGlobal('document', { referrer: '' })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should initialize without errors', () => {
      expect(() => initializePWA()).not.toThrow()
    })

    it('should register event listeners', () => {
      initializePWA()
      expect(window.addEventListener).toHaveBeenCalled()
    })

    it('should register service worker with default config', () => {
      initializePWA()
      expect(navigator.serviceWorker.register).toHaveBeenCalled()
    })

    it('should skip service worker registration when cacheStrategy is none', () => {
      const registerSpy = vi.spyOn(navigator.serviceWorker, 'register')
      registerSpy.mockClear()

      initializePWA({ cacheStrategy: 'none' })

      expect(registerSpy).not.toHaveBeenCalled()
    })
  })

  describe('Real-World Scenarios', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should handle offline to online transition', async () => {
      const statusChanges: OnlineStatus[] = []
      onOnlineStatusChange((status) => statusChanges.push(status))

      // Simulate offline
      vi.stubGlobal('navigator', { onLine: false })
      expect(isOffline()).toBe(true)

      // Simulate online
      vi.stubGlobal('navigator', { onLine: true })
      expect(isOnline()).toBe(true)
    })

    it('should handle service worker lifecycle', async () => {
      const states: SWRegistrationState[] = []
      onSWStateChange((state) => states.push(state))

      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(mockRegistration),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      await registerServiceWorker()

      // Should have captured some state changes
      expect(states.length).toBeGreaterThan(0)
    })

    it('should handle cache clearing in low storage situations', async () => {
      vi.stubGlobal('caches', {
        keys: vi.fn().mockResolvedValue(['old-cache-v1', 'old-cache-v2']),
        delete: vi.fn().mockResolvedValue(true),
      })

      const cleared = await clearAllCaches()
      expect(cleared).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should handle undefined navigator.connection', () => {
      vi.stubGlobal('navigator', { onLine: true })
      expect(getOnlineStatus()).toBe('online')
    })

    it('should handle cache operations when caches API unavailable', async () => {
      vi.stubGlobal('caches', undefined)

      const status = await getCacheStatus()
      expect(status).toEqual({})
    })

    it('should handle multiple unsubscribe calls', () => {
      const callback = vi.fn()
      const unsubscribe = onOnlineStatusChange(callback)

      unsubscribe()
      unsubscribe() // Second call should not throw

      expect(true).toBe(true) // No error thrown
    })

    it('should handle service worker registration with active worker', async () => {
      const regWithActive = {
        ...mockRegistration,
        active: mockServiceWorker,
        installing: null,
        waiting: null,
      }

      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(regWithActive),
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      const registration = await registerServiceWorker()
      expect(registration).toBeDefined()
    })

    it('should handle service worker registration with waiting worker', async () => {
      const regWithWaiting = {
        ...mockRegistration,
        waiting: mockServiceWorker,
        installing: null,
        active: mockServiceWorker,
      }

      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(regWithWaiting),
          controller: mockServiceWorker,
          addEventListener: vi.fn(),
        },
        onLine: true,
      })

      const updateCallbackMock = vi.fn()
      onUpdateAvailable(updateCallbackMock)

      await registerServiceWorker()

      // Should notify about update
      expect(updateCallbackMock).toHaveBeenCalled()
    })
  })

  describe('Type Safety', () => {
    it('should export correct types', () => {
      const config: typeof DEFAULT_PWA_CONFIG = {
        swPath: '/sw.js',
        swScope: '/',
        enableOfflineAnalytics: true,
        enableBackgroundSync: true,
        cacheStrategy: 'aggressive',
      }

      expect(config.cacheStrategy).toBe('aggressive')
    })

    it('should handle SWRegistrationState type', () => {
      const validStates: SWRegistrationState[] = [
        'pending',
        'installing',
        'installed',
        'activating',
        'activated',
        'redundant',
        'error',
      ]

      expect(validStates).toHaveLength(7)
    })

    it('should handle OnlineStatus type', () => {
      const validStatuses: OnlineStatus[] = ['online', 'offline', 'slow']
      expect(validStatuses).toHaveLength(3)
    })
  })
})
