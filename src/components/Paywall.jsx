import React from 'react'
import { BrainCircuit, Check, X } from 'lucide-react'

// Paywall shown when a free user tries to use a Pro feature (AI Coach).
//
// NOTE: `onUpgrade` is a placeholder. Until the app is packaged natively, there
// is no real in-app purchase, so the caller currently grants Pro locally for
// testing. Before store submission, wire `onUpgrade` to the real purchase flow
// (RevenueCat / StoreKit / Play Billing) and add a "Restore purchases" action.

const C = {
  surface:'#161B22', surfaceHi:'#1E2530', border:'#21262D',
  text:'#E6EDF3', textMuted:'#7D8590', primary:'#54e98a', secondary:'#92ccff',
}

const PERKS = [
  'Unlimited AI hand analysis',
  'Leak detection & EV impact',
  'Follow-up coaching questions',
  'Multi-language explanations',
]

export default function Paywall({ onUpgrade, onClose }) {
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
          <div style={{ fontSize:'1.15rem', fontWeight:700, color:C.text }}>Unlock AI Coach Pro</div>
          <div style={{ fontSize:'0.8rem', color:C.textMuted, lineHeight:1.5 }}>
            Get instant, GTO-aware analysis of every hand you play.
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

        <button onClick={onUpgrade} style={{
          width:'100%', padding:'14px', borderRadius:'10px', border:'none',
          background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e',
          fontSize:'0.92rem', fontWeight:700, cursor:'pointer',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.25)',
        }}>
          Upgrade to Pro
        </button>

        <div style={{ fontSize:'0.6rem', color:C.textMuted, textAlign:'center', opacity:0.7 }}>
          Placeholder — in-app purchase wired before store launch.
        </div>
      </div>
    </div>
  )
}
