/* eslint-disable no-console -- Intentional console output for PWA debugging and user feedback */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- Assertion used after assignment check */
/**
 * PWA and Offline Experience Module
 *
 * Provides utilities for:
 * - Service worker registration and management
 * - Offline detection and status
 * - Cache management
 * - Install prompts
 * - Background sync
 */

// Service Worker registration states
export type SWRegistrationState =
  | 'pending'
  | 'installing'
  | 'installed'
  | 'activating'
  | 'activated'
  | 'redundant'
  | 'error'

// Online status
export type OnlineStatus = 'online' | 'offline' | 'slow'

// PWA install prompt event
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

// Service worker update info
export interface SWUpdateInfo {
  hasUpdate: boolean
  waiting: ServiceWorker | null
  installing: ServiceWorker | null
}

// Cache status
export interface CacheStatus {
  [cacheName: string]: {
    count: number
    urls: string[]
  }
}

// PWA configuration
export interface PWAConfig {
  swPath: string
  swScope: string
  enableOfflineAnalytics: boolean
  enableBackgroundSync: boolean
  cacheStrategy: 'aggressive' | 'conservative' | 'none'
}

// Default configuration
export const DEFAULT_PWA_CONFIG: PWAConfig = {
  swPath: '/sw.js',
  swScope: '/',
  enableOfflineAnalytics: true,
  enableBackgroundSync: true,
  cacheStrategy: 'aggressive',
}

// Event callbacks
type OnlineCallback = (status: OnlineStatus) => void
type SWStateCallback = (state: SWRegistrationState, registration?: ServiceWorkerRegistration) => void
type InstallPromptCallback = (event: BeforeInstallPromptEvent) => void
type UpdateCallback = (info: SWUpdateInfo) => void

// Callback storage
const onlineCallbacks: Set<OnlineCallback> = new Set()
const swStateCallbacks: Set<SWStateCallback> = new Set()
const installPromptCallbacks: Set<InstallPromptCallback> = new Set()
const updateCallbacks: Set<UpdateCallback> = new Set()

// Store install prompt event
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null

// Current registration
let currentRegistration: ServiceWorkerRegistration | null = null

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator
}

/**
 * Check if the app is running in standalone mode (installed PWA)
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  )
}

/**
 * Check if the app can be installed
 */
export function canInstall(): boolean {
  return deferredInstallPrompt !== null
}

/**
 * Get current online status
 */
export function getOnlineStatus(): OnlineStatus {
  if (!navigator.onLine) {
    return 'offline'
  }

  // Check connection quality if available
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number }
  }).connection

  if (connection) {
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      return 'slow'
    }
    if (connection.downlink && connection.downlink < 0.5) {
      return 'slow'
    }
  }

  return 'online'
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return navigator.onLine
}

/**
 * Check if currently offline
 */
export function isOffline(): boolean {
  return !navigator.onLine
}

/**
 * Register service worker
 */
export async function registerServiceWorker(
  config: Partial<PWAConfig> = {}
): Promise<ServiceWorkerRegistration | null> {
  const { swPath, swScope } = { ...DEFAULT_PWA_CONFIG, ...config }

  if (!isServiceWorkerSupported()) {
    console.warn('[PWA] Service workers not supported')
    notifyStateChange('error')
    return null
  }

  try {
    notifyStateChange('pending')

    const registration = await navigator.serviceWorker.register(swPath, {
      scope: swScope,
    })

    currentRegistration = registration
    console.log('[PWA] Service worker registered:', registration.scope)

    // Handle registration state changes
    if (registration.installing) {
      notifyStateChange('installing', registration)
      trackInstalling(registration.installing)
    } else if (registration.waiting) {
      notifyStateChange('installed', registration)
      notifyUpdate({ hasUpdate: true, waiting: registration.waiting, installing: null })
    } else if (registration.active) {
      notifyStateChange('activated', registration)
    }

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (newWorker) {
        notifyStateChange('installing', registration)
        trackInstalling(newWorker)
      }
    })

    return registration
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error)
    notifyStateChange('error')
    return null
  }
}

/**
 * Track installing service worker state
 */
function trackInstalling(worker: ServiceWorker): void {
  worker.addEventListener('statechange', () => {
    switch (worker.state) {
      case 'installed':
        notifyStateChange('installed', currentRegistration || undefined)
        if (navigator.serviceWorker.controller) {
          // New update waiting
          notifyUpdate({
            hasUpdate: true,
            waiting: worker,
            installing: null,
          })
        }
        break
      case 'activating':
        notifyStateChange('activating', currentRegistration || undefined)
        break
      case 'activated':
        notifyStateChange('activated', currentRegistration || undefined)
        break
      case 'redundant':
        notifyStateChange('redundant', currentRegistration || undefined)
        break
    }
  })
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const results = await Promise.all(registrations.map((reg) => reg.unregister()))
    currentRegistration = null
    return results.every(Boolean)
  } catch (error) {
    console.error('[PWA] Failed to unregister service worker:', error)
    return false
  }
}

/**
 * Check for service worker updates
 */
export async function checkForUpdates(): Promise<SWUpdateInfo> {
  if (!currentRegistration) {
    return { hasUpdate: false, waiting: null, installing: null }
  }

  try {
    await currentRegistration.update()
    return {
      hasUpdate: Boolean(currentRegistration.waiting || currentRegistration.installing),
      waiting: currentRegistration.waiting,
      installing: currentRegistration.installing,
    }
  } catch (error) {
    console.error('[PWA] Update check failed:', error)
    return { hasUpdate: false, waiting: null, installing: null }
  }
}

/**
 * Skip waiting and activate new service worker
 */
export async function skipWaiting(): Promise<void> {
  if (currentRegistration?.waiting) {
    currentRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
}

/**
 * Subscribe to online status changes
 */
export function onOnlineStatusChange(callback: OnlineCallback): () => void {
  onlineCallbacks.add(callback)
  return () => onlineCallbacks.delete(callback)
}

/**
 * Subscribe to service worker state changes
 */
export function onSWStateChange(callback: SWStateCallback): () => void {
  swStateCallbacks.add(callback)
  return () => swStateCallbacks.delete(callback)
}

/**
 * Subscribe to install prompt
 */
export function onInstallPrompt(callback: InstallPromptCallback): () => void {
  installPromptCallbacks.add(callback)
  // If we already have a deferred prompt, call immediately
  if (deferredInstallPrompt) {
    callback(deferredInstallPrompt)
  }
  return () => installPromptCallbacks.delete(callback)
}

/**
 * Subscribe to update availability
 */
export function onUpdateAvailable(callback: UpdateCallback): () => void {
  updateCallbacks.add(callback)
  return () => updateCallbacks.delete(callback)
}

/**
 * Prompt user to install PWA
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredInstallPrompt) {
    return null
  }

  try {
    await deferredInstallPrompt.prompt()
    const choice = await deferredInstallPrompt.userChoice
    deferredInstallPrompt = null
    return choice.outcome
  } catch (error) {
    console.error('[PWA] Install prompt failed:', error)
    return null
  }
}

/**
 * Cache specific URLs
 */
export async function cacheUrls(urls: string[]): Promise<void> {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_URLS',
      payload: { urls },
    })
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<boolean> {
  try {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
    return true
  } catch (error) {
    console.error('[PWA] Failed to clear caches:', error)
    return false
  }
}

/**
 * Get cache status
 */
export async function getCacheStatus(): Promise<CacheStatus> {
  const status: CacheStatus = {}

  try {
    const cacheNames = await caches.keys()

    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      status[name] = {
        count: keys.length,
        urls: keys.map((req) => req.url),
      }
    }
  } catch (error) {
    console.error('[PWA] Failed to get cache status:', error)
  }

  return status
}

/**
 * Get total cache size in bytes
 */
export async function getCacheSize(): Promise<number> {
  if (!('storage' in navigator && 'estimate' in navigator.storage)) {
    return 0
  }

  try {
    const estimate = await navigator.storage.estimate()
    return estimate.usage || 0
  } catch (error) {
    console.error('[PWA] Failed to estimate storage:', error)
    return 0
  }
}

/**
 * Request persistent storage
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator && 'persist' in navigator.storage)) {
    return false
  }

  try {
    return await navigator.storage.persist()
  } catch (error) {
    console.error('[PWA] Failed to request persistent storage:', error)
    return false
  }
}

/**
 * Check if storage is persistent
 */
export async function isStoragePersistent(): Promise<boolean> {
  if (!('storage' in navigator && 'persisted' in navigator.storage)) {
    return false
  }

  try {
    return await navigator.storage.persisted()
  } catch (_error) {
    return false
  }
}

/**
 * Register for background sync
 */
export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (!currentRegistration || !('sync' in currentRegistration)) {
    return false
  }

  try {
    await (currentRegistration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag)
    return true
  } catch (error) {
    console.error('[PWA] Background sync registration failed:', error)
    return false
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!currentRegistration || !('pushManager' in currentRegistration)) {
    return null
  }

  try {
    const subscription = await currentRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })
    return subscription
  } catch (error) {
    console.error('[PWA] Push subscription failed:', error)
    return null
  }
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!currentRegistration || !('pushManager' in currentRegistration)) {
    return null
  }

  try {
    return await currentRegistration.pushManager.getSubscription()
  } catch (error) {
    console.error('[PWA] Failed to get push subscription:', error)
    return null
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getPushSubscription()
  if (!subscription) {
    return true
  }

  try {
    return await subscription.unsubscribe()
  } catch (error) {
    console.error('[PWA] Push unsubscribe failed:', error)
    return false
  }
}

// Internal notification functions
function notifyStateChange(
  state: SWRegistrationState,
  registration?: ServiceWorkerRegistration
): void {
  swStateCallbacks.forEach((cb) => cb(state, registration))
}

function notifyUpdate(info: SWUpdateInfo): void {
  updateCallbacks.forEach((cb) => cb(info))
}

function notifyOnlineChange(status: OnlineStatus): void {
  onlineCallbacks.forEach((cb) => cb(status))
}

/**
 * Convert base64 to Uint8Array for VAPID key
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Initialize PWA event listeners
 * Call this once when the app starts
 */
export function initializePWA(config: Partial<PWAConfig> = {}): void {
  // Listen for online/offline events
  window.addEventListener('online', () => {
    notifyOnlineChange(getOnlineStatus())
  })

  window.addEventListener('offline', () => {
    notifyOnlineChange('offline')
  })

  // Listen for install prompt
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    installPromptCallbacks.forEach((cb) => cb(deferredInstallPrompt!))
  })

  // Listen for app installed
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    console.log('[PWA] App installed')
  })

  // Listen for controller change (new service worker activated)
  if (isServiceWorkerSupported()) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] New service worker activated, reloading page to get fresh assets')
      // Reload to ensure new bundles are loaded
      window.location.reload()
    })

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        console.log('[PWA] Background sync complete:', event.data.payload)
      }
    })
  }

  // Register service worker
  if (config.cacheStrategy !== 'none') {
    registerServiceWorker(config)
  }
}

/**
 * Create PWA ready state object
 */
export function getPWAReadyState(): {
  isSupported: boolean
  isStandalone: boolean
  isOnline: boolean
  canInstall: boolean
  hasRegistration: boolean
} {
  return {
    isSupported: isServiceWorkerSupported(),
    isStandalone: isStandalone(),
    isOnline: isOnline(),
    canInstall: canInstall(),
    hasRegistration: currentRegistration !== null,
  }
}
