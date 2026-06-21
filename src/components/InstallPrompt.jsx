import React, { useEffect, useState } from 'react'
import { Share, Plus, X, Download } from 'lucide-react'

// "Add to Home Screen" helper — deliberately NON-intrusive:
// it only appears AFTER the user has analyzed a hand (the `mpm-got-value` flag),
// so it never interrupts the first-60s "paste → insight" flow or feels like a wall.
// - Android/Chrome: captures `beforeinstallprompt` → one-tap Install.
// - iOS Safari: no programmatic install exists, so we show the manual steps.
// Hidden when already running standalone, or once dismissed.

const DISMISS_KEY = 'a2hs-dismissed-v1'
const VALUE_KEY = 'mpm-got-value'

const C = {
  surface: '#161B22', border: '#21262D', text: '#E6EDF3', muted: '#7D8590',
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null) // Android beforeinstallprompt event
  const [iosHint, setIosHint] = useState(false)  // eligible iOS Safari
  const [gotValue, setGotValue] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    // Only consider showing once the user has actually gotten an analysis.
    if (localStorage.getItem(VALUE_KEY)) setGotValue(true)
    const onValue = () => setGotValue(true)
    window.addEventListener('mpm:got-value', onValue)

    const ua = window.navigator.userAgent || ''
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = isIOS && !/crios|fxios/i.test(ua) // A2HS only works in iOS Safari

    let onBIP, onInstalled
    if (isIOS) {
      if (isSafari) setIosHint(true)
    } else {
      onBIP = (e) => { e.preventDefault(); setDeferred(e) } // capture, but don't show yet
      onInstalled = () => setDeferred(null)
      window.addEventListener('beforeinstallprompt', onBIP)
      window.addEventListener('appinstalled', onInstalled)
    }
    return () => {
      window.removeEventListener('mpm:got-value', onValue)
      if (onBIP) window.removeEventListener('beforeinstallprompt', onBIP)
      if (onInstalled) window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Show only after value AND when there's actually a way to install.
  const visible = gotValue && (deferred || iosHint)
  if (!visible) return null

  const close = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch {}; setDeferred(null); setIosHint(false) }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
  }

  return (
    <div style={{
      position: 'fixed', left: '12px', right: '12px', zIndex: 800,
      bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', // clear the mobile bottom nav
      maxWidth: '460px', margin: '0 auto',
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px',
      padding: '12px 12px 12px 14px', display: 'flex', alignItems: 'center', gap: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>
      <img src="/pwa-192.png" alt="" width={38} height={38} style={{ borderRadius: '9px', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: C.text }}>Install MicroPoker</div>
        {iosHint ? (
          <div style={{ fontSize: '0.72rem', color: C.muted, lineHeight: 1.5, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            Tap <Share size={12} style={{ verticalAlign: 'middle' }} /> then
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: C.text, fontWeight: 600 }}>
              <Plus size={12} /> Add to Home Screen
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '0.72rem', color: C.muted, lineHeight: 1.5, marginTop: '2px' }}>
            Opens full-screen, like an app.
          </div>
        )}
      </div>

      {!iosHint && (
        <button onClick={install} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
          padding: '9px 14px', borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color: '#061a0e',
          fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
        }}>
          <Download size={14} /> Install
        </button>
      )}
      <button onClick={close} aria-label="Dismiss" style={{
        flexShrink: 0, background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
        display: 'flex', padding: '4px',
      }}>
        <X size={16} />
      </button>
    </div>
  )
}
