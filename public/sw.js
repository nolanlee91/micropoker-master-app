// MicroPoker Master — minimal PWA service worker.
// Goal: make the app installable + app-like, NOT to cache the dynamic parts.
// Hard rule: never cache /api/* or any cross-origin request (Supabase, Stripe,
// Gemini, Google Fonts) — those must always hit the network.

// Bump this string on each release so the new service worker activates and the
// `activate` handler purges the old cache — otherwise an installed PWA can keep
// serving a stale JS bundle even after a fresh deploy.
const VERSION = 'mpm-v4'
const CORE = ['/', '/manifest.webmanifest', '/icon.svg', '/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Only handle same-origin GETs. Cross-origin (Supabase/Stripe/fonts) → network.
  if (url.origin !== self.location.origin) return
  // Never intercept API calls.
  if (url.pathname.startsWith('/api/')) return

  // Navigations: network-first so users always get the latest app shell; fall back
  // to the cached shell only when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req)))
    )
    return
  }

  // Static assets (hashed JS/CSS, icons): stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
