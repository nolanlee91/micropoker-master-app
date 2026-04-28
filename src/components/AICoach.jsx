import React, { useState, useRef, useEffect, useCallback } from 'react'
import { BrainCircuit, Send, RefreshCw, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

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
  const [expanded, setExpanded] = useState(false)
  const isCorrect = analysis.mistakeType === 'correct'
  const conf = analysis.confidence || 'medium'
  const confColor = { high:C.primary, medium:'#FAD261', low:C.red }[conf]

  const streets = [
    { label:'Preflop', value:analysis.preflop },
    { label:'Flop',    value:analysis.flop },
    { label:'Turn',    value:analysis.turn },
    { label:'River',   value:analysis.river },
  ].filter(s => s.value && s.value !== 'Not applicable')

  return (
    <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
      <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px', flexShrink:0 }}>
        <BrainCircuit size={14} color="#071525" />
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>

        {/* Summary */}
        <div style={{ padding:'10px 14px', borderRadius:'10px', background:'rgba(22,27,34,0.9)', border:`1px solid rgba(146,204,255,0.08)`, fontSize:'0.85rem', color:C.text, lineHeight:1.6 }}>
          {analysis.summary}
        </div>

        {/* Biggest Mistake */}
        <div style={{ padding:'12px 14px', borderRadius:'10px', background:isCorrect?C.primaryDim:C.redDim, border:`1px solid ${isCorrect?C.primaryBorder:C.redBorder}`, position:'relative', overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
            {isCorrect
              ? <CheckCircle size={14} color={C.primary} />
              : <AlertCircle size={14} color={C.red} />
            }
            <span style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:isCorrect?C.primary:C.red }}>
              {isCorrect ? 'Correct Play' : MISTAKE_LABELS[analysis.mistakeType] || 'Biggest Mistake'}
            </span>
            <span style={{ marginLeft:'auto', fontSize:'0.58rem', fontWeight:600, color:confColor, background:`rgba(${conf==='high'?'84,233,138':conf==='medium'?'250,210,97':'244,112,103'},0.1)`, padding:'2px 7px', borderRadius:'10px' }}>
              {conf} confidence
            </span>
          </div>
          <div style={{ fontSize:'0.875rem', color:C.text, lineHeight:1.6, fontWeight:500 }}>
            {analysis.biggestMistake}
          </div>
        </div>

        {/* Better Line */}
        {analysis.betterLine && analysis.betterLine !== 'Continue as played' && (
          <div style={{ padding:'10px 14px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}` }}>
            <div style={{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:C.primary, marginBottom:'4px' }}>Better Line</div>
            <div style={{ fontSize:'0.85rem', color:C.text, lineHeight:1.6 }}>{analysis.betterLine}</div>
          </div>
        )}

        {/* Street breakdown — collapsible */}
        {streets.length > 0 && (
          <div>
            <button onClick={() => setExpanded(v => !v)} style={{ display:'flex', alignItems:'center', gap:'5px', background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.72rem', fontWeight:600, padding:'4px 0' }}>
              {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
              {expanded ? 'Hide' : 'Show'} street-by-street
            </button>
            {expanded && (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginTop:'6px' }}>
                {streets.map(s => (
                  <div key={s.label} style={{ display:'flex', gap:'10px', padding:'8px 12px', background:C.surfaceHigh, borderRadius:'8px', border:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:C.secondary, minWidth:'44px', flexShrink:0, marginTop:'2px' }}>{s.label}</span>
                    <span style={{ fontSize:'0.82rem', color:C.text, lineHeight:1.6 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
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
        {msg.content}
      </div>
    </div>
  )
}

export default function AICoach({ preloadedHand, onHandConsumed }) {
  const [messages,   setMessages]  = useLocalStorage('aicoach-messages', [])
  const [input,      setInput]     = useState('')
  const [loading,    setLoading]   = useState(false)
  const [loadedHand, setLoadedHand]= useState(null)
  const [error,      setError]     = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (preloadedHand) {
      setLoadedHand(preloadedHand)
      onHandConsumed?.()
      const prompt = `Analyze this hand: Position=${preloadedHand.position}, Street=${preloadedHand.street}, Hole cards=${preloadedHand.holeCards.join(' ')}, Board=${preloadedHand.boardCards?.join(' ')||'none'}, Result=${preloadedHand.result}BB.${preloadedHand.notes?' Notes: '+preloadedHand.notes:''}`
      sendMessage(prompt, true)
    }
  }, [preloadedHand])

  const sendMessage = useCallback(async (text, isHandAnalysis = false) => {
    const content = (text || input).trim()
    if (!content || loading) return
    setError('')

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
          messages: newMessages.slice(-12).map(m => ({ role:m.role, content:m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      if (data.type === 'analysis' && data.analysis) {
        setMessages(prev => [...prev, { role:'assistant', type:'analysis', content:'', analysis:data.analysis }])
      } else {
        setMessages(prev => [...prev, { role:'assistant', type:'reply', content: data.reply || 'No response.' }])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

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
        <button onClick={() => { setMessages([]); setError(''); setLoadedHand(null) }}
          style={{ width:'36px', height:'36px', borderRadius:'8px', border:'none', background:C.surfaceHi, color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Loaded hand pill */}
      {loadedHand && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', borderRadius:'10px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', flexShrink:0 }}>
          <div style={{ display:'flex', gap:'4px' }}>
            {loadedHand.holeCards.map(c => <MiniCard key={c} card={c} />)}
          </div>
          <div style={{ fontSize:'0.72rem', color:C.primary, flex:1 }}>
            {loadedHand.position} · {loadedHand.street}
            {loadedHand.result !== 0 && (
              <span style={{ marginLeft:'8px', color:loadedHand.result>0?C.primary:C.red }}>
                {loadedHand.result>0?'+':''}{loadedHand.result}BB
              </span>
            )}
          </div>
          <button onClick={() => setLoadedHand(null)} style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.7rem', padding:'2px 6px' }}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column' }}>
        {messages.length === 0 && (
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

      {/* Input */}
      <div style={{ padding:'12px 16px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', gap:'8px', alignItems:'flex-end', flexShrink:0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe your hand... (Enter to send)"
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

      <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.5);opacity:0.3} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  )
}
