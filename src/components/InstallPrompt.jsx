import React, { useEffect, useState } from 'react'
import { Share, Plus, X, Download } from 'lucide-react'

// "Add to Home Screen" helper.
// - Android/Chrome: captures `beforeinstallprompt` → one-tap Install button.
// - iOS Safari: there is NO programmatic install — iOS only allows manual
//   Share → "Add to Home Screen", so we show those steps instead.
// Hidden once the app already runs standalone, or after the user dismisses it.

const DISMISS_KEY = 'a2hs-dismissed-v1'

const C = {
  surface: '#161B22', border: '#21262D', text: '#E6EDF3', muted: '#7D8590',
  primary: '#54e98a',
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null) // Android beforeinstallprompt event
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const ua = window.navigator.userAgent || ''
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = isIOS && !/crios|fxios/i.test(ua) // A2HS only works in iOS Safari

    if (isIOS) {
      if (isSafari) { setIosHint(true); setShow(true) }
      return // iOS never fires beforeinstallprompt
    }

    const onBIP = (e) => {
      e.preventDefault()      // stop Chrome's mini-infobar; show our own UI
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', () => setShow(false))
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  if (!show) return null

  const close = () => { setShow(false); try { localStorage.setItem(DISMISS_KEY, '1') } catch {} }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null); setShow(false)
  }

  return (
    <div style={{
      position: 'fixed', left: '12px', right: '12px', zIndex: 800,
      bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', // clear the mobile bottom nav
      maxWidth: '460px', margin: '0 auto',
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px',
      padding: '14px 14px 14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }}>
      <img src="/pwa-192.png" alt="" width={40} height={40} style={{ borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: C.text }}>Cài MicroPoker lên màn hình chính</div>
        {iosHint ? (
          <div style={{ fontSize: '0.74rem', color: C.muted, lineHeight: 1.5, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            Bấm <Share size={13} style={{ verticalAlign: 'middle' }} /> Share rồi chọn
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: C.text, fontWeight: 600 }}>
              <Plus size={13} /> Add to Home Screen
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '0.74rem', color: C.muted, lineHeight: 1.5, marginTop: '3px' }}>
            Mở nhanh như app, toàn màn hình.
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
          <Download size={14} /> Cài
        </button>
      )}
      <button onClick={close} aria-label="Đóng" style={{
        flexShrink: 0, background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
        display: 'flex', padding: '4px',
      }}>
        <X size={16} />
      </button>
    </div>
  )
}
