/* global self, caches, fetch, URL, Response, Headers, clients, console */
/**
 * InsurAI Service Worker
 *
 * Provides offline functionality, caching, and PWA features.
 * Cache strategies:
 * - Static assets: Cache-first (long-term caching)
 * - API responses: Network-first with cache fallback
 * - HTML pages: Stale-while-revalidate
 */

const CACHE_VERSION = 'v4'
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
 * Sync policies that were saved offline
 */
async function syncPolicies() {
  try {
    // Get pending policies from IndexedDB
    // This is a placeholder - actual implementation would use IndexedDB
    console.log('[SW] Syncing offline policies')

    // Notify clients that sync is complete
    const clients = await self.clients.matchAll()
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        payload: { success: true },
      })
    })
  } catch (error) {
    console.error('[SW] Sync failed:', error)
  }
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
