import React, { useState } from 'react'
import { BrainCircuit, Check, X, ShieldCheck, RotateCcw } from 'lucide-react'
import { startCheckout } from '../lib/checkout'

// Paywall for Pro (the Leak Profile). Real billing via Stripe Checkout — the
// button redirects to Stripe's hosted page; the webhook grants Pro on success.
//
// Display prices below are COPY ONLY — the charge is whatever the Stripe Price
// (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL) is set to. Keep them in sync.
// Phase 2 (native): swap startCheckout for RevenueCat and add a real
// "Restore purchases" that re-reads the store entitlement.
const C = {
  surface:'#161B22', surfaceHi:'#1E2530', border:'#21262D',
  text:'#E6EDF3', textMuted:'#7D8590', primary:'#54e98a', secondary:'#92ccff', red:'#f47067',
}

const PERKS = [
  'Full Leak Profile — every leak ranked by $ lost',
  'The $ cost of each leak (not blurred)',
  'A step-by-step fix plan built from your own hands',
  'Deep follow-up coaching on your leaks',
  'Watch your leaks shrink over time',
]

const PLANS = {
  monthly: { label: 'Monthly', price: '$9.99', cadence: '/mo',   note: '' },
  annual:  { label: 'Annual',  price: '$83.99', cadence: '/yr',  note: 'Save 30% — $6.99/mo' },
}

export default function Paywall({ onClose, onRestore }) {
  const [plan,    setPlan]    = useState('monthly')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const upgrade = async () => {
    setLoading(true); setError('')
    try {
      await startCheckout(plan)   // redirects to Stripe on success
    } catch (e) {
      setError(e.message || 'Checkout failed.')
      setLoading(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:600, padding:'18px' }}>
      <div style={{ width:'100%', maxWidth:'360px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:'16px', padding:'22px', display:'flex', flexDirection:'column', gap:'16px', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:'14px', right:'14px', background:'none', border:'none', color:C.textMuted, cursor:'pointer', display:'flex', padding:'2px' }}>
          <X size={16} />
        </button>

        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', textAlign:'center' }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'14px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(146,204,255,0.3)' }}>
            <BrainCircuit size={26} color="#071525" />
          </div>
          <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.text }}>Unlock your Leak Profile</div>
          <div style={{ fontSize:'0.8rem', color:C.textMuted, lineHeight:1.5 }}>
            See exactly which leaks cost you the most — and how to fix them.
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {PERKS.map(p => (
            <div key={p} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'20px', height:'20px', borderRadius:'6px', background:'rgba(84,233,138,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Check size={12} color={C.primary} />
              </div>
              <span style={{ fontSize:'0.82rem', color:C.text }}>{p}</span>
            </div>
          ))}
        </div>

        {/* Plan toggle */}
        <div style={{ display:'flex', gap:'8px' }}>
          {Object.entries(PLANS).map(([key, p]) => {
            const active = plan === key
            return (
              <button key={key} onClick={() => setPlan(key)} style={{
                flex:1, padding:'10px 8px', borderRadius:'10px', cursor:'pointer', textAlign:'center',
                background: active ? 'rgba(84,233,138,0.10)' : C.surfaceHi,
                border: `1.5px solid ${active ? C.primary : C.border}`,
                display:'flex', flexDirection:'column', gap:'2px',
              }}>
                <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color: active ? C.primary : C.textMuted }}>{p.label}</span>
                <span style={{ fontSize:'1rem', fontWeight:800, color:C.text }}>{p.price}<span style={{ fontSize:'0.66rem', fontWeight:400, color:C.textMuted }}>{p.cadence}</span></span>
                {p.note ? <span style={{ fontSize:'0.56rem', color:C.primary, fontWeight:600 }}>{p.note}</span> : null}
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ fontSize:'0.74rem', color:C.red, textAlign:'center' }}>{error}</div>
        )}

        <button onClick={upgrade} disabled={loading} style={{
          width:'100%', padding:'14px', borderRadius:'10px', border:'none',
          background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e',
          fontSize:'0.92rem', fontWeight:700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.25)',
        }}>
          {loading ? 'Redirecting…' : `Upgrade — ${PLANS[plan].price}${PLANS[plan].cadence}`}
        </button>

        {/* Value reframe (honest, not social proof): for a live 1/2–1/3 player the
            monthly is less than a single buy-in. */}
        <div style={{ fontSize:'0.7rem', color:C.text, textAlign:'center', opacity:0.85 }}>
          Less than one buy-in a month.
        </div>

        {/* Honest quota disclosure — no surprise wall, no bait. Steady free number
            stated plainly; the bigger first day is framed as a bonus, not the headline. */}
        <div style={{ fontSize:'0.62rem', color:C.textMuted, textAlign:'center', lineHeight:1.5 }}>
          Free includes 3 AI analyses/day (8 on your first day). Pro raises this to 20/day, plus everything above.
        </div>

        {/* Trust row — real signals only: Stripe-secured, no lock-in, restorable. */}
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', alignItems:'center', borderTop:`1px solid ${C.border}`, paddingTop:'14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px', fontSize:'0.64rem', color:C.textMuted }}>
            <span style={{ display:'flex', alignItems:'center', gap:'5px' }}><ShieldCheck size={12} color={C.primary} /> Secure checkout · Stripe</span>
            <span style={{ display:'flex', alignItems:'center', gap:'5px' }}><Check size={12} color={C.primary} /> Cancel anytime</span>
          </div>
          {onRestore && (
            <button onClick={onRestore} style={{ background:'none', border:'none', color:C.secondary, cursor:'pointer', fontSize:'0.64rem', display:'flex', alignItems:'center', gap:'5px' }}>
              <RotateCcw size={11} /> Restore purchase
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
