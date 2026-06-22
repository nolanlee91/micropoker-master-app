import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { History, Wallet, Calculator, BrainCircuit, Spade, Zap, LogOut, Settings, X, TrendingDown, ClipboardList, Download, Share } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useInstall } from '../lib/pwaInstall'

const NAV = [
  { path: '/history',  label: 'Journal',  icon: History },
  { path: '/bankroll', label: 'Bankroll', icon: Wallet },
  { path: '/coach',    label: 'Coach',    icon: BrainCircuit, primary: true },
  { path: '/leaks',    label: 'Leaks',    icon: TrendingDown, primary: true },
  { path: '/debrief',  label: 'Debrief',  icon: ClipboardList, primary: true },
  { path: '/quiz',     label: 'Quiz',     icon: Zap },
  { path: '/odds',     label: 'Odds',     icon: Calculator },
]

const C = {
  bg: '#0B0E14', surface: '#161B22', surfaceHi: '#1E2530', surfaceHigh: '#252D3A',
  border: '#21262D', primary: '#54e98a', primaryDim: 'rgba(84,233,138,0.12)',
  text: '#E6EDF3', textMuted: '#7D8590',
}

const LANG_SHORT = { English: 'EN', Vietnamese: 'VI', Chinese: 'ZH' }
const LANGUAGES  = ['English', 'Vietnamese', 'Chinese']

function getDisplayName(session) {
  if (!session?.user) return ''
  const meta = session.user.user_metadata || {}
  const fullName = meta.full_name || meta.name
  if (fullName) return fullName.split(' ')[0]
  return (session.user.email || '').split('@')[0]
}

function SettingsPanel({ onClose, panelRef, language, setLanguage }) {
  const navigate = useNavigate()
  const install = useInstall()
  const [soundEnabled, setSoundEnabled] = useLocalStorage('sound-enabled', true)

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

      <div>
        {lbl('Response Language')}
        <div style={{ display:'flex', gap:'5px' }}>
          {LANGUAGES.map(v => btn(v, language, setLanguage, '#ffc0ac'))}
        </div>
      </div>

      <div style={{ marginTop:'14px' }}>
        {lbl('Sound effects')}
        <div style={{ display:'flex', gap:'5px' }}>
          {btn('On',  soundEnabled ? 'On' : 'Off', () => setSoundEnabled(true),  C.primary)}
          {btn('Off', soundEnabled ? 'On' : 'Off', () => setSoundEnabled(false), C.primary)}
        </div>
      </div>

      {/* Install app — opt-in only, no banner. Hidden once installed / unsupported. */}
      {install.show && (
        <div style={{ marginTop:'14px' }}>
          {lbl('Install app')}
          {install.iosSafari ? (
            <div style={{ fontSize:'0.62rem', color:C.textMuted, lineHeight:1.55, display:'flex', flexDirection:'column', gap:'6px' }}>
              <div style={{ display:'flex', gap:'7px' }}>
                <span style={{ color:C.primary, fontWeight:700, flexShrink:0 }}>1.</span>
                <span>Tap the <Share size={11} style={{ verticalAlign:'-1px' }} /> <span style={{ color:C.text, fontWeight:600 }}>Share</span> button in Safari's toolbar.</span>
              </div>
              <div style={{ display:'flex', gap:'7px' }}>
                <span style={{ color:C.primary, fontWeight:700, flexShrink:0 }}>2.</span>
                <span>Scroll down and tap <span style={{ color:C.text, fontWeight:600 }}>Add to Home Screen</span>.</span>
              </div>
              <div style={{ display:'flex', gap:'7px' }}>
                <span style={{ color:C.primary, fontWeight:700, flexShrink:0 }}>3.</span>
                <span>Tap <span style={{ color:C.text, fontWeight:600 }}>Add</span> — the icon lands on your home screen.</span>
              </div>
              <div style={{ marginTop:'2px', fontSize:'0.58rem', opacity:0.85 }}>
                Must be open in <span style={{ color:C.text, fontWeight:600 }}>Safari</span> — Chrome and in-app browsers don't show this option.
              </div>
            </div>
          ) : install.iosOther ? (
            <div style={{ fontSize:'0.62rem', color:C.textMuted, lineHeight:1.55 }}>
              Open this page in <span style={{ color:C.text, fontWeight:600 }}>Safari</span> to add it to your home screen.
            </div>
          ) : (
            <button
              onClick={() => install.promptInstall()}
              style={{
                width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px',
                padding:'9px', borderRadius:'8px', border:`1px solid ${C.border}`, background:'transparent',
                color:C.text, fontSize:'0.68rem', fontWeight:600, cursor:'pointer',
              }}
            >
              <Download size={13} /> Add to home screen
            </button>
          )}
        </div>
      )}

      {/* Bottom links — Account opens its own page (like Terms/Privacy/Support) so the
          panel stays light. Account is in-app (SPA navigate); legal pages are public. */}
      <div style={{ marginTop:'16px', paddingTop:'14px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:'6px' }}>
        <button
          onClick={() => { onClose(); navigate('/account') }}
          style={{ background:'none', border:'none', padding:0, fontSize:'0.62rem', color:C.text, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
        >
          Account
        </button>
        <a href="/terms"   style={{ fontSize:'0.62rem', color:C.textMuted, textDecoration:'none', whiteSpace:'nowrap' }}>Terms</a>
        <a href="/privacy" style={{ fontSize:'0.62rem', color:C.textMuted, textDecoration:'none', whiteSpace:'nowrap' }}>Privacy</a>
        <a href="/support" style={{ fontSize:'0.62rem', color:C.textMuted, textDecoration:'none', whiteSpace:'nowrap' }}>Support</a>
      </div>
    </div>
  )
}

function colorRgb(hex) {
  if (hex === C.primary) return '84,233,138'
  if (hex === '#ffc0ac') return '255,192,172'
  return '146,204,255'
}

// Pull-to-refresh spinner: rotates with the drag while pulling, spins on its own
// once a refresh is in flight. Turns solid green when past the release threshold.
function RefreshSpinner({ spinning, angle, ready }) {
  return (
    <div style={{
      width:'26px', height:'26px', borderRadius:'50%', background:C.bg,
      border:`2px solid rgba(84,233,138,0.18)`,
      borderTopColor: (ready || spinning) ? C.primary : 'rgba(84,233,138,0.55)',
      boxShadow:'0 2px 8px rgba(0,0,0,0.4)',
      transform: spinning ? 'none' : `rotate(${angle}deg)`,
      animation: spinning ? 'ptrspin 0.7s linear infinite' : 'none',
    }} />
  )
}

const PTR_THRESHOLD = 84   // px (damped) the user must pull to trigger a refresh
const PTR_MAX       = 140  // hard cap on how far the content can be dragged
const PTR_RESIST    = 175  // higher = stiffer spring (must pull deeper to move)

export default function Layout({ children }) {
  const { session, signOut, setShowLogin } = useAuth()
  const { refetch } = useData()
  const displayName = getDisplayName(session)
  const isAnon = !!session?.user?.is_anonymous
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [language, setLanguage] = useLocalStorage('aicoach-language', 'English')
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

  // ── Pull-to-refresh (mobile) ───────────────────────────────────────────────
  // Only engages when the scroll area is already at the very top and the user
  // drags DOWN. We translate the content (not a real scroll) and, past the
  // threshold, re-sync data from Supabase via DataContext.refetch().
  const scrollRef = useRef(null)
  const ptr = useRef({ startY: 0, active: false })
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = (e) => {
    const el = scrollRef.current
    if (!el || refreshing) { ptr.current.active = false; return }
    // Abort if any scroller between the touch point and the container is scrolled
    // down — that means the user is scrolling inner content (e.g. the coach chat),
    // not pulling the page. Only pull when everything is already at the top.
    let node = e.target
    while (node && node !== el) {
      if (node.scrollHeight > node.clientHeight && node.scrollTop > 0) { ptr.current.active = false; return }
      node = node.parentElement
    }
    if (el.scrollTop > 0) { ptr.current.active = false; return }
    ptr.current = { startY: e.touches[0].clientY, active: true }
  }
  const onTouchMove = (e) => {
    if (!ptr.current.active || refreshing) return
    const dy = e.touches[0].clientY - ptr.current.startY
    if (dy <= 0) { setPull(0); return }
    // Rubber-band resistance: each extra pixel of finger travel moves the content
    // less than the last, so it feels like pulling against a spring that fights
    // back — and you have to pull deliberately deep (~180px) to cross the threshold.
    const damped = PTR_MAX * (1 - 1 / (dy / PTR_RESIST + 1))
    setPull(damped)
  }
  const onTouchEnd = async () => {
    if (!ptr.current.active) return
    ptr.current.active = false
    if (pull >= PTR_THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(PTR_THRESHOLD)
      // Min visible duration so the spinner doesn't just flash on a fast refetch.
      try { await Promise.all([refetch(), new Promise(r => setTimeout(r, 500))]) }
      finally { setRefreshing(false); setPull(0) }
    } else {
      setPull(0)
    }
  }

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
              {isAnon ? (
                <button
                  onClick={() => setShowLogin(true)}
                  title="Sign in or create an account"
                  style={{ background:'rgba(84,233,138,0.12)', border:'1px solid rgba(84,233,138,0.3)', color:C.primary, cursor:'pointer', fontSize:'0.66rem', fontWeight:700, padding:'5px 10px', borderRadius:'6px', flexShrink:0, whiteSpace:'nowrap' }}
                >
                  Sign in
                </button>
              ) : (
                <button
                  onClick={signOut}
                  title="Log out"
                  style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', padding:'4px', borderRadius:'4px', flexShrink:0, transition:'color 0.15s' }}
                  onMouseOver={e => e.currentTarget.style.color = '#f47067'}
                  onMouseOut={e  => e.currentTarget.style.color = C.textMuted}
                >
                  <LogOut size={13} />
                </button>
              )}
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
              {isAnon ? (
                <button
                  onClick={() => setShowLogin(true)}
                  title="Sign in or create an account"
                  style={{ background:'rgba(84,233,138,0.12)', border:'1px solid rgba(84,233,138,0.3)', color:C.primary, cursor:'pointer', fontSize:'0.66rem', fontWeight:700, padding:'5px 10px', borderRadius:'6px', whiteSpace:'nowrap' }}
                >
                  Sign in
                </button>
              ) : (
                <button
                  onClick={signOut}
                  title="Log out"
                  style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', padding:'4px' }}
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>

            {/* Mobile settings panel — drops below top bar */}
            {settingsOpen && (
              <div style={{ position:'absolute', top:'100%', right:'12px', zIndex:500, paddingTop:'4px' }}>
                <SettingsPanel
                  onClose={() => setSettingsOpen(false)}
                  panelRef={panelRef}
                  language={language}
                  setLanguage={setLanguage}
                />
              </div>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          onTouchStart={mobile ? onTouchStart : undefined}
          onTouchMove={mobile ? onTouchMove : undefined}
          onTouchEnd={mobile ? onTouchEnd : undefined}
          style={{
            flex:1, overflowY:'auto', paddingBottom: mobile ? '68px' : '0',
            position:'relative',
            // Column flex so a full-height page (AICoach: height:100%) actually fills
            // the scroll area instead of collapsing to content height (which left a
            // dead black gap under the composer on mobile).
            display:'flex', flexDirection:'column',
            // Stop the browser's own pull-to-refresh (Chrome Android reloads the
            // whole page) so only OUR gesture runs.
            overscrollBehaviorY: mobile ? 'contain' : 'auto',
          }}
        >
          {/* Pull indicator — sits at the visible top (we only pull when scrollTop is 0). */}
          {mobile && (pull > 0 || refreshing) && (
            <div style={{ position:'absolute', top:0, left:0, right:0, display:'flex', justifyContent:'center', pointerEvents:'none', zIndex:5 }}>
              <div style={{
                marginTop: Math.max(6, pull - 20),
                opacity: refreshing ? 1 : Math.min(pull / PTR_THRESHOLD, 1),
                transition: ptr.current.active ? 'none' : 'all 0.25s ease',
              }}>
                <RefreshSpinner spinning={refreshing} angle={pull * 4} ready={pull >= PTR_THRESHOLD} />
              </div>
            </div>
          )}
          <div style={{
            // grow to fill the scroll area (so height:100% pages fill); never shrink
            // below content height (so long pages still scroll normally).
            flex:'1 0 auto',
            transform: pull ? `translateY(${pull}px)` : 'none',
            transition: ptr.current.active ? 'none' : 'transform 0.25s ease',
          }}>
            {children}
          </div>
        </div>
      </main>
      <style>{`@keyframes ptrspin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
      {mobile && (
        <nav style={{ position:'fixed', bottom:0, left:0, right:0, height:'60px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', zIndex:200 }}>
          {NAV.map((item, i) => {
            const Icon = item.icon
            // Divider wherever we cross between the primary group (Coach/Leaks/
            // Debrief) and the rest — visually fences off the core features.
            const showDivider = i > 0 && NAV[i - 1].primary !== item.primary
            const iconSize = item.primary ? 21 : 16
            const idleColor = item.primary ? C.text : C.textMuted   // primary pops even when inactive
            return (
              <React.Fragment key={item.path}>
                {showDivider && <div style={{ width:'1px', alignSelf:'center', height:'28px', background:C.border }} />}
                <NavLink to={item.path} style={({ isActive }) => ({
                  flex: item.primary ? 1.35 : 0.8,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  gap:'3px', textDecoration:'none',
                })}>
                  {({ isActive }) => (<>
                    <Icon size={iconSize} color={isActive ? C.primary : idleColor} strokeWidth={item.primary ? 2.4 : 2} />
                    <span style={{
                      fontSize: item.primary ? '0.56rem' : '0.46rem',
                      fontWeight: isActive ? 700 : (item.primary ? 600 : 400),
                      color: isActive ? C.primary : idleColor,
                      letterSpacing:'0.01em',
                    }}>
                      {item.label}
                    </span>
                  </>)}
                </NavLink>
              </React.Fragment>
            )
          })}
        </nav>
      )}
    </div>
  )
}
