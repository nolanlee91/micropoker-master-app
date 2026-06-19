import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { ClipboardList, Lock, Sparkles, BrainCircuit, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { usePro } from '../hooks/usePro'
import { supabase } from '../lib/supabase'
import Paywall from './Paywall'

// GROWTH-2: Session Debrief. A weekend live player's natural cadence is "last night I
// played 5 hours." After they analyze the night's key hands in the Coach, this reads
// the session as a WHOLE — what repeated, the costliest spot, one focus for next time.
// That turns Pro from a one-time insight into a weekly ritual (the real MRR lever).
const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', border:'#21262D',
  primary:'#54e98a', primaryDim:'rgba(84,233,138,0.1)', primaryBorder:'rgba(84,233,138,0.25)',
  secondary:'#92ccff', text:'#E6EDF3', textMuted:'#7D8590', red:'#f47067',
}

// Debriefs are generated from the session's hands (an API call), so cache by
// (day, hand-count) — regenerate only when more hands are flagged that day.
const DEBRIEF_CACHE = 'mpm-debrief-v1'
const readCache = (key) => {
  try { return (JSON.parse(localStorage.getItem(DEBRIEF_CACHE) || '{}'))[key] || null } catch { return null }
}
const writeCache = (key, data) => {
  try {
    const all = JSON.parse(localStorage.getItem(DEBRIEF_CACHE) || '{}')
    all[key] = data
    localStorage.setItem(DEBRIEF_CACHE, JSON.stringify(all))
  } catch {}
}

const estLeak = (ev) => {
  const a = Math.abs(ev)
  const step = a >= 100 ? 10 : 5
  return Math.round(a / step) * step
}

function fmtDay(day) {
  if (!day || day === 'unknown') return 'Recent hands'
  const d = new Date(day + 'T00:00:00')
  if (isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
}

// A "session" = the hands analyzed on one calendar day (≥2 — enough to read a night).
function groupSessions(hands) {
  const analyzed = (hands || []).filter(h => h.leakCategory || h.aiAnalysis)
  const map = {}
  for (const h of analyzed) {
    const day = (h.date || '').slice(0, 10) || 'unknown'
    if (!map[day]) map[day] = []
    map[day].push(h)
  }
  return Object.entries(map)
    .map(([day, hs]) => ({
      day,
      hands: hs,
      count: hs.length,
      evLeaked: hs.reduce((s, h) => s + (typeof h.evImpact === 'number' && h.evImpact < 0 ? h.evImpact : 0), 0),
    }))
    .filter(s => s.count >= 2)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}

function DebriefView({ d }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginTop:'12px', paddingTop:'12px', borderTop:`1px solid ${C.border}` }}>
      {d.headline && <div style={{ fontSize:'0.9rem', fontWeight:700, color:C.text, lineHeight:1.45 }}>{d.headline}</div>}

      {Array.isArray(d.topLeaks) && d.topLeaks.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          <span style={{ fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.08em', color:C.textMuted }}>WHAT REPEATED</span>
          {d.topLeaks.map((s, i) => (
            <div key={i} style={{ display:'flex', gap:'8px', fontSize:'0.78rem', color:C.text, lineHeight:1.5 }}>
              <span style={{ color:C.red, fontWeight:800 }}>•</span><span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {d.biggestSpot && (
        <div style={{ padding:'10px 12px', borderRadius:'10px', background:C.surfaceHi, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.08em', color:C.red, marginBottom:'4px' }}>COSTLIEST SPOT</div>
          <div style={{ fontSize:'0.78rem', color:C.text, lineHeight:1.5 }}>{d.biggestSpot}</div>
        </div>
      )}

      {d.mental && d.mental.trim() && (
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', fontSize:'0.76rem', color:C.secondary, lineHeight:1.5 }}>
          <Brain size={13} style={{ marginTop:'2px', flexShrink:0 }} /><span>{d.mental}</span>
        </div>
      )}

      {d.nextFocus && (
        <div style={{ padding:'11px 12px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}` }}>
          <span style={{ fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.08em', color:C.primary }}>NEXT SESSION</span>
          <div style={{ fontSize:'0.8rem', color:C.text, lineHeight:1.5, marginTop:'3px' }}>{d.nextFocus}</div>
        </div>
      )}
    </div>
  )
}

export default function Debrief() {
  const navigate = useNavigate()
  const { hands } = useData()
  const { isPro, loading: proLoading, refresh: refreshPro } = usePro()
  const [showPaywall, setShowPaywall] = useState(false)
  const [states, setStates] = useState({})    // { [day]: { loading, data, error } }
  const [openDays, setOpenDays] = useState({}) // which debriefs are expanded
  const toggleDay = (day) => setOpenDays(o => ({ ...o, [day]: !o[day] }))

  const sessions = useMemo(() => groupSessions(hands), [hands])

  // Returning from Stripe Checkout — re-read entitlement + clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      refreshPro()
      setShowPaywall(false)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refreshPro])

  const gen = useCallback(async (session) => {
    const day = session.day
    setStates(s => ({ ...s, [day]: { loading: true, error: '' } }))
    try {
      const payloadHands = session.hands.map(h => ({
        holeCards: h.holeCards, boardCards: h.boardCards, evImpact: h.evImpact,
        leakCategory: h.leakCategory, aiAnalysis: h.aiAnalysis, notes: h.notes,
      }))
      const { data: { session: auth } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json' }
      if (auth?.access_token) headers.Authorization = `Bearer ${auth.access_token}`
      const res = await fetch('/api/coach', {
        method: 'POST', headers,
        body: JSON.stringify({
          request_type: 'session_debrief',
          session_hands: payloadHands,
          session_label: fmtDay(day),
          response_language: localStorage.getItem('aicoach-language') || 'English',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not build the debrief.')
      const d = data.debrief
      if (!d || (!d.headline && !(d.topLeaks && d.topLeaks.length))) throw new Error('Could not build the debrief. Try again.')
      writeCache(`${day}:${session.count}`, d)
      setStates(s => ({ ...s, [day]: { loading: false, data: d } }))
      setOpenDays(o => ({ ...o, [day]: true }))   // auto-expand the one just generated
    } catch (e) {
      setStates(s => ({ ...s, [day]: { loading: false, error: e.message || 'Could not build the debrief.' } }))
    }
  }, [])

  return (
    <div style={{ background:C.bg, minHeight:'100%', padding:'16px 16px 100px', maxWidth:'720px', margin:'0 auto' }}>
      <style>{`@keyframes dbspin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
        <ClipboardList size={20} color={C.primary} />
        <h1 style={{ fontSize:'1.3rem', fontWeight:700, color:C.text, letterSpacing:'-0.02em' }}>Session Debrief</h1>
        {isPro && <span style={{ marginLeft:'auto', fontSize:'0.58rem', fontWeight:800, letterSpacing:'0.06em', color:C.primary, background:C.primaryDim, padding:'3px 8px', borderRadius:'6px' }}>PRO</span>}
      </div>
      <p style={{ fontSize:'0.74rem', color:C.textMuted, marginBottom:'18px', lineHeight:1.5 }}>
        Every hand you analyze in the AI Coach is saved automatically and grouped by the day you analyzed it. Each day becomes a debrief — one read on the whole night: what repeated, the costliest spot, and one thing to fix next time. <span style={{ opacity:0.8 }}>(Separate from the sessions you log in Bankroll.)</span>
      </p>

      {sessions.length === 0 && (
        <div style={{ padding:'40px 24px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:'14px' }}>
          <ClipboardList size={34} color={C.textMuted} style={{ opacity:0.4 }} />
          <div style={{ fontSize:'0.84rem', color:C.text, fontWeight:600 }}>No sessions to debrief yet</div>
          <div style={{ fontSize:'0.78rem', color:C.textMuted, lineHeight:1.6, maxWidth:'300px' }}>
            Analyze at least 2 hands from one night in the AI Coach. They'll group by day here, ready to debrief.
          </div>
          <button onClick={() => navigate('/coach')} style={{ marginTop:'2px', display:'flex', alignItems:'center', gap:'7px', padding:'10px 16px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}>
            <BrainCircuit size={15} /> Go to AI Coach
          </button>
        </div>
      )}

      {sessions.length > 0 && proLoading && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px' }}>
          <div style={{ width:'26px', height:'26px', border:`2px solid ${C.primaryBorder}`, borderTopColor:C.primary, borderRadius:'50%', animation:'dbspin 0.8s linear infinite' }} />
        </div>
      )}

      {sessions.length > 0 && !proLoading && (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {sessions.map((session) => {
            const st = states[session.day] || {}
            const cached = st.data || (isPro ? readCache(`${session.day}:${session.count}`) : null)
            const hasDebrief = isPro && !!cached
            const open = !!openDays[session.day]
            return (
              <div key={session.day} style={{ padding:'14px', borderRadius:'12px', background:C.surface, border:`1px solid ${C.border}` }}>
                <div
                  onClick={hasDebrief ? () => toggleDay(session.day) : undefined}
                  style={{ display:'flex', alignItems:'center', gap:'10px', cursor: hasDebrief ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize:'0.88rem', fontWeight:700, color:C.text, flex:1 }}>{fmtDay(session.day)}</span>
                  <span style={{ fontSize:'0.66rem', color:C.textMuted }}>{session.count} hands</span>
                  {session.evLeaked < 0 && (
                    <span style={{ fontSize:'0.8rem', fontWeight:800, color:C.red, fontVariantNumeric:'tabular-nums' }}>~${estLeak(session.evLeaked)}</span>
                  )}
                  {hasDebrief && (open
                    ? <ChevronUp size={16} color={C.textMuted} />
                    : <ChevronDown size={16} color={C.textMuted} />)}
                </div>

                {isPro ? (
                  cached ? (
                    open && <DebriefView d={cached} />
                  ) : st.loading ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.74rem', color:C.textMuted, marginTop:'12px' }}>
                      <div style={{ width:'14px', height:'14px', border:`2px solid ${C.primaryBorder}`, borderTopColor:C.primary, borderRadius:'50%', animation:'dbspin 0.8s linear infinite' }} />
                      Reading these hands…
                    </div>
                  ) : (
                    <button onClick={() => gen(session)} style={{ marginTop:'12px', display:'flex', alignItems:'center', gap:'6px', padding:'8px 12px', borderRadius:'9px', border:`1px solid ${C.primaryBorder}`, background:C.primaryDim, color:C.primary, fontSize:'0.74rem', fontWeight:700, cursor:'pointer' }}>
                      <Sparkles size={13} /> Debrief these {session.count} hands →
                    </button>
                  )
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'12px', paddingTop:'12px', borderTop:`1px solid ${C.border}` }}>
                    <Lock size={13} color={C.textMuted} />
                    <span style={{ fontSize:'0.74rem', color:C.textMuted, flex:1 }}>Session debrief is a Pro feature.</span>
                    <button onClick={() => setShowPaywall(true)} style={{ padding:'7px 12px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.72rem', fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}>
                      Unlock
                    </button>
                  </div>
                )}

                {st.error && <div style={{ fontSize:'0.72rem', color:C.red, marginTop:'8px' }}>{st.error}</div>}
              </div>
            )
          })}
        </div>
      )}

      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} onRestore={refreshPro} />}
    </div>
  )
}
