import React, { useState, useRef, useEffect } from 'react'
import { BrainCircuit, Send, RefreshCw, Zap } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const C = {
  bg:          '#0B0E14',
  surface:     '#161B22',
  surfaceHi:   '#1E2530',
  surfaceHigh: '#252D3A',
  border:      '#21262D',
  borderHi:    '#30363D',
  primary:     '#54e98a',
  primaryDim:  'rgba(84,233,138,0.1)',
  secondary:   '#92ccff',
  secondaryDim:'rgba(146,204,255,0.1)',
  tertiary:    '#ffc0ac',
  text:        '#E6EDF3',
  textMuted:   '#7D8590',
  red:         '#f47067',
}

const POSITIONS = ['UTG','UTG+1','MP','HJ','CO','BTN','SB','BB']
const STREETS   = ['Preflop','Flop','Turn','River']
const PRESETS = [
  { label: 'UTG Open',    prompt: 'I have A♠K♥ UTG in a 9-handed $1/$2 NL. Stack 100bb. Raise or limp?' },
  { label: 'Facing 3-bet',prompt: 'Opened KK UTG, 3-bet by BTN to 9bb, blinds fold. 100bb deep. Optimal play?' },
  { label: 'Bluff spot',  prompt: 'I have 8♠7♠ on BTN vs CO. Flop A♠5♠2♥. Villain cbets 1/3 pot. What do I do?' },
  { label: 'River bet',   prompt: 'Board: A♥K♦5♣2♠J♦. I have Q♥T♠ (nut straight). Villain bet 2/3 pot. Raise or call?' },
  { label: 'ICM bubble',  prompt: 'Tournament bubble, 15bb BTN, A♦J♠. Big stack in BB. Shove or fold?' },
]

const SL = { s:'♠', h:'♥', d:'♦', c:'♣' }
const SC = { s:'#1a1a1a', h:'#cc2222', d:'#cc2222', c:'#1a1a1a' }

function MiniCard({ card }) {
  const r = card.slice(0,-1), s = card.slice(-1)
  return (
    <div style={{
      width:'26px', height:'34px', background:'#fff', borderRadius:'3px',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      boxShadow:'0 1px 4px rgba(0,0,0,0.5)', flexShrink:0,
    }}>
      <span style={{ fontSize:'0.68rem', fontWeight:800, color:SC[s], lineHeight:1 }}>
        {r === 'T' ? '10' : r}
      </span>
      <span style={{ fontSize:'0.62rem', color:SC[s], lineHeight:1 }}>{SL[s]}</span>
    </div>
  )
}

function GlowStat({ label, value, color, glow }) {
  return (
    <div style={{
      flex:1, padding:'14px 16px', borderRadius:'10px',
      background:C.surface, border:`1px solid ${C.border}`,
      position:'relative', overflow:'hidden',
      boxShadow: glow ? `0 0 20px ${color}22, 0 0 1px ${color}44` : 'none',
    }}>
      <div style={{ position:'absolute', top:0, left:'10%', right:'10%', height:'1px', background:`linear-gradient(90deg, transparent, ${color}88, transparent)` }} />
      <div style={{ fontSize:'0.58rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'8px' }}>
        {label}
      </div>
      <div style={{ fontSize:'1.8rem', fontWeight:700, letterSpacing:'-0.03em', color, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

const RANKS13 = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
function RangeMatrix() {
  return (
    <div>
      <div style={{ fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'8px' }}>
        Range Matrix
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(13, 1fr)', gap:'2px' }}>
        {RANKS13.map((r1, i) => RANKS13.map((r2, j) => {
          const label   = i < j ? `${r1}${r2}s` : i > j ? `${r2}${r1}o` : `${r1}${r1}`
          const isPair  = i === j
          const isSuited= i < j
          const isStrong= isPair || (i <= 3 && j <= 3)
          return (
            <div key={label} style={{
              aspectRatio:'1', borderRadius:'2px',
              background: isStrong ? 'rgba(84,233,138,0.15)' : isSuited ? 'rgba(146,204,255,0.06)' : C.surfaceHi,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'clamp(0.32rem, 0.8vw, 0.52rem)', fontWeight:500,
              color: isStrong ? C.primary : isSuited ? C.secondary : C.textMuted,
              letterSpacing:'-0.02em', opacity:0.9,
              border: isPair ? `1px solid rgba(84,233,138,0.2)` : 'none',
            }}>
              {label}
            </div>
          )
        }))}
      </div>
    </div>
  )
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display:'flex', flexDirection:isUser?'row-reverse':'row', gap:'8px', alignItems:'flex-start', marginBottom:'14px' }}>
      {!isUser && (
        <div style={{
          width:'26px', height:'26px', minWidth:'26px', borderRadius:'6px',
          background:'linear-gradient(135deg, #aadaff, #92ccff, #5aabf5)',
          display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px',
          boxShadow:'0 0 12px rgba(146,204,255,0.3)',
        }}>
          <BrainCircuit size={13} color="#071525" />
        </div>
      )}
      <div style={{
        maxWidth:'80%', padding:'11px 14px',
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        background: isUser ? C.surfaceHigh : 'rgba(30,37,48,0.7)',
        backdropFilter: isUser ? 'none' : 'blur(16px)',
        border: isUser ? 'none' : `1px solid rgba(146,204,255,0.1)`,
        fontSize:'0.84rem', lineHeight:1.7, color:C.text, whiteSpace:'pre-wrap',
        position:'relative', overflow:'hidden',
      }}>
        {!isUser && <div style={{ position:'absolute', top:0, left:'20%', right:'20%', height:'1px', background:'linear-gradient(90deg, transparent, rgba(146,204,255,0.3), transparent)' }} />}
        {msg.content}
      </div>
    </div>
  )
}

function buildSystem(ctx, hand) {
  const handInfo = hand
    ? `Analyzing hand: Position=${hand.position}, Street=${hand.street}, Hole cards=${hand.holeCards.join(' ')}, Board=${hand.boardCards.join(' ')||'none'}, Result=${hand.result}BB. Notes: ${hand.notes||'none'}.`
    : `Context: Position=${ctx.position}, Street=${ctx.street}, Stack=${ctx.stack}bb, Pot=${ctx.pot}bb.`
  return `You are a professional Texas Hold'em poker coach specializing in GTO strategy and exploitative play.
${handInfo}
Format: 1) Recommended action, 2) Key reasoning (2-3 points), 3) Alternative lines, 4) One concept to study.
Be concise (under 250 words), direct, and data-driven.`
}

export default function AICoach({ preloadedHand, onHandConsumed }) {
  const [messages,  setMessages]  = useLocalStorage('aicoach-messages', [])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [ctx,       setCtx]       = useLocalStorage('aicoach-ctx', { position:'BTN', street:'Preflop', stack:'100', pot:'3' })
  const [loadedHand,setLoadedHand]= useState(null)
  const [error,     setError]     = useState('')
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, loading])

  useEffect(() => {
    if (preloadedHand) {
      setLoadedHand(preloadedHand)
      setCtx(prev => ({ ...prev, position:preloadedHand.position, street:preloadedHand.street }))
      onHandConsumed?.()
      const prompt = `Please analyze this hand: I was in ${preloadedHand.position} on the ${preloadedHand.street}. My hole cards: ${preloadedHand.holeCards.join(' ')}. Board: ${preloadedHand.boardCards.join(' ')||'preflop'}. Result: ${preloadedHand.result}BB. ${preloadedHand.notes ? 'Notes: '+preloadedHand.notes : ''}`
      sendMessage(prompt)
    }
  }, [preloadedHand])

  const sendMessage = async (text) => {
    const content = text || input.trim()
    if (!content || loading) return
    setError('')
    const userMsg = { role:'user', content }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const history = [...messages, userMsg].slice(-10)
      const res = await fetch('/api/coach', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          system: buildSystem(ctx, loadedHand),
          messages: history.map(m => ({ role:m.role, content:m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      const reply = data.reply || 'No response.'
      setMessages(prev => [...prev, { role:'assistant', content:reply }])
    } catch (err) {
      setError(err.message)
      setMessages(prev => [...prev, { role:'assistant', content:`Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const inputBase = {
    padding:'10px 12px', background:C.surfaceHigh, border:`1px solid ${C.border}`,
    borderRadius:'8px', color:C.text, fontSize:'0.82rem', outline:'none',
    fontFamily:"'Inter',sans-serif", width:'100%', minHeight:'44px', colorScheme:'dark',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.bg, overflow:'hidden', fontFamily:"'Inter',sans-serif" }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'16px 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <div>
            <h1 style={{ fontSize:'1.1rem', fontWeight:700, color:C.text, letterSpacing:'-0.01em', marginBottom:'2px' }}>AI Coach</h1>
            <p style={{ fontSize:'0.72rem', color:C.textMuted }}>GTO-aware · Powered by Gemini</p>
          </div>
          <button onClick={() => { setMessages([]); setError('') }} style={{
            padding:'7px 10px', borderRadius:'8px', border:'none',
            background:C.surfaceHi, color:C.textMuted, cursor:'pointer', minHeight:'44px',
            display:'flex', alignItems:'center',
          }}>
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Loaded hand preview */}
        {loadedHand && (
          <div style={{
            padding:'10px 14px', borderRadius:'8px', marginBottom:'10px',
            background:C.primaryDim, border:`1px solid rgba(84,233,138,0.2)`,
            display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
          }}>
            <div style={{ display:'flex', gap:'4px' }}>
              {loadedHand.holeCards.map(c => <MiniCard key={c} card={c} />)}
            </div>
            <div style={{ fontSize:'0.72rem', color:C.primary }}>
              {loadedHand.position} · {loadedHand.street}
              {loadedHand.result !== 0 && (
                <span style={{ marginLeft:'8px', color:loadedHand.result>0?C.primary:C.red }}>
                  {loadedHand.result>0?'+':''}{loadedHand.result}BB
                </span>
              )}
            </div>
            <button onClick={() => setLoadedHand(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.7rem' }}>
              Clear
            </button>
          </div>
        )}

        {/* Context form */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
          {[
            { label:'Position', key:'position', opts:POSITIONS },
            { label:'Street',   key:'street',   opts:STREETS },
          ].map(({ label, key, opts }) => (
            <div key={key}>
              <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>{label}</div>
              <select value={ctx[key]} onChange={e => setCtx(p => ({ ...p, [key]:e.target.value }))}
                style={{ ...inputBase, appearance:'none', cursor:'pointer', padding:'8px 10px' }}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {[
            { label:'Stack (bb)', key:'stack' },
            { label:'Pot (bb)',   key:'pot' },
          ].map(({ label, key }) => (
            <div key={key}>
              <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>{label}</div>
              <input value={ctx[key]} onChange={e => setCtx(p => ({ ...p, [key]:e.target.value }))}
                style={{ ...inputBase, padding:'8px 10px' }} />
            </div>
          ))}
        </div>

        {/* Glow stats */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'10px' }}>
          <GlowStat label="Stack" value={`${ctx.stack}bb`} color={C.primary} glow />
          <GlowStat label="Pot"   value={`${ctx.pot}bb`}   color={C.secondary} />
          <GlowStat label="SPR"   value={(parseFloat(ctx.stack||1)/parseFloat(ctx.pot||1)).toFixed(1)} color={C.tertiary} />
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'4px' }}>
          {[['chat','Chat'],['range','Range Matrix'],['presets','Presets']].map(([k,l]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding:'6px 14px', borderRadius:'6px', border:'none',
              background: activeTab===k ? C.secondaryDim : 'transparent',
              color: activeTab===k ? C.secondary : C.textMuted,
              fontWeight: activeTab===k ? 600 : 400, fontSize:'0.72rem',
              cursor:'pointer', minHeight:'36px',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'range' ? (
        <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
          <RangeMatrix />
        </div>
      ) : activeTab === 'presets' ? (
        <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setActiveTab('chat'); sendMessage(p.prompt) }} style={{
                padding:'14px 16px', borderRadius:'10px', border:`1px solid ${C.border}`,
                background:C.surface, color:C.text, textAlign:'left', cursor:'pointer',
                fontSize:'0.82rem', lineHeight:1.5, minHeight:'44px',
                display:'flex', alignItems:'center', gap:'10px', transition:'background 0.15s, border-color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background=C.surfaceHi; e.currentTarget.style.borderColor=C.borderHi }}
                onMouseLeave={e => { e.currentTarget.style.background=C.surface; e.currentTarget.style.borderColor=C.border }}
              >
                <Zap size={14} color={C.secondary} style={{ flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:'0.72rem', fontWeight:600, color:C.secondary, marginBottom:'3px', letterSpacing:'0.04em' }}>{p.label}</div>
                  <div style={{ color:C.textMuted, fontSize:'0.78rem' }}>{p.prompt}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex:1, overflow:'auto', padding:'16px 20px', display:'flex', flexDirection:'column' }}>
            {messages.length === 0 && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', opacity:0.3 }}>
                <BrainCircuit size={40} color={C.secondary} />
                <div style={{ fontSize:'0.72rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.text }}>
                  Describe your hand or use Presets
                </div>
              </div>
            )}
            {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', marginBottom:'14px' }}>
                <div style={{ width:'26px', height:'26px', minWidth:'26px', borderRadius:'6px', background:'linear-gradient(135deg, #aadaff, #92ccff, #5aabf5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <BrainCircuit size={13} color="#071525" />
                </div>
                <div style={{ padding:'12px 14px', background:'rgba(30,37,48,0.7)', backdropFilter:'blur(16px)', border:`1px solid rgba(146,204,255,0.1)`, borderRadius:'4px 12px 12px 12px', display:'flex', gap:'4px', alignItems:'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:'5px', height:'5px', borderRadius:'50%', background:C.secondary, animation:`pulse 1.2s ${i*0.2}s infinite`, opacity:0.7 }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div style={{ margin:'0 16px 8px', padding:'10px 14px', borderRadius:'8px', background:'rgba(244,112,103,0.1)', border:`1px solid rgba(244,112,103,0.2)`, fontSize:'0.76rem', color:C.red }}>
              {error}
            </div>
          )}

          <div style={{ padding:'12px 16px', background:C.surface, borderTop:`1px solid ${C.border}`, display:'flex', gap:'8px', alignItems:'flex-end', flexShrink:0 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Describe your hand... (Enter to send)"
              rows={2}
              style={{ flex:1, padding:'10px 12px', background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:'8px', color:C.text, fontSize:'0.84rem', resize:'none', outline:'none', fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              style={{
                width:'44px', height:'44px', borderRadius:'8px', border:'none', flexShrink:0,
                background: input.trim() ? 'linear-gradient(135deg,#67f09a,#54e98a,#2db866)' : C.surfaceHigh,
                color: input.trim() ? '#061a0e' : C.textMuted,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: input.trim() ? 'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.25)' : 'none',
                transition:'all 0.15s',
              }}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  )
}
