/* global self, caches, fetch, URL, Response, Headers, clients, console, indexedDB */
/**
 * InsurAI Service Worker
 *
 * Provides offline functionality, caching, and PWA features.
 * Cache strategies:
 * - Static assets: Cache-first (long-term caching)
 * - API responses: Network-first with cache fallback
 * - HTML pages: Stale-while-revalidate
 */

const CACHE_VERSION = 'v16'
const STATIC_CACHE = `insurai-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `insurai-dynamic-${CACHE_VERSION}`
const API_CACHE = `insurai-api-${CACHE_VERSION}`

// Static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
]

// Cache duration in milliseconds
const CACHE_DURATIONS = {
  static: 7 * 24 * 60 * 60 * 1000, // 7 days
  dynamic: 24 * 60 * 60 * 1000, // 1 day
  api: 5 * 60 * 1000, // 5 minutes
}

// Install event - precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching static assets')
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => {
        console.log('[SW] Skip waiting')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error)
      })
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return (
                name.startsWith('insurai-') &&
                name !== STATIC_CACHE &&
                name !== DYNAMIC_CACHE &&
                name !== API_CACHE
              )
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => {
        console.log('[SW] Claiming clients')
        return self.clients.claim()
      })
  )
})

// Fetch event - handle requests with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip cross-origin requests (except fonts and CDN assets)
  if (
    url.origin !== self.location.origin &&
    !url.hostname.includes('fonts.') &&
    !url.hostname.includes('unpkg.com') &&
    !url.hostname.includes('cdn.jsdelivr.net')
  ) {
    return
  }

  // API requests - network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  // Static assets (JS, CSS, images) - cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // HTML pages - stale-while-revalidate
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE))
    return
  }

  // Default - network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE))
})

/**
 * Check if request is for a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js',
    '.css',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
  ]
  return staticExtensions.some((ext) => pathname.endsWith(ext))
}

/**
 * Cache-first strategy
 * Try cache, fallback to network, update cache
 */
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      // Check if cache is still valid
      const cacheDate = cachedResponse.headers.get('sw-cache-date')
      if (cacheDate) {
        const age = Date.now() - parseInt(cacheDate, 10)
        if (age < CACHE_DURATIONS.static) {
          return cachedResponse
        }
      } else {
        return cachedResponse
      }
    }

    const networkResponse = await fetch(request)

    // Guard against MIME-type mismatch: if we requested a JS/CSS file but got
    // text/html back, the asset is missing (server returned SPA index.html).
    // Don't cache the wrong response — notify clients to reload instead.
    const contentType = networkResponse.headers.get('content-type') || ''
    const requestedExt = new URL(request.url).pathname.split('.').pop()
    const isJsOrCss = requestedExt === 'js' || requestedExt === 'css'
    if (isJsOrCss && contentType.includes('text/html')) {
      console.warn('[SW] MIME mismatch: requested', requestedExt, 'but got text/html — asset missing, triggering reload')
      notifyClients({ type: 'ASSET_MISSING', payload: { url: request.url } })
      return networkResponse
    }

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName)
      const responseToCache = networkResponse.clone()

      // Add cache timestamp
      const headers = new Headers(responseToCache.headers)
      headers.set('sw-cache-date', Date.now().toString())

      const cachedResponseWithDate = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      })

      cache.put(request, cachedResponseWithDate)
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    throw error
  }
}

/**
 * Network-first strategy
 * Try network, fallback to cache
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlinePage = await caches.match('/offline.html')
      if (offlinePage) {
        return offlinePage
      }
    }

    throw error
  }
}

/**
 * Stale-while-revalidate strategy
 * Return cached version immediately, update cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    })
    .catch(() => null)

  return cachedResponse || (await fetchPromise) || (await caches.match('/offline.html'))
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || 'New notification from InsurAI',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [],
  }

  event.waitUntil(self.registration.showNotification(data.title || 'InsurAI', options))
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-policies') {
    event.waitUntil(syncPolicies())
  }
})

/**
 * Sync policies that were saved offline.
 * Reads pending policy uploads from the 'offline_sync' IndexedDB store
 * and replays them against the server API when connectivity is restored.
 */
async function syncPolicies() {
  const DB_NAME = 'insurai_offline'
  const STORE_NAME = 'pending_uploads'

  try {
    console.warn('[SW] Background sync: checking for pending policy uploads')

    // Open IndexedDB for pending uploads
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = (event) => {
        const database = event.target.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    // Read all pending uploads
    const pending = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })

    if (pending.length === 0) {
      console.warn('[SW] Background sync: no pending uploads')
      notifyClients({ type: 'SYNC_COMPLETE', payload: { success: true, synced: 0 } })
      db.close()
      return
    }

    console.warn(`[SW] Background sync: replaying ${pending.length} pending upload(s)`)

    let synced = 0
    let failed = 0

    for (const item of pending) {
      try {
        const response = await fetch(item.url || '/api/ai/extract', {
          method: 'POST',
          headers: item.headers || { 'Content-Type': 'application/json' },
          body: item.body,
        })

        if (response.ok) {
          // Remove from pending store on success
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            const deleteReq = store.delete(item.id)
            deleteReq.onsuccess = () => resolve()
            deleteReq.onerror = () => reject(deleteReq.error)
          })
          synced++
        } else {
          console.warn(`[SW] Background sync: server returned ${response.status} for item ${item.id}`)
          failed++
        }
      } catch (err) {
        console.warn(`[SW] Background sync: failed to sync item ${item.id}:`, err)
        failed++
      }
    }

    db.close()
    console.warn(`[SW] Background sync complete: ${synced} synced, ${failed} failed`)

    notifyClients({
      type: 'SYNC_COMPLETE',
      payload: { success: failed === 0, synced, failed },
    })
  } catch (error) {
    console.error('[SW] Background sync error:', error)
    notifyClients({
      type: 'SYNC_COMPLETE',
      payload: { success: false, error: error.message || 'Sync failed' },
    })
  }
}

/**
 * Notify all connected clients with a message
 */
async function notifyClients(message) {
  const allClients = await self.clients.matchAll()
  allClients.forEach((client) => {
    client.postMessage(message)
  })
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data?.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(event.data.payload.urls)
      })
    )
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)))
      })
    )
  }

  if (event.data?.type === 'GET_CACHE_STATUS') {
    event.waitUntil(
      getCacheStatus().then((status) => {
        event.source.postMessage({
          type: 'CACHE_STATUS',
          payload: status,
        })
      })
    )
  }
})

/**
 * Get current cache status
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys()
  const status = {}

  for (const name of cacheNames) {
    const cache = await caches.open(name)
    const keys = await cache.keys()
    status[name] = {
      count: keys.length,
      urls: keys.map((req) => req.url),
    }
  }

  return status
}
