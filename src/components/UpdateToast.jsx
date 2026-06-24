import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// A small, opt-in "Update available" pill. It appears ONLY when a new service worker
// finished installing while the user was mid-hand (typing) — so we never nuke their
// input with an automatic reload. Tapping it activates the waiting worker, which
// triggers the one-time reload in main.jsx. When it's safe (not typing), main.jsx
// updates silently and this never shows. Deliberately quiet — not a growth nag.
export default function UpdateToast() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onReady = () => setShow(true)
    window.addEventListener('sw-update-ready', onReady)
    return () => window.removeEventListener('sw-update-ready', onReady)
  }, [])

  if (!show) return null

  return (
    <div style={{ position:'fixed', left:'50%', bottom:'20px', transform:'translateX(-50%)', zIndex:9999 }}>
      <button
        onClick={() => { setShow(false); window.dispatchEvent(new CustomEvent('sw-apply-update')) }}
        style={{
          display:'flex', alignItems:'center', gap:'8px',
          padding:'9px 16px', borderRadius:'999px', border:'1px solid #21262D',
          background:'#161B22', color:'#E6EDF3', fontSize:'0.76rem', fontWeight:600,
          cursor:'pointer', boxShadow:'0 6px 24px rgba(0,0,0,0.5)',
          fontFamily:"'Inter',sans-serif",
        }}
      >
        <RefreshCw size={13} color="#54e98a" /> Update available — tap to refresh
      </button>
    </div>
  )
}
