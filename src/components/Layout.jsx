import React, { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { History, Wallet, Calculator, BrainCircuit, Spade, Zap, LogOut, Settings, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLocalStorage } from '../hooks/useLocalStorage'

const NAV = [
  { path: '/history',  label: 'History',  icon: History },
  { path: '/bankroll', label: 'Bankroll', icon: Wallet },
  { path: '/coach',    label: 'Coach',    icon: BrainCircuit },
  { path: '/quiz',     label: 'Quiz',     icon: Zap },
  { path: '/odds',     label: 'Odds',     icon: Calculator },
]

const C = {
  bg: '#0B0E14', surface: '#161B22', surfaceHi: '#1E2530', surfaceHigh: '#252D3A',
  border: '#21262D', primary: '#54e98a', primaryDim: 'rgba(84,233,138,0.12)',
  text: '#E6EDF3', textMuted: '#7D8590',
}

const LANG_SHORT = { English: 'EN', Vietnamese: 'VI', Chinese: 'ZH' }
const GAME_TYPES = ['Live Cash', 'Online Cash', 'MTT']
const LANGUAGES  = ['English', 'Vietnamese', 'Chinese']

function getDisplayName(session) {
  if (!session?.user) return ''
  const meta = session.user.user_metadata || {}
  const fullName = meta.full_name || meta.name
  if (fullName) return fullName.split(' ')[0]
  return (session.user.email || '').split('@')[0]
}

function SettingsPanel({ onClose, panelRef, defaultGameType, setDefaultGameType, language, setLanguage }) {
  const lbl = txt => (
    <div style={{ fontSize:'0.52rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'8px' }}>{txt}</div>
  )
  const btn = (val, current, setter, color) => (
    <button key={val} onClick={() => setter(val)} style={{
      flex:1, padding:'7px 4px', borderRadius:'8px',
      border:`1px solid ${current===val ? color : C.border}`,
      background: current===val ? `rgba(${colorRgb(color)},0.12)` : 'transparent',
      color: current===val ? color : C.textMuted,
      fontSize:'0.62rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s',
    }}>{val}</button>
  )

  return (
    <div ref={panelRef} style={{
      background: C.surfaceHi, border:`1px solid ${C.border}`,
      borderRadius:'12px', padding:'16px', width:'220px',
      boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
        <span style={{ fontSize:'0.78rem', fontWeight:700, color:C.text }}>Preferences</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', padding:'2px', display:'flex' }}>
          <X size={13} />
        </button>
      </div>

      <div style={{ marginBottom:'14px' }}>
        {lbl('Default Game Type')}
        <div style={{ display:'flex', gap:'5px' }}>
          {GAME_TYPES.map(v => btn(v, defaultGameType, setDefaultGameType, C.primary))}
        </div>
      </div>

      <div>
        {lbl('Response Language')}
        <div style={{ display:'flex', gap:'5px' }}>
          {LANGUAGES.map(v => btn(v, language, setLanguage, '#ffc0ac'))}
        </div>
      </div>
    </div>
  )
}

function colorRgb(hex) {
  if (hex === C.primary) return '84,233,138'
  if (hex === '#ffc0ac') return '255,192,172'
  return '146,204,255'
}

export default function Layout({ children }) {
  const { session, signOut } = useAuth()
  const displayName = getDisplayName(session)
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultGameType, setDefaultGameType] = useLocalStorage('user-default-game-type', 'Live Cash')
  const [language, setLanguage] = useLocalStorage('aicoach-language', 'English')
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const handle = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [settingsOpen])

  const langShort = LANG_SHORT[language] || 'EN'

  const settingsTrigger = (
    <div ref={triggerRef} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
      <span style={{ fontSize:'0.52rem', fontWeight:700, color:C.textMuted, letterSpacing:'0.06em' }}>{langShort}</span>
      <button
        onClick={() => setSettingsOpen(v => !v)}
        title="Preferences"
        style={{
          background: settingsOpen ? C.primaryDim : 'none', border:'none',
          color: settingsOpen ? C.primary : C.textMuted, cursor:'pointer',
          display:'flex', alignItems:'center', padding:'4px', borderRadius:'4px',
          transition:'color 0.15s',
        }}
        onMouseOver={e => { if (!settingsOpen) e.currentTarget.style.color = C.text }}
        onMouseOut={e  => { if (!settingsOpen) e.currentTarget.style.color = C.textMuted }}
      >
        <Settings size={13} />
      </button>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100svh', background:C.bg, fontFamily:"'Inter',sans-serif", overflow:'hidden' }}>

      {/* ── Desktop sidebar ─────────────────────────────────── */}
      {!mobile && (
        <aside style={{ width:'188px', minWidth:'188px', background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', position:'relative' }}>
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

          {/* User + Settings + Logout */}
          <div style={{ padding:'12px 14px', borderTop:`1px solid ${C.border}`, position:'relative' }}>
            {/* Settings panel — anchored above user row */}
            {settingsOpen && (
              <div style={{ position:'absolute', bottom:'100%', left:'10px', right:'10px', marginBottom:'6px', zIndex:500 }}>
                <SettingsPanel
                  onClose={() => setSettingsOpen(false)}
                  panelRef={panelRef}
                  defaultGameType={defaultGameType}
                  setDefaultGameType={setDefaultGameType}
                  language={language}
                  setLanguage={setLanguage}
                />
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'8px 10px', background:C.surfaceHi, borderRadius:'6px' }}>
              <div style={{ overflow:'hidden', flex:1 }}>
                <div style={{ fontSize:'0.72rem', fontWeight:600, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  Hi, {displayName}
                </div>
              </div>
              {settingsTrigger}
              <button
                onClick={signOut}
                title="Log out"
                style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', padding:'4px', borderRadius:'4px', flexShrink:0, transition:'color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.color = '#f47067'}
                onMouseOut={e  => e.currentTarget.style.color = C.textMuted}
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main content ────────────────────────────────────── */}
      <main style={{ flex:1, overflow:'hidden', position:'relative', display:'flex', flexDirection:'column' }}>

        {/* Mobile top bar */}
        {mobile && (
          <div style={{ height:'44px', minHeight:'44px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0, zIndex:10, position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <div style={{ width:'22px', height:'22px', borderRadius:'5px', background:'linear-gradient(135deg,#54e98a,#2db866)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Spade size={11} color="#061a0e" />
              </div>
              <span style={{ fontSize:'0.75rem', fontWeight:700, color:C.text }}>MicroPoker</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'0.7rem', color:C.textMuted }}>Hi, {displayName}</span>
              {settingsTrigger}
              <button
                onClick={signOut}
                title="Log out"
                style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', padding:'4px' }}
              >
                <LogOut size={14} />
              </button>
            </div>

            {/* Mobile settings panel — drops below top bar */}
            {settingsOpen && (
              <div style={{ position:'absolute', top:'100%', right:'12px', zIndex:500, paddingTop:'4px' }}>
                <SettingsPanel
                  onClose={() => setSettingsOpen(false)}
                  panelRef={panelRef}
                  defaultGameType={defaultGameType}
                  setDefaultGameType={setDefaultGameType}
                  language={language}
                  setLanguage={setLanguage}
                />
              </div>
            )}
          </div>
        )}

        <div style={{ flex:1, overflowY:'auto', paddingBottom: mobile ? '68px' : '0' }}>
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
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
