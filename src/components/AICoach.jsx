import React, { useState, useRef, useEffect, useCallback } from 'react'
import { BrainCircuit, Send, RefreshCw, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useData } from '../context/DataContext'

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

const LEAK_LABELS = {
  river_call_too_wide: 'River Call Too Wide',
  turn_call_too_wide:  'Turn Call Too Wide',
  overbluff:           'Overbluff',
  missed_value:        'Missed Value',
  passive_play:        'Passive Play',
  bad_preflop:         'Bad Preflop',
  overpair_overplay:   'Overpair Overplay',
  top_pair_overplay:   'Top Pair Overplay',
  draw_chasing:        'Draw Chasing',
  no_clear_leak:       'No Clear Leak',
}

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

function parseAnalysisText(text) {
  if (!text || typeof text !== 'string') return null
  const attempts = [
    text,
    text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(),
  ]
  const m = text.match(/\{[\s\S]*\}/)
  if (m) attempts.push(m[0])

  for (const s of attempts) {
    try {
      const p = JSON.parse(s)
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue
      if (!p.summary && !p.biggestMistake) continue
      return {
        summary:         typeof p.summary        === 'string' ? p.summary        : '',
        biggestMistake:  typeof p.biggestMistake === 'string' ? p.biggestMistake : '',
        mistakeType:     VALID_MISTAKE_TYPES.includes(p.mistakeType) ? p.mistakeType : 'other',
        leak_category:   VALID_LEAK_CATS.includes(p.leak_category)  ? p.leak_category : 'no_clear_leak',
        ev_impact:       typeof p.ev_impact === 'number' ? p.ev_impact : 0,
        confidence:      ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium',
        whyWrong:        typeof p.whyWrong   === 'string' ? p.whyWrong   : '',
        betterLine:      typeof p.betterLine  === 'string' ? p.betterLine  : '',
        gameTypeUsed:    typeof p.gameTypeUsed    === 'string' ? p.gameTypeUsed    : '',
        villainTypeUsed: typeof p.villainTypeUsed === 'string' ? p.villainTypeUsed : '',
      }
    } catch (e) {
      console.error('[coach] frontend parse attempt failed:', e.message)
    }
  }
  return null
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

        {/* Context tags */}
        {(analysis.gameTypeUsed || analysis.villainTypeUsed) && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {analysis.gameTypeUsed && (
              <span style={{ fontSize:'0.58rem', fontWeight:600, color:C.secondary, background:'rgba(146,204,255,0.1)', padding:'2px 8px', borderRadius:'8px', letterSpacing:'0.05em' }}>
                {analysis.gameTypeUsed}
              </span>
            )}
            {analysis.villainTypeUsed && (
              <span style={{ fontSize:'0.58rem', fontWeight:600, color:C.textMuted, background:C.surfaceHi, padding:'2px 8px', borderRadius:'8px', letterSpacing:'0.05em' }}>
                vs {analysis.villainTypeUsed}
              </span>
            )}
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

// ── Plain chat bubble ─────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user'

  if (msg.type === 'analysis' && msg.analysis) {
    return <AnalysisCard analysis={msg.analysis} />
  }

  let content = msg.content || ''

  if (!isUser && content.trimStart().startsWith('{')) {
    console.warn('[coach] Bubble received JSON-like content, attempting recovery')
    const recovered = parseAnalysisText(content)
    if (recovered) return <AnalysisCard analysis={recovered} />
    content = 'Analysis complete. Please try again for structured output.'
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

export default function AICoach({ preloadedHand, onHandConsumed }) {
  const { updateHand } = useData()
  const [messages,    setMessages]   = useLocalStorage('aicoach-messages', [])
  const [input,       setInput]      = useState('')
  const [playerType,  setPlayerType] = useState('Unknown')
  const [extraNotes,  setExtraNotes] = useState('')
  const [loading,     setLoading]    = useState(false)
  const [loadedHand,  setLoadedHand] = useState(null)
  const [error,       setError]      = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, loading])

  // Preload hand without auto-analyzing — user must click Analyze
  useEffect(() => {
    if (preloadedHand) {
      setLoadedHand(preloadedHand)
      setExtraNotes('')
      onHandConsumed?.()
    }
  }, [preloadedHand])

  const sendMessage = useCallback(async (text, isHandAnalysis = false) => {
    const content = (text || input).trim()
    if (!content || loading) return
    setError('')

    // Read preferences at call time so they're always current
    const gameType = getPref('user-default-game-type', 'Live Cash')
    const language = getPref('aicoach-language', 'English')

    const userMsg = { role:'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          isHandAnalysis,
          gameType,
          playerType,
          language,
          messages: newMessages.slice(-12).map(m => ({ role:m.role, content:m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      if (data.type === 'analysis' && data.analysis) {
        setMessages(prev => [...prev, { role:'assistant', type:'analysis', content:'', analysis:data.analysis }])
        if (isHandAnalysis && loadedHand?.id) {
          updateHand(loadedHand.id, {
            ...loadedHand,
            aiAnalysis:   data.analysis,
            leakCategory: data.analysis.leak_category || null,
            evImpact:     typeof data.analysis.ev_impact === 'number' ? data.analysis.ev_impact : null,
          }).catch(() => {})
        }
      } else {
        const replyText = data.reply || 'No response.'

        if (isHandAnalysis) {
          const recovered = parseAnalysisText(replyText)
          if (recovered) {
            console.log('[coach] Frontend recovered structured analysis from reply fallback')
            setMessages(prev => [...prev, { role:'assistant', type:'analysis', content:'', analysis:recovered }])
            if (loadedHand?.id) {
              updateHand(loadedHand.id, {
                ...loadedHand,
                aiAnalysis:   recovered,
                leakCategory: recovered.leak_category || null,
                evImpact:     typeof recovered.ev_impact === 'number' ? recovered.ev_impact : null,
              }).catch(() => {})
            }
            return
          }
          if (replyText.trimStart().startsWith('{')) {
            console.error('[coach] Reply looks like JSON but failed to parse:', replyText.slice(0, 200))
            setMessages(prev => [...prev, { role:'assistant', type:'reply', content:'Analysis received but could not be displayed. Please try again.' }])
            return
          }
        }

        setMessages(prev => [...prev, { role:'assistant', type:'reply', content: replyText }])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, playerType, loadedHand])

  // Build prompt from preloaded hand and trigger analysis
  const handleAnalyzeHand = useCallback(() => {
    if (!loadedHand || loading) return
    const h = loadedHand
    const resultStr = fmtResult(h.result)
    const boardStr  = h.boardCards?.length ? h.boardCards.join(' ') : 'none'
    const noteParts = [h.notes, extraNotes.trim()].filter(Boolean).join(' | ')
    const prompt = [
      `Analyze this hand:`,
      `Position=${h.position}`,
      `Street=${h.street}`,
      `Hole cards=${h.holeCards.join(' ')}`,
      `Board=${boardStr}`,
      resultStr ? `Result=${resultStr}` : null,
      noteParts ? `Notes: ${noteParts}` : null,
    ].filter(Boolean).join(', ')

    sendMessage(prompt, true)
  }, [loadedHand, extraNotes, loading, sendMessage])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const resultStr = loadedHand ? fmtResult(loadedHand.result) : null

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
            <div style={{ fontSize:'0.62rem', color:C.textMuted }}>Powered by Gemini · GTO-aware</div>
          </div>
        </div>
        <button onClick={() => { setMessages([]); setError(''); setLoadedHand(null); setExtraNotes('') }}
          style={{ width:'36px', height:'36px', borderRadius:'8px', border:'none', background:C.surfaceHi, color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14} />
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
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'10px', opacity:0.25 }}>
            <BrainCircuit size={44} color={C.secondary} />
            <div style={{ fontSize:'0.75rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:C.text, textAlign:'center' }}>Ask anything about your hand</div>
            <div style={{ fontSize:'0.7rem', color:C.textMuted, textAlign:'center', maxWidth:'220px', lineHeight:1.5 }}>Describe a spot or send from Hand History for structured analysis</div>
          </div>
        )}

        {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}

        {loading && (
          <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
            <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <BrainCircuit size={14} color="#071525" />
            </div>
            <div style={{ padding:'12px 16px', background:'rgba(22,27,34,0.9)', border:`1px solid rgba(146,204,255,0.08)`, borderRadius:'4px 16px 16px 16px', display:'flex', gap:'5px', alignItems:'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:'6px', height:'6px', borderRadius:'50%', background:C.secondary, animation:`pulse 1.2s ${i*0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin:'0 16px 8px', padding:'10px 14px', borderRadius:'8px', background:C.redDim, border:`1px solid ${C.redBorder}`, fontSize:'0.76rem', color:C.red, flexShrink:0 }}>
          {error}
        </div>
      )}

      {/* Free-text input — always available for follow-up chat */}
      <div style={{ padding:'12px 16px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:'8px', flexShrink:0 }}>
        {/* Villain selector — only when no preloaded hand (hand card has its own) */}
        {!loadedHand && (
          <div style={{ display:'flex', gap:'6px' }}>
            {['Unknown', 'Nit', 'TAG', 'LAG', 'Fish', 'Rec'].map(type => (
              <button key={type} onClick={() => setPlayerType(type)} style={{
                flex:1, padding:'5px 4px', borderRadius:'8px',
                border:`1px solid ${playerType===type ? C.secondary : C.border}`,
                background: playerType===type ? 'rgba(146,204,255,0.1)' : 'transparent',
                color: playerType===type ? C.secondary : C.textMuted,
                fontSize:'0.6rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s',
              }}>{type}</button>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={loadedHand ? 'Ask a follow-up question…' : 'Describe your hand… (Enter to send)'}
            rows={2}
            style={{ flex:1, padding:'10px 12px', background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:'10px', color:C.text, fontSize:'0.875rem', resize:'none', outline:'none', fontFamily:"'Inter',sans-serif", lineHeight:1.6, colorScheme:'dark' }}
          />
          <button
            onClick={() => sendMessage()}
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
