import { useEffect, useState } from 'react'

// PWA install, surfaced quietly in Settings — never as a banner.
// `beforeinstallprompt` fires once, early, so we capture it at module load
// (this file is imported at app startup) and expose it via a hook.

let deferred = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '')
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const isIOS = () => /iphone|ipad|ipod/i.test(ua())
const isIOSSafari = () => isIOS() && !/crios|fxios/i.test(ua()) // A2HS only works in iOS Safari

export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  try { await deferred.userChoice } catch {}
  deferred = null; emit()
  return true
}

// Returns what the UI needs to render an install row:
//   show         — worth showing at all (installable, and not already installed)
//   canInstall   — Android/desktop Chrome: a one-tap prompt is available
//   iosSafari    — iOS Safari: show the manual Share → Add to Home Screen steps
export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const cb = () => force((n) => n + 1)
    subs.add(cb)
    return () => subs.delete(cb)
  }, [])
  const standalone = isStandalone()
  const canInstall = !!deferred
  const iosSafari = isIOSSafari()
  const iosOther = isIOS() && !iosSafari   // iOS in Chrome/Firefox — A2HS only works in Safari
  return { standalone, canInstall, iosSafari, iosOther, show: !standalone && (canInstall || iosSafari || iosOther), promptInstall }
}
