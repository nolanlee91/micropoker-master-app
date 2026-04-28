import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { History, Wallet, Calculator, BrainCircuit, Spade, Zap } from 'lucide-react'

const NAV = [
  { path: '/history',  label: 'History',  icon: History },
  { path: '/bankroll', label: 'Bankroll', icon: Wallet },
  { path: '/coach',    label: 'Coach',    icon: BrainCircuit },
  { path: '/quiz',     label: 'Quiz',     icon: Zap },
  { path: '/odds',     label: 'Odds',     icon: Calculator },
]

const C = {
  bg: '#0B0E14', surface: '#161B22', border: '#21262D',
  primary: '#54e98a', primaryDim: 'rgba(84,233,138,0.12)',
  text: '#E6EDF3', textMuted: '#7D8590',
}

export default function Layout({ children }) {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  return (
    <div style={{ display:'flex', height:'100svh', background:C.bg, fontFamily:"'Inter',sans-serif", overflow:'hidden' }}>
      {/* Desktop sidebar */}
      {!mobile && (
        <aside style={{ width:'188px', minWidth:'188px', background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'18px 14px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'2px' }}>
              <div style={{ width:'26px', height:'26px', borderRadius:'6px', background:'linear-gradient(135deg,#54e98a,#2db866)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Spade size={13} color="#061a0e" />
              </div>
              <div>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:C.text, lineHeight:1.1 }}>MicroPoker</div>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:C.primary, lineHeight:1.1 }}>Master</div>
              </div>
            </div>
            <div style={{ fontSize:'0.55rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, paddingLeft:'34px', marginTop:'2px' }}>Pro Toolkit</div>
          </div>
          <nav style={{ flex:1, padding:'4px 10px', display:'flex', flexDirection:'column', gap:'2px' }}>
            {NAV.map(item => {
              const Icon = item.icon
              return (
                <NavLink key={item.path} to={item.path} style={({ isActive }) => ({
                  display:'flex', alignItems:'center', gap:'10px', padding:'9px 10px',
                  borderRadius:'6px', textDecoration:'none',
                  background: isActive ? C.primaryDim : 'transparent',
                  position:'relative', transition:'background 0.15s',
                })}>
                  {({ isActive }) => (<>
                    {isActive && <div style={{ position:'absolute', left:0, top:'20%', height:'60%', width:'2px', background:C.primary, borderRadius:'0 2px 2px 0' }} />}
                    <Icon size={15} color={isActive ? C.primary : C.textMuted} />
                    <span style={{ fontSize:'0.8rem', fontWeight:isActive?600:400, color:isActive?C.text:C.textMuted }}>{item.label}</span>
                  </>)}
                </NavLink>
              )
            })}
          </nav>
          <div style={{ padding:'12px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'8px 10px', background:'#1E2530', borderRadius:'6px' }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:C.primary, boxShadow:`0 0 8px ${C.primary}`, flexShrink:0 }} />
              <span style={{ fontSize:'0.58rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted }}>Texas Hold'em</span>
            </div>
          </div>
        </aside>
      )}

      {/* Main — full height, scrollable per page */}
      <main style={{ flex:1, overflow:'hidden', position:'relative' }}>
        <div style={{ height:'100%', overflowY:'auto', paddingBottom: mobile ? '68px' : '0' }}>
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {mobile && (
        <nav style={{ position:'fixed', bottom:0, left:0, right:0, height:'60px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', zIndex:200 }}>
          {NAV.map(item => {
            const Icon = item.icon
            return (
              <NavLink key={item.path} to={item.path} style={({ isActive }) => ({
                flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                gap:'3px', textDecoration:'none', color: isActive ? C.primary : C.textMuted,
              })}>
                {({ isActive }) => (<>
                  <Icon size={18} color={isActive ? C.primary : C.textMuted} />
                  <span style={{ fontSize:'0.52rem', fontWeight:isActive?600:400, color:isActive?C.primary:C.textMuted, letterSpacing:'0.01em' }}>
                    {item.label}
                  </span>
                </>)}
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}
