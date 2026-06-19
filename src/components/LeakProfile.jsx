import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { TrendingDown, TrendingUp, Lock, BrainCircuit, ArrowRight, Minus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { usePro } from '../hooks/usePro'
import { supabase } from '../lib/supabase'
import { computeLeaks, computeLeakTrends, analyzedCount, recurringCount, LEAK_LABELS, UNLOCK_HANDS } from '../utils/leaks'
import Paywall from './Paywall'

// Personalized fix-plans are generated from the user's own hands (an API call), so
// cache them locally keyed by leak + how many hands fed it — regenerate only when the
// sample grows. Avoids paying for / waiting on a regenerate on every visit.
const FIX_CACHE = 'mpm-leakfix-v1'
const readFixCache = (cat, count) => {
  try { return (JSON.parse(localStorage.getItem(FIX_CACHE) || '{}'))[`${cat}:${count}`] || null } catch { return null }
}
const writeFixCache = (cat, count, plan) => {
  try {
    const all = JSON.parse(localStorage.getItem(FIX_CACHE) || '{}')
    all[`${cat}:${count}`] = plan
    localStorage.setItem(FIX_CACHE, JSON.stringify(all))
  } catch {}
}

const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', border:'#21262D',
  primary:'#54e98a', primaryDim:'rgba(84,233,138,0.1)', primaryBorder:'rgba(84,233,138,0.25)',
  secondary:'#92ccff', text:'#E6EDF3', textMuted:'#7D8590', red:'#f47067',
}

// Concrete one-line fixes per leak — the tangible Pro payoff ("how do I fix it?").
const FIX_TIPS = {
  river_call_too_wide: 'Only call rivers when you beat a third of their value range. Fold the bottom bluff-catchers.',
  turn_call_too_wide:  'Stop floating turns without equity — continue only with real draws or pairs that can improve.',
  overbluff:           'Bluff less on boards that favor the caller. Pick bluffs that carry backup equity, not pure air.',
  missed_value:        'Bet thinner with strong top pairs+. Don\'t check back made hands on safe rivers.',
  passive_play:        'Bet and raise your strong hands instead of trapping — passive lines leak value vs callers.',
  bad_preflop:         'Tighten opens by position and stop calling 3-bets out of position with dominated hands.',
  overpair_overplay:   'Slow down with one pair on wet or paired boards — pot control instead of stacking off.',
  top_pair_overplay:   'Top pair is one pair. Don\'t fire three streets for stacks vs tight ranges — control the pot.',
  draw_chasing:        'Chase only with the right pot + implied odds. Fold draws facing big bets without a price.',
  no_clear_leak:       'Solid spot — keep doing what you\'re doing here.',
}

// EV is an AI estimate (grounded in the real pot/bet sizes), not a solver figure.
// Round to a coarse step so the number reads as an estimate, never solver-precise —
// and pair it with a "~" everywhere it's shown (RISK-2).
function estDollars(totalEv) {
  const a = Math.abs(totalEv)
  const step = a >= 100 ? 10 : 5
  return Math.round(a / step) * step
}

// Retention hook (RISK-4): a tiny up/down chip showing whether a leak is appearing
// less (improving) or more (creeping up) in recent hands vs earlier. Pro-only value.
function TrendChip({ t }) {
  if (!t) return null
  const map = {
    improving: { Icon: TrendingDown, color: '#54e98a',  label: 'improving'  },
    worsening: { Icon: TrendingUp,   color: '#f47067',  label: 'creeping up' },
    steady:    { Icon: Minus,        color: '#7D8590',  label: 'steady'      },
  }
  const { Icon, color, label } = map[t.trend] || map.steady
  return (
    <span title={`Earlier ${t.earlierCount} → recent ${t.recentCount}`} style={{ display:'flex', alignItems:'center', gap:'3px', fontSize:'0.58rem', fontWeight:700, color, whiteSpace:'nowrap' }}>
      <Icon size={11} /> {label}
    </span>
  )
}

function Empty({ navigate }) {
  return (
    <div style={{ padding:'48px 24px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:'14px' }}>
      <TrendingDown size={36} color={C.textMuted} style={{ opacity:0.4 }} />
      <div style={{ fontSize:'0.86rem', color:C.text, fontWeight:600 }}>No Leak Profile yet</div>
      <div style={{ fontSize:'0.78rem', color:C.textMuted, lineHeight:1.6, maxWidth:'280px' }}>
        Analyze your hands in the AI Coach. After a few, the patterns costing you the most money show up here.
      </div>
      <button onClick={() => navigate('/coach')} style={{
        marginTop:'4px', display:'flex', alignItems:'center', gap:'7px', padding:'10px 16px', borderRadius:'10px', border:'none',
        background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.8rem', fontWeight:700, cursor:'pointer',
      }}>
        <BrainCircuit size={15} /> Go to AI Coach
      </button>
    </div>
  )
}

export default function LeakProfile() {
  const navigate = useNavigate()
  const { hands } = useData()
  const { isAnonymous, linkGoogle } = useAuth()
  const { isPro, loading: proLoading, refresh: refreshPro } = usePro()
  const [showPaywall, setShowPaywall] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [fixPlans, setFixPlans] = useState({})   // { [category]: { loading, data, error } }

  // GROWTH-1: generate a fix plan from the user's OWN hands in this leak (the paid
  // payoff — replaces the static one-liner that every user used to share). Cached by
  // (category, hand-count) so it only re-runs when the player logs more hands.
  const genFix = useCallback(async (category, count) => {
    setFixPlans(p => ({ ...p, [category]: { loading: true, error: '' } }))
    try {
      const catHands = (hands || [])
        .filter(h => h.leakCategory === category && h.evImpact != null)
        .map(h => ({ holeCards: h.holeCards, boardCards: h.boardCards, evImpact: h.evImpact, aiAnalysis: h.aiAnalysis, notes: h.notes }))
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch('/api/coach', {
        method: 'POST', headers,
        body: JSON.stringify({
          request_type: 'leak_fix',
          leak_category: category,
          leak_hands: catHands,
          response_language: localStorage.getItem('aicoach-language') || 'English',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not build your plan.')
      const plan = data.leakFix || { summary: '', steps: [], drill: '' }
      if (!plan.steps || plan.steps.length === 0) throw new Error('Could not build your plan. Try again.')
      writeFixCache(category, count, plan)
      setFixPlans(p => ({ ...p, [category]: { loading: false, data: plan } }))
    } catch (e) {
      setFixPlans(p => ({ ...p, [category]: { loading: false, error: e.message || 'Could not build your plan.' } }))
    }
  }, [hands])

  const nAnalyzed = useMemo(() => analyzedCount(hands), [hands])
  const leaks     = useMemo(() => computeLeaks(hands),  [hands])
  const trends    = useMemo(() => computeLeakTrends(hands), [hands])
  const nRecurring = recurringCount(leaks)
  const hasTrends = Object.keys(trends).length > 0

  // Returning from Stripe Checkout (success_url = /leaks?checkout=success):
  // the webhook may have just granted Pro, so re-read entitlement + clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      refreshPro()
      setShowPaywall(false)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refreshPro])

  const handleCreateAccount = useCallback(async () => {
    setLinking(true); setError('')
    const { error } = await linkGoogle()
    if (error) { setLinking(false); setError(error.message) }
    // on success the browser redirects to Google and back
  }, [linkGoogle])

  const revealed = nAnalyzed >= UNLOCK_HANDS && leaks.length > 0

  return (
    <div style={{ background:C.bg, minHeight:'100%', padding:'16px 16px 100px', maxWidth:'720px', margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
        <TrendingDown size={20} color={C.primary} />
        <h1 style={{ fontSize:'1.3rem', fontWeight:700, color:C.text, letterSpacing:'-0.02em' }}>Leak Profile</h1>
        {isPro && <span style={{ marginLeft:'auto', fontSize:'0.58rem', fontWeight:800, letterSpacing:'0.06em', color:C.primary, background:C.primaryDim, padding:'3px 8px', borderRadius:'6px' }}>PRO</span>}
      </div>
      <p style={{ fontSize:'0.74rem', color:C.textMuted, marginBottom:'18px' }}>
        The patterns costing you the most money, ranked. {nAnalyzed > 0 ? `Built from ${nAnalyzed} analyzed hand${nAnalyzed>1?'s':''}.` : ''}
      </p>

      {nAnalyzed < 1 && <Empty navigate={navigate} />}

      {/* Accumulating */}
      {nAnalyzed >= 1 && !revealed && (
        <div style={{ padding:'18px', borderRadius:'12px', background:C.surface, border:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:'10px' }}>
          <div style={{ fontSize:'0.82rem', color:C.text, fontWeight:600 }}>
            {nAnalyzed < UNLOCK_HANDS
              ? `${nAnalyzed}/${UNLOCK_HANDS} hands — your biggest leak unlocks at ${UNLOCK_HANDS}.`
              : 'No leaks found yet — solid play. Keep analyzing hands.'}
          </div>
          <div style={{ height:'8px', borderRadius:'4px', background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
            <div style={{ width:`${Math.min(nAnalyzed/UNLOCK_HANDS*100,100)}%`, height:'100%', background:C.primary, transition:'width 0.4s' }} />
          </div>
          {/* RISK-3: curiosity gap before the 5-hand unlock. Show that real patterns
              are already forming (blurred + locked) so a lazy user has a concrete
              reason to paste the next hand — without asserting a leak from a tiny
              sample (kept tentative: "taking shape", unlocks at UNLOCK_HANDS). */}
          {leaks.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'7px', padding:'11px 12px', borderRadius:'10px', background:C.surfaceHi, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:'0.62rem', fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase', color:C.textMuted }}>
                {leaks.length} pattern{leaks.length>1?'s':''} taking shape
              </div>
              {leaks.slice(0,2).map((l, i) => (
                <div key={l.category} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'0.7rem', fontWeight:800, color:C.textMuted, width:'12px' }}>{i+1}</span>
                  <span style={{ flex:1, fontSize:'0.8rem', fontWeight:600, color:C.text, filter:'blur(5px)', userSelect:'none' }}>{LEAK_LABELS[l.category] || l.category}</span>
                  <Lock size={11} color={C.textMuted} />
                </div>
              ))}
              <div style={{ fontSize:'0.66rem', color:C.textMuted }}>Ranked, with $ cost, at {UNLOCK_HANDS} hands.</div>
            </div>
          )}
          {/* Selection-bias nudge: the profile is only as honest as the hands fed in.
              Pushing variety here is the cheapest guard against a "disasters-only" sample. */}
          <div style={{ fontSize:'0.72rem', color:C.textMuted, lineHeight:1.55 }}>
            Analyze a mix — your wins and routine hands too, not just the big losses. A profile built only from disasters overstates those leaks.
          </div>
          <button onClick={() => navigate('/coach')} style={{ alignSelf:'flex-start', marginTop:'4px', display:'flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'9px', border:'none', background:C.primaryDim, color:C.primary, fontSize:'0.74rem', fontWeight:700, cursor:'pointer' }}>
            <BrainCircuit size={14} /> Analyze more hands
          </button>
        </div>
      )}

      {/* Pro status still resolving — don't flash the non-Pro view first. */}
      {revealed && proLoading && (
        <div style={{ display:'flex', justifyContent:'center', padding:'40px' }}>
          <div style={{ width:'26px', height:'26px', border:`2px solid ${C.primaryBorder}`, borderTopColor:C.primary, borderRadius:'50%', animation:'lpspin 0.8s linear infinite' }} />
          <style>{`@keyframes lpspin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Revealed */}
      {revealed && !proLoading && (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <style>{`@keyframes lpspin { to { transform: rotate(360deg) } }`}</style>
          {/* Honesty caveat: the ranking reflects self-selected hands, and a small
              sample over-weights whatever the user happened to paste. Say so plainly
              instead of presenting an early read as the whole truth (RISK-1). */}
          {nAnalyzed < 10 && (
            <div style={{ padding:'10px 12px', borderRadius:'10px', background:'rgba(146,204,255,0.06)', border:`1px solid rgba(146,204,255,0.18)`, display:'flex', gap:'8px', alignItems:'flex-start' }}>
              <span style={{ fontSize:'0.7rem', marginTop:'1px' }}>ℹ️</span>
              <span style={{ fontSize:'0.72rem', color:C.textMuted, lineHeight:1.5 }}>
                Early read from the {nAnalyzed} hand{nAnalyzed>1?'s':''} you've analyzed. Analyze more — including wins and routine hands — for a truer ranking.
              </span>
            </div>
          )}
          {leaks.map((l, i) => {
            const locked = !isPro && i > 0          // free: only leak #1 visible
            const maskAmt = !isPro                  // free: $ masked everywhere
            const fixState = fixPlans[l.category] || {}
            const plan = fixState.data || (isPro && !locked ? readFixCache(l.category, l.count) : null)
            return (
              <div key={l.category} style={{ padding:'14px', borderRadius:'12px', background:C.surface, border:`1px solid ${i===0 ? C.primaryBorder : C.border}`, position:'relative' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'0.7rem', fontWeight:800, color:C.textMuted, width:'14px' }}>{i+1}</span>
                  <span style={{ fontSize:'0.86rem', fontWeight:700, color:C.text, flex:1, filter: locked ? 'blur(5px)' : 'none', userSelect: locked ? 'none' : 'auto' }}>
                    {locked ? 'Hidden leak' : (LEAK_LABELS[l.category] || l.category)}
                  </span>
                  <span style={{ fontSize:'0.6rem', fontWeight: l.recurring ? 700 : 400, color: l.recurring ? C.primary : C.textMuted }}>
                    {l.recurring ? `×${l.count} recurring` : `${l.count} hand`}
                  </span>
                  {isPro && !locked && <TrendChip t={trends[l.category]} />}
                  <span style={{ fontSize:'0.95rem', fontWeight:800, color:C.red, fontVariantNumeric:'tabular-nums', minWidth:'62px', textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'3px' }}>
                    {maskAmt ? <><Lock size={12} color={C.red} />••</> : `~$${estDollars(l.totalEv)}`}
                  </span>
                </div>
                {/* Fix plan — Pro only */}
                {!locked && (
                  isPro ? (
                    <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:'10px' }}>
                      {/* Quick static tip — instant, always shown */}
                      <div style={{ display:'flex', gap:'8px' }}>
                        <span style={{ fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.08em', color:C.primary, marginTop:'2px' }}>FIX</span>
                        <span style={{ fontSize:'0.78rem', color:C.text, lineHeight:1.5 }}>{FIX_TIPS[l.category] || ''}</span>
                      </div>

                      {/* Personalized plan built from THIS player's hands (GROWTH-1) */}
                      {plan ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:'8px', padding:'11px 12px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}` }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <Sparkles size={12} color={C.primary} />
                            <span style={{ fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.08em', color:C.primary }}>YOUR PLAN</span>
                          </div>
                          {plan.summary && <div style={{ fontSize:'0.78rem', color:C.text, lineHeight:1.5 }}>{plan.summary}</div>}
                          <ol style={{ margin:0, paddingLeft:'18px', display:'flex', flexDirection:'column', gap:'5px' }}>
                            {(plan.steps || []).map((s, si) => (
                              <li key={si} style={{ fontSize:'0.76rem', color:C.text, lineHeight:1.5 }}>{s}</li>
                            ))}
                          </ol>
                          {plan.drill && (
                            <div style={{ fontSize:'0.74rem', color:C.secondary, lineHeight:1.5, marginTop:'2px' }}>
                              <span style={{ fontWeight:700 }}>Next session: </span>{plan.drill}
                            </div>
                          )}
                        </div>
                      ) : fixState.loading ? (
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.74rem', color:C.textMuted }}>
                          <div style={{ width:'14px', height:'14px', border:`2px solid ${C.primaryBorder}`, borderTopColor:C.primary, borderRadius:'50%', animation:'lpspin 0.8s linear infinite' }} />
                          Studying your {l.count} {l.category.replace(/_/g,' ')} hand{l.count>1?'s':''}…
                        </div>
                      ) : (
                        <button onClick={() => genFix(l.category, l.count)} style={{ alignSelf:'flex-start', display:'flex', alignItems:'center', gap:'6px', padding:'8px 12px', borderRadius:'9px', border:`1px solid ${C.primaryBorder}`, background:C.primaryDim, color:C.primary, fontSize:'0.74rem', fontWeight:700, cursor:'pointer' }}>
                          <Sparkles size={13} /> Build my fix plan from these {l.count} hand{l.count>1?'s':''} →
                        </button>
                      )}
                      {fixState.error && <div style={{ fontSize:'0.72rem', color:C.red }}>{fixState.error}</div>}
                    </div>
                  ) : (
                    <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:`1px solid ${C.border}`, display:'flex', gap:'8px', alignItems:'center', opacity:0.7 }}>
                      <Lock size={12} color={C.textMuted} />
                      <span style={{ fontSize:'0.74rem', color:C.textMuted, fontStyle:'italic' }}>Personalized fix plan locked</span>
                    </div>
                  )
                )}
              </div>
            )
          })}

          {/* CTA — funnel order: save account first, then Pro. Pro users see nothing. */}
          {!isPro && isAnonymous && (
            <div style={{ marginTop:'4px', padding:'16px', borderRadius:'12px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={{ fontSize:'0.8rem', color:C.text, lineHeight:1.5, display:'flex', gap:'8px', alignItems:'flex-start' }}>
                <Lock size={15} color={C.primary} style={{ marginTop:'2px', flexShrink:0 }} />
                <span>{nRecurring > 0
                  ? `We've found ${nRecurring} recurring leak${nRecurring>1?'s':''} costing you money. Create a free account to save your Leak Profile.`
                  : `Create a free account to save your Leak Profile across devices.`}</span>
              </div>
              <button onClick={handleCreateAccount} disabled={linking} style={{ padding:'11px 16px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.8rem', fontWeight:800, cursor: linking?'not-allowed':'pointer' }}>
                {linking ? 'Connecting…' : 'Create free account →'}
              </button>
            </div>
          )}
          {!isPro && !isAnonymous && (
            <div style={{ marginTop:'4px', padding:'16px', borderRadius:'12px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={{ fontSize:'0.8rem', color:C.text, lineHeight:1.5, display:'flex', gap:'8px', alignItems:'flex-start' }}>
                <Lock size={15} color={C.primary} style={{ marginTop:'2px', flexShrink:0 }} />
                <span>{nRecurring > 0
                  ? `${nRecurring} recurring leak${nRecurring>1?'s are':' is'} costing you money. Unlock the $ cost of each, the full ranking, and a fix plan.`
                  : `Unlock the $ cost of every leak and a step-by-step fix plan.`}</span>
              </div>
              <button onClick={() => setShowPaywall(true)} style={{ padding:'11px 16px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontSize:'0.8rem', fontWeight:800, cursor:'pointer' }}>
                Unlock full Leak Profile →
              </button>
            </div>
          )}

          {error && <div style={{ fontSize:'0.74rem', color:C.red }}>{error}</div>}

          {/* RISK-4: explain the trend chips so "improving" isn't mistaken for a guarantee. */}
          {isPro && hasTrends && (
            <div style={{ fontSize:'0.66rem', color:C.textMuted, lineHeight:1.5, marginTop:'2px', opacity:0.85 }}>
              Trend compares how often each leak shows up in your recent analyzed hands vs your earlier ones.
            </div>
          )}
          {/* RISK-2: be upfront that $ are AI estimates, not solver output. */}
          <div style={{ fontSize:'0.66rem', color:C.textMuted, lineHeight:1.5, marginTop:'2px', opacity:0.85 }}>
            $ figures are AI estimates based on the real pot and bet sizes in each hand — directional, not solver-exact.
          </div>
        </div>
      )}

      {showPaywall && (
        <Paywall onClose={() => setShowPaywall(false)} onRestore={refreshPro} />
      )}
    </div>
  )
}
