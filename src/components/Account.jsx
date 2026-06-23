import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePro } from '../hooks/usePro'
import { openBillingPortal } from '../lib/portal'
import Paywall from './Paywall'

// Dedicated Account page (its own screen, reached from the Preferences panel's
// "Account" link) — so identity, billing and deletion live here instead of
// cluttering the small settings dropdown. Rendered as an in-app route inside Layout.
const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', surfaceHigh:'#252D3A',
  border:'#21262D', text:'#E6EDF3', textMuted:'#7D8590', primary:'#54e98a', red:'#f47067',
}

function Section({ title, children }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'16px' }}>
      <div style={{ fontSize:'0.56rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'10px' }}>{title}</div>
      {children}
    </div>
  )
}

export default function Account() {
  const navigate = useNavigate()
  const { deleteAccount, session, setShowLogin } = useAuth()
  const { isPro, refresh: refreshPro } = usePro()
  const isAnon = !!session?.user?.is_anonymous
  const email  = session?.user?.email || ''

  const [confirming,    setConfirming]    = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [delError,      setDelError]      = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError,   setPortalError]   = useState('')
  const [showPaywall,   setShowPaywall]   = useState(false)

  async function handleManageSubscription() {
    setPortalLoading(true)
    setPortalError('')
    try {
      await openBillingPortal()   // redirects on success
    } catch (e) {
      setPortalError(e.message || 'Could not open billing portal.')
      setPortalLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDelError('')
    const err = await deleteAccount()
    if (err) {
      setDelError(err.message || 'Could not delete account')
      setDeleting(false)
      setConfirming(false)
    }
    // On success the auth state changes and the whole app unmounts to the login screen.
  }

  return (
    <div style={{ height:'100%', overflowY:'auto', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif" }}>
      <div style={{ maxWidth:'520px', margin:'0 auto', padding:'20px 16px 48px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display:'flex', alignItems:'center', gap:'6px', background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.8rem', padding:0, marginBottom:'16px' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <h1 style={{ fontSize:'1.3rem', fontWeight:700, letterSpacing:'-0.02em', margin:'0 0 18px' }}>Account</h1>

        {isAnon ? (
          <Section title="Account">
            <div style={{ fontSize:'0.85rem', color:C.textMuted, lineHeight:1.6, marginBottom:'12px' }}>
              You're a guest — your leak profile is saved on this device only. Sign in to keep it safe and sync it across devices.
            </div>
            <button
              onClick={() => setShowLogin(true)}
              style={{ width:'100%', padding:'11px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.82rem', fontWeight:800, cursor:'pointer' }}
            >
              Sign in / Create account
            </button>
          </Section>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <Section title="Signed in as">
              <div style={{ fontSize:'0.9rem', color:C.text, wordBreak:'break-all' }}>{email || 'Signed in'}</div>
            </Section>

            {isPro ? (
              <Section title="Subscription">
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  style={{
                    width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                    padding:'11px', borderRadius:'9px', border:`1px solid ${C.border}`, background:C.surfaceHigh,
                    color:C.text, fontSize:'0.82rem', fontWeight:600, cursor: portalLoading ? 'not-allowed' : 'pointer',
                    opacity: portalLoading ? 0.6 : 1,
                  }}
                >
                  <CreditCard size={15} /> {portalLoading ? 'Opening…' : 'Manage subscription'}
                </button>
                <div style={{ fontSize:'0.74rem', color:C.textMuted, marginTop:'8px', lineHeight:1.5 }}>
                  Update payment, view invoices, or cancel — on Stripe.
                </div>
                {portalError && <div style={{ fontSize:'0.76rem', color:C.red, marginTop:'8px' }}>{portalError}</div>}
              </Section>
            ) : (
              // A direct path to buy Pro that doesn't depend on first logging hands —
              // the Leak Profile/Quiz paywalls only appear once there's data, so a brand-new
              // account had no way to subscribe before reaching this page.
              <Section title="Subscription">
                <div style={{ fontSize:'0.82rem', color:C.text, fontWeight:600, marginBottom:'4px' }}>You're on the free plan</div>
                <div style={{ fontSize:'0.74rem', color:C.textMuted, lineHeight:1.55, marginBottom:'12px' }}>
                  Unlock your full Leak Profile, the $ cost of each leak, and a step-by-step fix plan built from your own hands.
                </div>
                <button
                  onClick={() => setShowPaywall(true)}
                  style={{ width:'100%', padding:'11px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.82rem', fontWeight:800, cursor:'pointer' }}
                >
                  Go Pro
                </button>
              </Section>
            )}

            <Section title="Delete account">
              {!confirming ? (
                <button
                  onClick={() => { setConfirming(true); setDelError('') }}
                  style={{ width:'100%', padding:'10px', borderRadius:'9px', border:'1px solid rgba(244,112,103,0.35)', background:'transparent', color:C.red, fontSize:'0.8rem', fontWeight:600, cursor:'pointer' }}
                >
                  Delete account
                </button>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  <div style={{ fontSize:'0.8rem', color:C.textMuted, lineHeight:1.6 }}>
                    This permanently deletes your account and all hands, sessions and data. This cannot be undone.
                  </div>
                  {isPro && (
                    <div style={{ fontSize:'0.8rem', color:C.red, lineHeight:1.6 }}>
                      Your Pro subscription will be canceled immediately. Remaining subscription time is non-refundable.
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button
                      onClick={() => setConfirming(false)}
                      disabled={deleting}
                      style={{ flex:1, padding:'10px', borderRadius:'9px', border:'none', background:C.surfaceHigh, color:C.textMuted, fontSize:'0.8rem', fontWeight:600, cursor:'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{ flex:1, padding:'10px', borderRadius:'9px', border:'none', background:C.red, color:'#1a0a08', fontSize:'0.8rem', fontWeight:700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
                    >
                      {deleting ? 'Deleting…' : 'Delete everything'}
                    </button>
                  </div>
                </div>
              )}
              {delError && <div style={{ fontSize:'0.76rem', color:C.red, marginTop:'8px' }}>{delError}</div>}
            </Section>
          </div>
        )}

        <div style={{ marginTop:'28px', textAlign:'center', fontSize:'0.66rem', color:C.textMuted }}>
          MicroPoker Master · v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
        </div>
      </div>

      {showPaywall && (
        <Paywall onClose={() => setShowPaywall(false)} onRestore={refreshPro} />
      )}
    </div>
  )
}
