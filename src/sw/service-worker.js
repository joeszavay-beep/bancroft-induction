import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Precache app shell (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Navigation requests — NetworkFirst with 3s timeout, fall back to cached app shell
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

// Supabase storage images (drawings, snag photos, progress photos)
// CacheFirst — once fetched, serve from cache. 30 day expiry, max 300 entries.
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/'),
  new CacheFirst({
    cacheName: 'asset-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
)

// Supabase REST API GET requests — StaleWhileRevalidate
// Serves cached data instantly, refreshes in background
registerRoute(
  ({ url, request }) =>
    url.hostname.includes('supabase.co') &&
    url.pathname.includes('/rest/v1/') &&
    request.method === 'GET',
  new StaleWhileRevalidate({
    cacheName: 'supabase-api',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
)

// Supabase Auth API — NetworkFirst (auth must be fresh when possible)
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.includes('/auth/'),
  new NetworkFirst({
    cacheName: 'supabase-auth',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Google Fonts (if ever used)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
)

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
