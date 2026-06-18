import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrainCircuit, Send, Plus, AlertCircle, CheckCircle, ChevronDown, ChevronUp, ChevronRight, TrendingDown } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useData } from '../context/DataContext'
import { evaluateHeroHand } from '../utils/handEvaluator'
import { computeLeaks, analyzedCount, LEAK_LABELS } from '../utils/leaks'
import { supabase } from '../lib/supabase'

const C = {
  bg:          '#0B0E14',
  surface:     '#161B22',
  surfaceHi:   '#1E2530',
  surfaceHigh: '#252D3A',
  border:      '#21262D',
  primary:     '#54e98a',
  primaryDim:  'rgba(84,233,138,0.1)',
  primaryBorder:'rgba(84,233,138,0.25)',
  secondary:   '#92ccff',
  text:        '#E6EDF3',
  textMuted:   '#7D8590',
  red:         '#f47067',
  redDim:      'rgba(244,112,103,0.1)',
  redBorder:   'rgba(244,112,103,0.25)',
}

const SL = { s:'♠', h:'♥', d:'♦', c:'♣' }
const SC = { s:'#1a1a1a', h:'#cc2222', d:'#cc2222', c:'#1a1a1a' }

const MISTAKE_LABELS = {
  overcall:     'Overcall',
  overbet:      'Overbet',
  underbet:     'Underbet',
  bad_bluff:    'Bad Bluff',
  wrong_fold:   'Wrong Fold',
  bad_sizing:   'Bad Sizing',
  missed_value: 'Missed Value',
  correct:      'Correct Play',
  other:        'Mistake',
}

const VALID_MISTAKE_TYPES = ['overcall', 'overbet', 'underbet', 'bad_bluff', 'wrong_fold', 'bad_sizing', 'missed_value', 'correct']
const VALID_LEAK_CATS     = ['river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value', 'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay', 'draw_chasing', 'no_clear_leak']

// Read a preference stored by useLocalStorage (JSON-serialised)
function getPref(key, fallback) {
  try {
    const v = window.localStorage.getItem(key)
    return v != null ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function fmtResult(val) {
  if (val === 0 || val == null) return null
  return val > 0 ? `+$${val}` : `-$${Math.abs(val)}`
}

// Tolerant parser: accepts any JSON that has at least one recognisable analysis field.
// Does NOT require specific fields — renders whatever is present.
function parseAnalysisText(text) {
  if (!text || typeof text !== 'string') return null

  const attempts = [
    text,
    text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(),
  ]
  const m = text.match(/\{[\s\S]*\}/)
  if (m) attempts.push(m[0])

  const ANALYSIS_FIELDS = ['summary', 'biggestMistake', 'whyWrong', 'betterLine', 'answer']

  for (const s of attempts) {
    try {
      const p = JSON.parse(s)
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue
      // Accept if any recognised analysis field is present (string or non-empty)
      const hasField = ANALYSIS_FIELDS.some(k => p[k] && typeof p[k] === 'string')
      if (!hasField) continue

      // Use "answer" as summary fallback (follow_up schema sent to analysis path)
      const summary = typeof p.summary === 'string' ? p.summary
                    : typeof p.answer  === 'string' ? p.answer : ''

      return {
        heroHandStrength: typeof p.heroHandStrength === 'string' ? p.heroHandStrength : '',
        boardTexture:     typeof p.boardTexture     === 'string' ? p.boardTexture     : '',
        actionLine:       typeof p.actionLine       === 'string' ? p.actionLine       : '',
        summary,
        biggestMistake:   typeof p.biggestMistake === 'string' ? p.biggestMistake : '',
        mistakeType:      VALID_MISTAKE_TYPES.includes(p.mistakeType) ? p.mistakeType : 'other',
        leak_category:    VALID_LEAK_CATS.includes(p.leak_category)  ? p.leak_category : 'no_clear_leak',
        ev_impact:        typeof p.ev_impact === 'number' ? p.ev_impact : 0,
        confidence:       ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium',
        whyWrong:         typeof p.whyWrong   === 'string' ? p.whyWrong   : '',
        betterLine:       typeof p.betterLine  === 'string' ? p.betterLine  : '',
      }
    } catch (e) {
      console.error('[coach] frontend parse attempt failed:', e.message)
    }
  }
  return null
}

// Best-effort card extraction from free text (paste history OR a live story).
// Only pulls cards that appear in CLUSTERS of 2+ adjacent tokens (e.g. "Ah Kh",
// "Kh 7c 2d") — a lone fragment like the word "as" never matches, which kills the
// classic false positive. Suitless storytelling ("K 7 2 rainbow") yields no board
// cards → deterministic eval degrades gracefully (we just don't show a read).
// Known limitation: villain hole cards shown at showdown could be misread as board;
// acceptable for V1 since the read is a bonus and analysis still runs.
function extractCardsFromText(text) {
  if (!text || typeof text !== 'string') return { hole: [], board: [] }
  const norm = text.replace(/10([shdcSHDC])/g, 'T$1') // "10h" → "Th"
  // Token-run approach: split on whitespace, keep only tokens that are EXACTLY a
  // card (2 chars, after stripping brackets/punctuation), and accept only runs of
  // ≥2 consecutive card tokens. Rank/suit letters (t,h,a,d,s,c) collide with common
  // words — "with"→Th, "had"→Ad, "as"→As — but those never form a standalone 2-char
  // token, so this is robust against that whole class of false positives.
  const isCard = t => /^[2-9TJQKA][shdc]$/i.test(t)
  const strip  = t => t.replace(/^[[({<]+|[\])}>,.:;!?]+$/g, '')
  const norm1  = c => c[0].toUpperCase() + c[1].toLowerCase()
  const out = []
  let run = []
  const flush = () => { if (run.length >= 2) out.push(...run); run = [] }
  for (const raw of norm.split(/\s+/)) {
    const t = strip(raw)
    if (isCard(t)) run.push(norm1(t))
    else flush()
  }
  flush()
  const seen = new Set()
  const uniq = out.filter(c => (seen.has(c) ? false : (seen.add(c), true)))
  return { hole: uniq.slice(0, 2), board: uniq.slice(2, 7) }
}

function MiniCard({ card }) {
  const r = card.slice(0,-1), s = card.slice(-1)
  return (
    <div style={{ width:'24px', height:'32px', background:'#fff', borderRadius:'3px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', flexShrink:0 }}>
      <span style={{ fontSize:'0.65rem', fontWeight:800, color:SC[s], lineHeight:1 }}>{r==='T'?'10':r}</span>
      <span style={{ fontSize:'0.6rem', color:SC[s], lineHeight:1 }}>{SL[s]}</span>
    </div>
  )
}

// ── Structured Analysis Card ──────────────────────────────────────────────────
function AnalysisCard({ analysis }) {
  const [whyOpen, setWhyOpen] = useState(false)
  const isCorrect  = analysis.mistakeType === 'correct'
  const conf       = analysis.confidence || 'medium'
  const confColor  = { high: C.primary, medium: '#FAD261', low: C.red }[conf]
  const confBg     = `rgba(${conf === 'high' ? '84,233,138' : conf === 'medium' ? '250,210,97' : '244,112,103'},0.1)`
  const label      = isCorrect ? 'Correct Play' : (MISTAKE_LABELS[analysis.mistakeType] || 'Leak Detected')
  const ev         = typeof analysis.ev_impact === 'number' ? analysis.ev_impact : null
  const evColor    = ev == null ? C.textMuted : ev >= 0 ? C.primary : C.red
  const leakLabel  = analysis.leak_category ? LEAK_LABELS[analysis.leak_category] : null

  return (
    <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
      <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px', flexShrink:0 }}>
        <BrainCircuit size={14} color="#071525" />
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>

        {/* Hand strength + board texture */}
        {(analysis.heroHandStrength || analysis.boardTexture) && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {analysis.heroHandStrength && (
              <span style={{ fontSize:'0.6rem', fontWeight:600, color:'#ffc0ac', background:'rgba(255,192,172,0.08)', padding:'3px 9px', borderRadius:'8px', letterSpacing:'0.03em' }}>
                {analysis.heroHandStrength}
              </span>
            )}
            {analysis.boardTexture && (
              <span style={{ fontSize:'0.6rem', fontWeight:600, color:C.textMuted, background:C.surfaceHi, padding:'3px 9px', borderRadius:'8px', letterSpacing:'0.03em' }}>
                {analysis.boardTexture}
              </span>
            )}
          </div>
        )}

        {/* Reconstructed action line — the fixed set of facts the verdict is built on */}
        {analysis.actionLine && (
          <div style={{ padding:'8px 12px', borderRadius:'8px', background:C.surfaceHi, fontSize:'0.68rem', color:C.textMuted, lineHeight:1.55, fontVariantNumeric:'tabular-nums' }}>
            {analysis.actionLine}
          </div>
        )}

        {/* Summary */}
        {analysis.summary && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background:'rgba(22,27,34,0.9)', border:'1px solid rgba(146,204,255,0.08)', fontSize:'0.85rem', color:C.text, lineHeight:1.6 }}>
            {analysis.summary}
          </div>
        )}

        {/* Biggest Mistake / Correct Play */}
        {analysis.biggestMistake && (
          <div style={{ padding:'12px 14px', borderRadius:'10px', background:isCorrect ? C.primaryDim : C.redDim, border:`1px solid ${isCorrect ? C.primaryBorder : C.redBorder}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px', flexWrap:'wrap' }}>
              {isCorrect
                ? <CheckCircle size={14} color={C.primary} />
                : <AlertCircle size={14} color={C.red} />}
              <span style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:isCorrect ? C.primary : C.red }}>
                {label}
              </span>
              {leakLabel && leakLabel !== 'No Clear Leak' && (
                <span style={{ fontSize:'0.58rem', fontWeight:600, color:'#ffc0ac', background:'rgba(255,192,172,0.1)', padding:'2px 7px', borderRadius:'10px' }}>
                  {leakLabel}
                </span>
              )}
              <span style={{ marginLeft:'auto', fontSize:'0.58rem', fontWeight:600, color:confColor, background:confBg, padding:'2px 7px', borderRadius:'10px' }}>
                {conf} conf.
              </span>
            </div>

            <div style={{ fontSize:'0.875rem', color:C.text, lineHeight:1.6, fontWeight:600 }}>
              {analysis.biggestMistake}
            </div>

            {/* whyWrong — expandable */}
            {analysis.whyWrong && (
              <>
                <button
                  onClick={() => setWhyOpen(v => !v)}
                  style={{ display:'flex', alignItems:'center', gap:'4px', background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.7rem', fontWeight:600, padding:'6px 0 0' }}
                >
                  {whyOpen ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                  {whyOpen ? 'Hide' : 'Why?'}
                </button>
                {whyOpen && (
                  <div style={{ fontSize:'0.8rem', color:C.textMuted, lineHeight:1.6, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'8px', marginTop:'4px' }}>
                    {analysis.whyWrong}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* EV Impact */}
        {ev != null && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background: ev >= 0 ? C.primaryDim : C.redDim, border:`1px solid ${ev >= 0 ? C.primaryBorder : C.redBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted }}>Estimated EV Impact</span>
            <span style={{ fontSize:'0.95rem', fontWeight:800, color:evColor, letterSpacing:'-0.02em' }}>
              {ev >= 0 ? `+$${ev}` : `-$${Math.abs(ev)}`}
            </span>
          </div>
        )}

        {/* Better Line */}
        {analysis.betterLine && analysis.betterLine !== 'Continue as played' && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}` }}>
            <div style={{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.primary, marginBottom:'4px' }}>Better Line</div>
            <div style={{ fontSize:'0.875rem', color:C.text, lineHeight:1.6, fontWeight:600 }}>{analysis.betterLine}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Follow-up answer card ─────────────────────────────────────────────────────
function FollowUpCard({ followUp }) {
  const conf     = followUp.confidence || 'medium'
  const confColor = { high: C.primary, medium: '#FAD261', low: C.red }[conf]
  const confBg    = `rgba(${conf === 'high' ? '84,233,138' : conf === 'medium' ? '250,210,97' : '244,112,103'},0.1)`

  return (
    <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
      <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px', flexShrink:0 }}>
        <BrainCircuit size={14} color="#071525" />
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
        {followUp.answer && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background:'rgba(22,27,34,0.9)', border:'1px solid rgba(146,204,255,0.08)', fontSize:'0.875rem', color:C.text, lineHeight:1.7 }}>
            {followUp.answer}
          </div>
        )}
        {followUp.keyTakeaway && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, display:'flex', flexDirection:'column', gap:'4px' }}>
            <span style={{ fontSize:'0.55rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.primary }}>Key Takeaway</span>
            <span style={{ fontSize:'0.82rem', color:C.text, lineHeight:1.6, fontWeight:600 }}>{followUp.keyTakeaway}</span>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <span style={{ fontSize:'0.58rem', fontWeight:600, color:confColor, background:confBg, padding:'2px 8px', borderRadius:'10px' }}>
            {conf} conf.
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Plain chat bubble ─────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user'

  if (msg.type === 'analysis' && msg.analysis) {
    return <AnalysisCard analysis={msg.analysis} />
  }

  if (msg.type === 'follow_up' && msg.followUp) {
    return <FollowUpCard followUp={msg.followUp} />
  }

  let content = msg.content || ''

  // Last-resort: if assistant text looks like JSON, try to recover
  if (!isUser && content.trimStart().startsWith('{')) {
    console.warn('[coach] Bubble received JSON-like content, attempting recovery')
    // Try follow_up schema first
    try {
      const p = JSON.parse(content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())
      if (p?.type === 'follow_up' && (p.answer || p.keyTakeaway)) return <FollowUpCard followUp={p} />
    } catch {}
    // Try analysis schema (tolerant parser)
    const recovered = parseAnalysisText(content)
    if (recovered) return <AnalysisCard analysis={recovered} />
    // Worst case: show raw text in a plain answer card (never blank error)
    return <FollowUpCard followUp={{ type:'follow_up', answer: content, keyTakeaway:'', confidence:'low' }} />
  }

  return (
    <div style={{ display:'flex', flexDirection:isUser?'row-reverse':'row', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
      {!isUser && (
        <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px', flexShrink:0 }}>
          <BrainCircuit size={14} color="#071525" />
        </div>
      )}
      <div style={{
        maxWidth:'85%', padding:'12px 16px',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        background: isUser ? C.surfaceHigh : 'rgba(22,27,34,0.9)',
        border: `1px solid ${isUser ? 'transparent' : 'rgba(146,204,255,0.08)'}`,
        fontSize:'0.875rem', lineHeight:1.75, color:C.text, whiteSpace:'pre-wrap', wordBreak:'break-word',
      }}>
        {content}
      </div>
    </div>
  )
}

// Slim nudge in the Coach that points to the dedicated Leak Profile tab. Keeps the
// chat uncluttered while preserving the in-flow discovery of the moat (the full
// profile, teaser/Pro split, and CTAs now live in components/LeakProfile.jsx).
function LeakNudge({ nAnalyzed, leaks, onOpen }) {
  if (nAnalyzed < 1) return null
  const revealed = nAnalyzed >= 5 && leaks.length > 0

  if (!revealed) {
    const left = Math.max(0, 5 - nAnalyzed)
    const msg = left > 0
      ? `${nAnalyzed}/5 hands — Leak Profile unlocks at 5.`
      : `No leaks found yet — solid play. Keep analyzing.`
    return (
      <div onClick={onOpen} style={{ marginTop:'8px', padding:'10px 14px', borderRadius:'10px', background:C.surface, border:`1px solid ${C.border}`, display:'flex', gap:'10px', alignItems:'center', cursor:'pointer' }}>
        <TrendingDown size={15} color={C.secondary} style={{ flexShrink:0 }} />
        <span style={{ fontSize:'0.74rem', color:C.textMuted, flex:1 }}>{msg}</span>
        <ChevronRight size={15} color={C.textMuted} />
      </div>
    )
  }

  const nRecurring = leaks.filter(l => l.recurring).length
  return (
    <div onClick={onOpen} style={{ marginTop:'8px', padding:'12px 14px', borderRadius:'10px', background:C.surface, border:`1px solid ${C.primaryBorder}`, display:'flex', gap:'10px', alignItems:'center', cursor:'pointer' }}>
      <TrendingDown size={16} color={C.primary} style={{ flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.78rem', fontWeight:700, color:C.text }}>Your Leak Profile</div>
        <div style={{ fontSize:'0.68rem', color:C.textMuted }}>
          {leaks.length} leak{leaks.length>1?'s':''} found{nRecurring > 0 ? ` · ${nRecurring} recurring` : ''} — tap to view
        </div>
      </div>
      <ChevronRight size={16} color={C.primary} />
    </div>
  )
}

// Pre-filled example so a first-time user with no hand of their own still gets
// the "aha" in one click — kills the hidden "what do I even paste?" friction.
// Written the way a live rec player actually tells a story (free text, not a form).
const EXAMPLE_HAND = `1/3 live, $500 effective. I'm on the BTN with Qs Js.
UTG is a tight live reg — when he jams a river, he has it.
UTG opens to $15, I call.
Flop Qh Jd 4h, pot ~$33. UTG checks, I bet $20 with top two pair, he calls.
Turn 8h — the flush gets there. UTG leads out $55, I call.
River 2c. UTG jams $180 into ~$180. What should I do?`

// Hardcoded analysis for the example hand so the first-run demo is INSTANT (no
// API round-trip, no Pro-model wait, works even if /api/coach is down). Mirrors
// the real analysis schema so it renders through the same AnalysisCard. The hand
// is a clear, non-debatable fold (two pair dead to a four-flush vs a nit) so the
// demo is unambiguously instructive.
const EXAMPLE_ANALYSIS = {
  heroHandStrength: 'Two Pair, Queens and Jacks',
  boardTexture:     'three-flush (hearts) — flush completes on the turn',
  actionLine:       'UTG opens $15, BTN calls. Flop Qh Jd 4h: UTG checks, hero bets $20, UTG calls. Turn 8h (flush in): UTG leads $55, hero calls. River 2c: UTG jams $180 into ~$180 (~$180 effective).',
  summary:          'Fold. He check-called the flop, then led the turn the moment the flush arrived and jams the river — in live cash that line is the flush almost every time.',
  biggestMistake:   'Calling the river — the check-call-then-lead-into-the-scare-card line is a made flush; two pair beats only bluffs he rarely has.',
  mistakeType:      'overcall',
  leak_category:    'river_call_too_wide',
  ev_impact:        -180,
  confidence:       'high',
  whyWrong:         'Live players underbluff big rivers. He check-called the flop on the draw, took the lead the instant the third heart hit, and jammed the river — that sequencing is a made flush. Two pair only beats bluffs, which he rarely has. (The turn call was already optimistic.)',
  betterLine:       'Fold.',
}

export default function AICoach({ preloadedHand, onHandConsumed }) {
  const { updateHand, addHand, hands } = useData()
  const navigate = useNavigate()
  const [messages,    setMessages]   = useLocalStorage('aicoach-messages', [])
  const [input,       setInput]      = useState('')
  const [playerType,  setPlayerType] = useState('Unknown')
  const [extraNotes,  setExtraNotes] = useState('')
  const [loading,     setLoading]    = useState(false)
  const [loadedHand,  setLoadedHand] = useState(null)
  const [error,       setError]      = useState('')
  // Deterministic "instant read" shown WHILE Gemini thinks — fills latency and
  // proves we parsed the cards right (the correctness moat) before the LLM returns.
  const [instantRead, setInstantRead] = useState(null)
  const bottomRef     = useRef(null)
  const inputRef      = useRef(null)
  // Ref always reflects the latest loadedHand — avoids stale closures in async callbacks
  const currentHandRef = useRef(null)
  useEffect(() => { currentHandRef.current = loadedHand }, [loadedHand])
  // Holds the extracted cards + raw text of a free-text hand being analyzed, so we
  // can persist it (→ leak profile) once the analysis returns.
  const pendingFreeHandRef = useRef(null)

  // Save a free-text-analyzed hand into the user's hand store so it feeds the Leak
  // Profile. Only the AI fields + extracted cards are kept (no manual logging UI).
  const persistFreeHand = useCallback((analysis) => {
    const pf = pendingFreeHandRef.current
    if (!pf || !analysis) return
    pendingFreeHandRef.current = null
    addHand({
      holeCards:    pf.hole,
      boardCards:   pf.board,
      position:     '',
      street:       '',
      action:       '',
      result:       0,
      notes:        (pf.text || '').slice(0, 500),
      aiAnalysis:   analysis,
      leakCategory: analysis.leak_category || null,
      evImpact:     typeof analysis.ev_impact === 'number' ? analysis.ev_impact : null,
    }).catch(() => {})
  }, [addHand])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, loading])

  // Once the response lands (loading → false) the AnalysisCard shows the verified
  // strength, so the transient instant-read banner is no longer needed.
  useEffect(() => { if (!loading) setInstantRead(null) }, [loading])

  // Auto-grow the composer to fit a pasted hand (instead of a fixed 2 rows you have
  // to scroll inside). Runs on any input change incl. "Try this example". Capped so
  // it never eats the whole screen; scrolls past the cap.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input])

  // Build the instant deterministic read from already-evaluated cards.
  function buildInstantRead(handEval, hole, board) {
    if (!handEval || hole.length < 2) return null
    const full = handEval.contextLevel === 'full'
    return {
      cards:   [...hole, ...board],
      // Only claim a made-hand strength when we have the full board — otherwise
      // just confirm we read the hole cards correctly (no misleading label).
      label:   full ? handEval.heroHandStrength : 'Reading your cards…',
      texture: full ? (handEval.boardTexture?.description || '') : '',
    }
  }

  // Preload hand: key on hand ID so switching hands always fires the effect.
  // Clear messages so the previous hand's conversation doesn't pollute the new analysis.
  useEffect(() => {
    if (!preloadedHand?.id) return
    setLoadedHand(preloadedHand)
    setMessages([])   // clear old conversation — new hand, fresh context
    setExtraNotes('')
    onHandConsumed?.()
  }, [preloadedHand?.id])

  const sendMessage = useCallback(async (text, isHandAnalysis = false, handEval = null, freshThread = false) => {
    const content = (text || input).trim()
    if (!content || loading) return
    // Analyzing a hand is FREE — this is the hook that competes with ChatGPT.
    // The paywall moves to the Leak Profile (see PROJECT/v1-60s-flow.md), not here.
    setError('')

    // Read preferences at call time so they're always current
    const language = getPref('aicoach-language', 'English')

    const userMsg = { role:'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Build payload — follow-up gets explicit hand context + question.
    // freshThread (a NEW hand pasted mid-conversation) sends ONLY this hand as
    // context, so a prior hand's chat doesn't contaminate the new analysis. The
    // visible thread still keeps every hand.
    const msgHistory = (freshThread ? [userMsg] : newMessages.slice(-12))
      .map(m => ({ role:m.role, content:m.content || '' }))

    const payload = isHandAnalysis
      ? {
          isHandAnalysis: true,
          playerType,
          language,
          messages: msgHistory,
          // Deterministic hand evaluation — backend injects these into prompt
          verifiedHeroHandStrength: handEval?.heroHandStrength || '',
          verifiedBestFiveCards:    handEval?.bestFiveCards    || [],
          verifiedBoardTexture:     handEval?.boardTexture?.description || '',
        }
      : {
          request_type:      'follow_up',
          question:          content,
          hand_context:      currentHandRef.current || null,
          villain_type:      playerType,
          response_language: language,
          messages:          msgHistory,
        }

    console.log('[coach] sending:', isHandAnalysis ? 'analysis' : 'follow_up', '|', content.slice(0, 80))

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const headers = { 'Content-Type':'application/json' }
      if (authSession?.access_token) headers.Authorization = `Bearer ${authSession.access_token}`

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      console.log('[coach] Response type:', data.type)

      if (data.type === 'follow_up' && data.followUp) {
        setMessages(prev => [...prev, {
          role:     'assistant',
          type:     'follow_up',
          content:  data.followUp.answer || '',
          followUp: data.followUp,
        }])

      } else if (data.type === 'analysis' && data.analysis) {
        // Override AI hand assessment with deterministic values — never trust AI to read its own cards
        if (handEval?.heroHandStrength) {
          data.analysis.heroHandStrength = handEval.heroHandStrength
        }
        if (handEval?.boardTexture?.description) {
          data.analysis.boardTexture = handEval.boardTexture.description
        }
        setMessages(prev => [...prev, { role:'assistant', type:'analysis', content: data.analysis.summary || '', analysis:data.analysis }])
        const hand = currentHandRef.current
        if (isHandAnalysis && hand?.id) {
          updateHand(hand.id, {
            ...hand,
            aiAnalysis:   data.analysis,
            leakCategory: data.analysis.leak_category || null,
            evImpact:     typeof data.analysis.ev_impact === 'number' ? data.analysis.ev_impact : null,
          }).catch(() => {})
        } else if (isHandAnalysis) {
          persistFreeHand(data.analysis) // free-text hand → save for the leak profile
        }

      } else {
        // type === 'reply' fallback
        const replyText = data.reply || ''

        if (isHandAnalysis) {
          // Try to recover structured analysis
          const recovered = parseAnalysisText(replyText)
          if (recovered) {
            console.log('[coach] Frontend recovered structured analysis from reply fallback')
            setMessages(prev => [...prev, { role:'assistant', type:'analysis', content: recovered.summary || '', analysis:recovered }])
            const hand = currentHandRef.current
            if (hand?.id) {
              updateHand(hand.id, {
                ...hand,
                aiAnalysis:   recovered,
                leakCategory: recovered.leak_category || null,
                evImpact:     typeof recovered.ev_impact === 'number' ? recovered.ev_impact : null,
              }).catch(() => {})
            } else {
              persistFreeHand(recovered) // free-text hand → save for the leak profile
            }
            return
          }
          // Could not parse as analysis — show raw text in an answer card (never blank-error)
          console.error('[coach] analysis reply could not be parsed, showing as text:', replyText.slice(0, 200))
          const displayText = replyText || 'Analysis could not be displayed. Please try again.'
          setMessages(prev => [...prev, {
            role: 'assistant', type: 'follow_up',
            content: displayText,
            followUp: { type: 'follow_up', answer: displayText, keyTakeaway: '', confidence: 'low' },
          }])

        } else {
          // Follow-up fallback: wrap any text as a FollowUpCard — NEVER show "No response"
          if (!replyText) {
            setMessages(prev => [...prev, { role:'assistant', type:'reply', content:'Could not get a response. Please try again.' }])
            return
          }
          // Try to parse as follow_up JSON (in case backend returned reply but body is JSON)
          try {
            const p = JSON.parse(replyText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())
            if (p && (p.answer || p.keyTakeaway)) {
              setMessages(prev => [...prev, {
                role:'assistant', type:'follow_up',
                content: p.answer || '',
                followUp: { type:'follow_up', answer: p.answer || '', keyTakeaway: p.keyTakeaway || '', confidence: p.confidence || 'medium' },
              }])
              return
            }
          } catch {}
          // Wrap plain text as a follow-up answer card
          setMessages(prev => [...prev, {
            role:'assistant', type:'follow_up',
            content: replyText,
            followUp: { type:'follow_up', answer: replyText, keyTakeaway: '', confidence: 'medium' },
          }])
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, playerType])

  // Build prompt from preloaded hand and trigger analysis
  const handleAnalyzeHand = useCallback(() => {
    const hand = loadedHand   // explicit capture at click time
    if (!hand || loading) return
    // Free to analyze (see sendMessage note). Paywall lives at the Leak Profile.

    // Deterministic hand evaluation — before calling AI
    const handEval = evaluateHeroHand(hand.holeCards, hand.boardCards)
    setInstantRead(buildInstantRead(handEval, hand.holeCards || [], hand.boardCards || []))
    console.log('[coach] hand eval:', handEval.heroHandStrength, '| best5:', handEval.bestFiveCards, '| board:', handEval.boardTexture?.description)
    console.log('[coach] Analyzing hand:', hand.id, hand.holeCards, '| villain:', playerType)

    const resultStr = fmtResult(hand.result)
    const boardStr  = hand.boardCards?.length ? hand.boardCards.join(' ') : 'none'
    const noteParts = [hand.notes, extraNotes.trim()].filter(Boolean).join(' | ')
    const prompt = [
      `Analyze this hand:`,
      `Position=${hand.position}`,
      `Street=${hand.street}`,
      `Hole cards=${hand.holeCards.join(' ')}`,
      `Board=${boardStr}`,
      hand.action ? `Action=${hand.action}` : null,
      hand.potSize != null ? `Pot=$${hand.potSize}` : null,
      resultStr ? `Result=${resultStr}` : null,
      noteParts ? `Notes: ${noteParts}` : null,
    ].filter(Boolean).join(', ')

    console.log('[coach] Prompt:', prompt)
    sendMessage(prompt, true, handEval)
  }, [loadedHand, extraNotes, loading, playerType, sendMessage])

  // Main composer send. The FIRST message (no preloaded hand, empty thread) is
  // treated as a HAND to analyze → structured analysis path (Mistake/EV/Better line),
  // with a best-effort deterministic read shown instantly. Later messages are
  // follow-up chat on that hand.
  const handleSend = useCallback((override) => {
    // `override` lets callers analyze a specific hand in one click (e.g. the
    // "Try this example" button) without round-tripping through input state.
    // Guarded by typeof so onClick={handleSend} (which passes an event) still
    // falls back to the composer text.
    const text = (typeof override === 'string' ? override : input).trim()
    if (!text || loading) return
    const { hole, board } = extractCardsFromText(text)
    // Treat as a NEW hand to analyze — not just the first message, but ANY message
    // that looks like a pasted hand (≥2 hole cards + a board / multiple lines / real
    // length). Without this, the 2nd hand pasted into a thread fell through to the
    // follow-up chat path and returned a "Key Takeaway" blurb instead of a card.
    const looksLikeHand = hole.length >= 2 && (board.length >= 1 || /\n/.test(text) || text.length > 60)
    const isNewHand = !loadedHand && (looksLikeHand || messages.length === 0)
    if (isNewHand) {
      const handEval = hole.length >= 2 ? evaluateHeroHand(hole, board) : null
      setInstantRead(buildInstantRead(handEval, hole, board))
      // Remember the cards + text so we can persist this hand into the leak profile
      // once the analysis returns.
      pendingFreeHandRef.current = { hole, board, text }
      // Only let the deterministic value OVERRIDE the AI when we have a full board
      // (≥5 cards). For suitless live stories we can't verify the made hand, so we
      // pass null and let Gemini reason from the full text (documented best-effort).
      const trustEval = handEval?.contextLevel === 'full' ? handEval : null
      // freshThread=true → analyze this hand in isolation (don't feed prior hands).
      sendMessage(text, true, trustEval, true)
    } else {
      sendMessage(text) // follow-up on the current hand
    }
  }, [input, loading, loadedHand, messages.length, sendMessage])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // First-run demo: show the example hand + its (hardcoded) analysis INSTANTLY —
  // no API call, no Pro-model wait. The fastest possible path to the aha.
  const showExample = useCallback(() => {
    if (loading) return
    setLoadedHand(null)
    setInput('')
    setInstantRead(null)
    setMessages([
      { role:'user', content: EXAMPLE_HAND },
      { role:'assistant', type:'analysis', content: EXAMPLE_ANALYSIS.summary, analysis: EXAMPLE_ANALYSIS },
    ])
  }, [loading, setMessages])

  const resultStr = loadedHand ? fmtResult(loadedHand.result) : null

  // Leak profile drives the progressive reveal (hands accumulate across the session).
  const nAnalyzed = useMemo(() => analyzedCount(hands), [hands])
  const leaks     = useMemo(() => computeLeaks(hands),  [hands])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, fontFamily:"'Inter',sans-serif" }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'14px 16px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 16px rgba(146,204,255,0.2)' }}>
            <BrainCircuit size={16} color="#071525" />
          </div>
          <div>
            <div style={{ fontSize:'0.9rem', fontWeight:700, color:C.text, letterSpacing:'-0.01em' }}>AI Coach</div>
            <div style={{ fontSize:'0.62rem', color:C.textMuted }}>Hand analysis & leak finder</div>
          </div>
        </div>
        {/* Explicit "new hand" — clears the thread so the next paste is analyzed fresh.
            No guessing whether a message is a new hand or a follow-up. */}
        <button onClick={() => { setMessages([]); setError(''); setLoadedHand(null); setExtraNotes(''); setInput(''); setInstantRead(null); pendingFreeHandRef.current = null }}
          style={{ height:'36px', padding:'0 14px', borderRadius:'8px', border:`1px solid ${C.primaryBorder}`, background:C.primaryDim, color:C.primary, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', fontSize:'0.74rem', fontWeight:700 }}>
          <Plus size={15} /> New hand
        </button>
      </div>

      {/* Preloaded hand card */}
      {loadedHand && (
        <div style={{ margin:'10px 16px 0', padding:'14px', borderRadius:'12px', background:C.surface, border:`1px solid ${C.primaryBorder}`, flexShrink:0, display:'flex', flexDirection:'column', gap:'10px' }}>
          {/* Hand summary row */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:C.primary, background:C.primaryDim, padding:'2px 8px', borderRadius:'6px' }}>
              {loadedHand.position}
            </span>
            <div style={{ display:'flex', gap:'3px' }}>
              {loadedHand.holeCards.map(c => <MiniCard key={c} card={c} />)}
            </div>
            {loadedHand.boardCards?.length > 0 && (
              <>
                <span style={{ fontSize:'0.58rem', color:C.textMuted }}>|</span>
                <div style={{ display:'flex', gap:'2px' }}>
                  {loadedHand.boardCards.map(c => <MiniCard key={c} card={c} />)}
                </div>
              </>
            )}
            <span style={{ fontSize:'0.6rem', color:C.textMuted }}>{loadedHand.street}</span>
            {resultStr && (
              <span style={{ fontSize:'0.9rem', fontWeight:700, letterSpacing:'-0.02em', color:loadedHand.result > 0 ? C.primary : C.red, fontVariantNumeric:'tabular-nums' }}>
                {resultStr}
              </span>
            )}
            <button onClick={() => { setLoadedHand(null); setExtraNotes('') }}
              style={{ marginLeft:'auto', background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.7rem', padding:'2px 6px', borderRadius:'4px' }}>✕</button>
          </div>

          {/* Existing notes */}
          {loadedHand.notes && (
            <div style={{ fontSize:'0.72rem', color:C.textMuted, lineHeight:1.5, padding:'8px 10px', background:C.surfaceHi, borderRadius:'6px' }}>
              {loadedHand.notes}
            </div>
          )}

          {/* Extra notes */}
          <textarea
            value={extraNotes}
            onChange={e => setExtraNotes(e.target.value)}
            placeholder="Add context before analyzing... (villain read, sizing details, stack depth)"
            rows={2}
            style={{ padding:'8px 10px', background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:'8px', color:C.text, fontSize:'0.78rem', resize:'none', outline:'none', fontFamily:"'Inter',sans-serif", lineHeight:1.5, colorScheme:'dark' }}
          />

          {/* Villain selector + Analyze button */}
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            {['Unknown', 'Nit', 'TAG', 'LAG', 'Fish', 'Rec'].map(type => (
              <button key={type} onClick={() => setPlayerType(type)} style={{
                padding:'5px 10px', borderRadius:'8px',
                border:`1px solid ${playerType===type ? C.secondary : C.border}`,
                background: playerType===type ? 'rgba(146,204,255,0.1)' : 'transparent',
                color: playerType===type ? C.secondary : C.textMuted,
                fontSize:'0.62rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s',
              }}>{type}</button>
            ))}
            <button
              onClick={handleAnalyzeHand}
              disabled={loading}
              style={{
                marginLeft:'auto', padding:'8px 18px', borderRadius:'8px', border:'none',
                background: loading ? C.surfaceHigh : 'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)',
                color: loading ? C.textMuted : '#071525',
                fontSize:'0.72rem', fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:'6px', transition:'all 0.15s',
                boxShadow: loading ? 'none' : '0 0 14px rgba(146,204,255,0.25)',
              }}
            >
              <BrainCircuit size={13} />
              {loading ? 'Analyzing…' : 'Analyze Hand'}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column' }}>
        {messages.length === 0 && !loadedHand && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'14px', padding:'0 16px' }}>
            <div style={{ opacity:0.35 }}><BrainCircuit size={44} color={C.secondary} /></div>
            <div style={{ fontSize:'1.35rem', fontWeight:800, letterSpacing:'-0.02em', color:C.text, textAlign:'center', lineHeight:1.2 }}>
              Paste a hand.<br/>Find your leaks.
            </div>
            <div style={{ fontSize:'0.78rem', color:C.textMuted, textAlign:'center', maxWidth:'280px', lineHeight:1.55 }}>
              Paste a hand history or just tell the story below — online or live. Get your biggest mistake and a better line in seconds.
            </div>
            {/* One click → instant analysis. The fastest path to the "aha" for a
                first-timer who has no hand of their own to paste yet. */}
            <button
              onClick={showExample}
              style={{
                marginTop:'6px', padding:'12px 20px', borderRadius:'11px', border:'none',
                background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e',
                fontSize:'0.82rem', fontWeight:800, cursor:'pointer',
                display:'flex', alignItems:'center', gap:'7px',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.25)',
              }}
            >
              <BrainCircuit size={15} /> See an example analysis →
            </button>
            <div style={{ fontSize:'0.66rem', color:C.textMuted, opacity:0.7 }}>
              Instant · no signup needed
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}

        {/* Instant deterministic read — shown while Gemini thinks (correctness moat + latency fill) */}
        {instantRead && loading && (
          <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
            <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <CheckCircle size={14} color={C.primary} />
            </div>
            <div style={{ flex:1, padding:'10px 14px', background:'rgba(22,27,34,0.9)', border:`1px solid ${C.primaryBorder}`, borderRadius:'4px 16px 16px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
              {instantRead.cards.length > 0 && (
                <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
                  {instantRead.cards.map(c => <MiniCard key={c} card={c} />)}
                </div>
              )}
              <div style={{ fontSize:'0.8rem', fontWeight:700, color:C.text, letterSpacing:'-0.01em' }}>
                {instantRead.label}
              </div>
              {instantRead.texture && (
                <div style={{ fontSize:'0.68rem', color:C.textMuted }}>{instantRead.texture} board</div>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
            <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <BrainCircuit size={14} color="#071525" />
            </div>
            <div style={{ padding:'12px 16px', background:'rgba(22,27,34,0.9)', border:`1px solid rgba(146,204,255,0.08)`, borderRadius:'4px 16px 16px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
              <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:'6px', height:'6px', borderRadius:'50%', background:C.secondary, animation:`pulse 1.2s ${i*0.2}s infinite` }} />
                ))}
              </div>
              {/* Reassure: the Pro model reasons deeply, so it's a few seconds — not a hang. */}
              <div style={{ fontSize:'0.66rem', color:C.textMuted }}>Reading the hand in depth — a few seconds…</div>
            </div>
          </div>
        )}

        <LeakNudge
          nAnalyzed={nAnalyzed}
          leaks={leaks}
          onOpen={() => navigate('/leaks')}
        />

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin:'0 16px 8px', padding:'10px 14px', borderRadius:'8px', background:C.redDim, border:`1px solid ${C.redBorder}`, fontSize:'0.76rem', color:C.red, flexShrink:0 }}>
          {error}
        </div>
      )}

      {/* Free-text input. Villain type is no longer a selector — just describe the
          villain in the story ("vs a nit who never bluffs") and the model uses it. */}
      <div style={{ padding:'12px 16px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:'8px', flexShrink:0 }}>
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              loadedHand ? 'Ask a follow-up question…'
              : messages.length > 0 ? 'Ask a follow-up — or paste a new hand'
              : 'Paste a hand… (Enter to send)'
            }
            rows={2}
            style={{ flex:1, minHeight:'52px', maxHeight:'200px', padding:'10px 12px', background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:'10px', color:C.text, fontSize:'0.875rem', resize:'none', outline:'none', overflowY:'auto', fontFamily:"'Inter',sans-serif", lineHeight:1.6, colorScheme:'dark' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width:'44px', height:'44px', borderRadius:'10px', border:'none', flexShrink:0,
              background: input.trim() && !loading ? 'linear-gradient(135deg,#67f09a,#54e98a,#2db866)' : C.surfaceHigh,
              color: input.trim() && !loading ? '#061a0e' : C.textMuted,
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.5);opacity:0.3} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  )
}
