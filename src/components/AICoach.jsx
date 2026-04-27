import React, { useState, useRef, useEffect } from 'react'
import { BrainCircuit, Send, RefreshCw } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const C = {
  bg:          '#0B0E14',
  surface:     '#161B22',
  surfaceHi:   '#1E2530',
  surfaceHigh: '#252D3A',
  border:      '#21262D',
  primary:     '#54e98a',
  primaryDim:  'rgba(84,233,138,0.1)',
  secondary:   '#92ccff',
  text:        '#E6EDF3',
  textMuted:   '#7D8590',
  red:         '#f47067',
}

const SL = { s:'♠', h:'♥', d:'♦', c:'♣' }
const SC = { s:'#1a1a1a', h:'#cc2222', d:'#cc2222', c:'#1a1a1a' }

function MiniCard({ card }) {
  const r = card.slice(0,-1), s = card.slice(-1)
  return (
    <div style={{ width:'24px', height:'32px', background:'#fff', borderRadius:'3px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', flexShrink:0 }}>
      <span style={{ fontSize:'0.65rem', fontWeight:800, color:SC[s], lineHeight:1 }}>{r==='T'?'10':r}</span>
      <span style={{ fontSize:'0.6rem', color:SC[s], lineHeight:1 }}>{SL[s]}</span>
    </div>
  )
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display:'flex', flexDirection:isUser?'row-reverse':'row', gap:'8px', alignItems:'flex-start', marginBottom:'12px' }}>
      {!isUser && (
        <div style={{ width:'28px', height:'28px', minWidth:'28px', borderRadius:'8px', background:'linear-gradient(135deg,#aadaff,#92ccff,#5aabf5)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px', boxShadow:'0 0 12px rgba(146,204,255,0.25)', flexShrink:0 }}>
          <BrainCircuit size={14} color="#071525" />
        </div>
      )}
      <div style={{
        maxWidth:'85%', padding:'12px 16px',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        background: isUser ? C.surfaceHigh : 'rgba(22,27,34,0.9)',
        border: `1px solid ${isUser ? 'transparent' : 'rgba(146,204,255,0.08)'}`,
        fontSize:'0.875rem', lineHeight:1.75, color:C.text, whiteSpace:'pre-wrap',
        wordBreak:'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function buildSystem(hand) {
  if (hand) {
    return `You are a professional Texas Hold'em poker coach specializing in GTO strategy and exploitative play.
You are analyzing this specific hand: Position=${hand.position}, Street=${hand.street}, Hole cards=${hand.holeCards.join(' ')}, Board=${hand.boardCards?.join(' ')||'none'}, Result=${hand.result}BB. Notes: ${hand.notes||'none'}.
Format responses: 1) Recommended action, 2) Key reasoning (2-3 points), 3) Alternative lines, 4) One concept to study.
Be concise (under 250 words), direct, and data-driven.`
  }
  return `You are a professional Texas Hold'em poker coach specializing in GTO strategy and exploitative play for live cash games.
Answer questions about hand analysis, strategy, ranges, bet sizing, and game theory.
Be concise, direct, and practical. Under 250 words per response.`
}

export default function AICoach({ preloadedHand, onHandConsumed }) {
  const [messages,   setMessages]  = useLocalStorage('aicoach-messages', [])
  const [input,      setInput]     = useState('')
  const [loading,    setLoading]   = useState(false)
  const [loadedHand, setLoadedHand]= useState(null)
  const [error,      setError]     = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (preloadedHand) {
      setLoadedHand(preloadedHand)
      onHandConsumed?.()
      const prompt = `Please analyze this hand: I was in ${preloadedHand.position} on the ${preloadedHand.street}. Hole cards: ${preloadedHand.holeCards.join(' ')}. Board: ${preloadedHand.boardCards?.join(' ')||'preflop'}. Result: ${preloadedHand.result}BB.${preloadedHand.notes ? ' Notes: '+preloadedHand.notes : ''}`
      sendMessage(prompt)
    }
  }, [preloadedHand])

  const sendMessage = async (text) => {
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
          system: buildSystem(loadedHand),
          messages: newMessages.slice(-12).map(m => ({ role:m.role, content:m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setMessages(prev => [...prev, { role:'assistant', content: data.reply || 'No response.' }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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
            <div style={{ fontSize:'0.62rem', color:C.textMuted, letterSpacing:'0.04em' }}>Powered by Gemini · GTO-aware</div>
          </div>
        </div>
        <button onClick={() => { setMessages([]); setError(''); setLoadedHand(null) }}
          style={{ width:'36px', height:'36px', borderRadius:'8px', border:'none', background:C.surfaceHi, color:C.textMuted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
          title="Clear chat"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Loaded hand pill */}
      {loadedHand && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', borderRadius:'10px', background:C.primaryDim, border:`1px solid rgba(84,233,138,0.2)`, display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', flexShrink:0 }}>
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
            <div style={{ fontSize:'0.75rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:C.text, textAlign:'center' }}>
              Ask anything about your hand
            </div>
            <div style={{ fontSize:'0.7rem', color:C.textMuted, textAlign:'center', maxWidth:'220px', lineHeight:1.5 }}>
              Describe a spot, paste a hand, or send from Hand History
            </div>
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
        <div style={{ margin:'0 16px 8px', padding:'10px 14px', borderRadius:'8px', background:'rgba(244,112,103,0.08)', border:`1px solid rgba(244,112,103,0.2)`, fontSize:'0.76rem', color:C.red, flexShrink:0 }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'12px 16px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', gap:'8px', alignItems:'flex-end', flexShrink:0 }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe your hand... (Enter to send, Shift+Enter for new line)"
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
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.15s',
            boxShadow: input.trim() && !loading ? '0 0 16px rgba(84,233,138,0.25)' : 'none',
          }}
        >
          <Send size={16} />
        </button>
      </div>

      <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.5);opacity:0.3} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  )
}
