import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './lib/pwaInstall' // capture beforeinstallprompt early; install lives in Settings

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// Register the PWA service worker (production only — avoids dev caching headaches).
//
// Keep an installed PWA in sync with new deploys WITHOUT a manual refresh — the case
// that worries us: a customer added the app to their home screen weeks ago, we push
// new code, they reopen it. Network-first navigation already serves fresh code on a
// COLD open; this also covers a PWA resumed from the BACKGROUND:
//   1) on every focus, ask the browser to re-check /sw.js (registration.update());
//   2) when a new SW takes control, reload ONCE to run the fresh code — but never
//      while the user is typing (don't nuke an in-progress hand). The reload only
//      arms once the page is already controlled, so first install never reloads.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    }).catch((err) => console.warn('SW registration failed:', err))

    if (navigator.serviceWorker.controller) {
      let reloaded = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return
        const el = document.activeElement
        const typing = el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && el.value
        if (typing) return // they'll get the new version on their next open instead
        reloaded = true
        window.location.reload()
      })
    }
  })
}
