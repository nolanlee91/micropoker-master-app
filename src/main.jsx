import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import UpdateToast from './components/UpdateToast'
import { AuthProvider } from './context/AuthContext'
import './lib/pwaInstall' // capture beforeinstallprompt early; install lives in Settings

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
    <UpdateToast />
  </React.StrictMode>
)

// ── PWA service worker (production only) ──────────────────────────────────────
// Keep an installed PWA in sync with new deploys WITHOUT a manual reinstall, and
// without needing several launches. Each deploy ships a byte-different sw.js (the
// version is stamped per build), so:
//   1) on launch — and again on focus / visibility / regaining network — ask the
//      browser to re-check /sw.js (reg.update());
//   2) when a new worker has installed AND a SW already controls this page (i.e.
//      it's an UPDATE, not the first install): if the user isn't typing, tell it to
//      take over now → reload once; if they ARE typing, show the "Update available"
//      pill and let them tap when ready;
//   3) the first-ever install never reloads (we only arm the reload when the page
//      was already controlled at load).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller

    // Activate a freshly-installed worker — silently if it's safe, or via the pill
    // if the user is mid-hand (don't blow away an in-progress input).
    const promote = (worker) => {
      if (!worker) return
      const el = document.activeElement
      const typing = el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && el.value
      if (typing) window.dispatchEvent(new CustomEvent('sw-update-ready'))
      else worker.postMessage({ type: 'SKIP_WAITING' })
    }

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const checkForUpdate = () => reg.update().catch(() => {})
      checkForUpdate()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)
      window.addEventListener('online', checkForUpdate)

      // An update may already be waiting from a previous visit.
      if (hadController && reg.waiting) promote(reg.waiting)

      // A new worker started installing → promote it once it's ready.
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            promote(reg.waiting || installing)
          }
        })
      })

      // User tapped the "Update available" pill → activate the waiting worker now.
      window.addEventListener('sw-apply-update', () => {
        const w = reg.waiting || reg.installing
        if (w) w.postMessage({ type: 'SKIP_WAITING' })
      })
    }).catch((err) => console.warn('SW registration failed:', err))

    // The new SW took control → run the fresh code once. Only arm when a SW already
    // controlled the page at load, so a FIRST install never triggers a reload.
    if (hadController) {
      let reloaded = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      })
    }
  })
}
