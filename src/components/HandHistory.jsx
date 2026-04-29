import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, BrainCircuit, Trash2, X, Link2, Pencil } from 'lucide-react'
import { useData } from '../context/DataContext'

const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', surfaceHigh:'#252D3A',
  border:'#21262D', borderHi:'#30363D',
  primary:'#54e98a', primaryDim:'rgba(84,233,138,0.1)', primaryBorder:'rgba(84,233,138,0.25)',
  secondary:'#92ccff', secondaryDim:'rgba(146,204,255,0.1)',
  text:'#E6EDF3', textMuted:'#7D8590', red:'#f47067',
}

const RANKS     = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const SUITS     = ['s','h','d','c']
const SL        = { s:'♠', h:'♥', d:'♦', c:'♣' }
const SC        = { s:'#111', h:'#cc2222', d:'#cc2222', c:'#111' }
const POSITIONS = ['UTG','U+1','U+2','MP','HJ','CO','BTN','SB','BB']

// ── Mini card ────────────────────────────────────────────────────────────────
function MiniCard({ card }) {
  const r = card.slice(0,-1), s = card.slice(-1)
  return (
    <div style={{ width:'24px', height:'32px', background:'#fff', borderRadius:'3px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.5)', flexShrink:0 }}>
      <span style={{ fontSize:'0.62rem', fontWeight:800, color:SC[s], lineHeight:1 }}>{r==='T'?'10':r}</span>
      <span style={{ fontSize:'0.55rem', color:SC[s], lineHeight:1 }}>{SL[s]}</span>
    </div>
  )
}

// ── Card picker — deselect-safe ───────────────────────────────────────────────
function CardPicker({ selected, used, onToggle, limit }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(13,1fr)', gap:'2px' }}>
      {SUITS.map(suit => RANKS.map(rank => {
        const key    = rank + suit
        const isSel  = selected.includes(key)
        const isUsed = used.includes(key) && !isSel
        const full   = !isSel && selected.length >= limit
        return (
          <button key={key} disabled={isUsed || full} onClick={() => onToggle(key)} style={{
            aspectRatio:'1/1.1',   // flatter than 3/4 — saves vertical space
            borderRadius:'2px', border:'none', padding:'0',
            background: isUsed ? 'rgba(255,255,255,0.04)' : '#fff',
            opacity: isUsed ? 0.13 : full ? 0.25 : 1,
            cursor: isUsed || full ? 'not-allowed' : 'pointer',
            outline: isSel ? `2px solid ${C.primary}` : 'none',
            outlineOffset:'1px',
            boxShadow: isSel ? `0 0 7px rgba(84,233,138,0.55)` : '0 1px 2px rgba(0,0,0,0.35)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:'0',
          }}>
            <span style={{ fontSize:'clamp(0.42rem,1.05vw,0.64rem)', fontWeight:800, color:isUsed?'#aaa':SC[suit], lineHeight:1.05, letterSpacing:'-0.02em' }}>
              {rank==='T'?'10':rank}
            </span>
            <span style={{ fontSize:'clamp(0.38rem,0.9vw,0.55rem)', color:isUsed?'#aaa':SC[suit], lineHeight:1 }}>
              {SL[suit]}
            </span>
          </button>
        )
      }))}
    </div>
  )
}

// ── Hand form — used for both Add and Edit ────────────────────────────────────
function HandForm({ initial, onSave, onCancel }) {
  const isEdit    = !!initial
  const initAbs   = initial?.result != null ? Math.abs(initial.result) : ''
  const initNeg   = initial?.result != null ? initial.result < 0 : false

  const [holeCards,  setHoleCards]  = useState(initial?.holeCards  || [])
  const [boardCards, setBoardCards] = useState(initial?.boardCards  || [])
  const [position,   setPosition]   = useState(initial?.position   || 'BTN')
  const [resultAbs,  setResultAbs]  = useState(initAbs !== '' ? String(initAbs) : '')
  const [isNegative, setIsNegative] = useState(initNeg)
  const [notes,      setNotes]      = useState(initial?.notes      || '')
  const [activeSlot, setActiveSlot] = useState('hole')

  const otherUsed = activeSlot === 'hole' ? boardCards : holeCards

  const toggleCard = (slot, key) => {
    if (slot === 'hole')
      setHoleCards(p => p.includes(key) ? p.filter(c=>c!==key) : p.length<2 ? [...p,key] : p)
    else
      setBoardCards(p => p.includes(key) ? p.filter(c=>c!==key) : p.length<5 ? [...p,key] : p)
  }

  const handleSave = () => {
    if (holeCards.length < 2) return
    const absVal = parseFloat(resultAbs) || 0
    onSave({
      ...(initial || {}),
      id:        initial?.id || Date.now(),
      date:      initial?.date || new Date().toISOString(),
      sessionId: initial?.sessionId || null,
      holeCards, boardCards, position,
      street:    initial?.street || 'Preflop',
      result:    isNegative ? -absVal : absVal,
      notes,
    })
  }

  const lbl = (txt) => (
    <div style={{ fontSize:'0.54rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>{txt}</div>
  )

  // shared input height
  const INPUT_H = '42px'
  const baseInput = {
    width:'100%', padding:'0 12px', height:INPUT_H,
    background:C.surfaceHigh, border:`1px solid ${C.border}`,
    borderRadius:'8px', color:C.text, fontSize:'0.85rem',
    outline:'none', colorScheme:'dark', boxSizing:'border-box',
    fontFamily:"'Inter',sans-serif",
  }

  const resultColor = isNegative ? C.red : (resultAbs ? C.primary : C.textMuted)
  const resultBorder = resultAbs
    ? `1px solid ${isNegative ? 'rgba(244,112,103,0.4)' : 'rgba(84,233,138,0.4)'}`
    : `1px solid ${C.border}`

  return (
    <div style={{ background:C.surface, border:`1px solid ${isEdit ? C.primaryBorder : C.border}`, borderRadius:'12px', padding:'14px', display:'flex', flexDirection:'column', gap:'12px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'0.9rem', fontWeight:600, color:C.text }}>{isEdit ? 'Edit Hand' : 'Add Hand'}</span>
        <button onClick={onCancel} style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', padding:'4px' }}><X size={16}/></button>
      </div>

      {/* Position — 9 buttons, single row, swipeable */}
      <div>
        {lbl('Position')}
        <div style={{ display:'flex', gap:'4px', overflowX:'auto', scrollbarWidth:'none', flexWrap:'nowrap', paddingBottom:'2px' }}>
          {POSITIONS.map(p => {
            const active = position === p
            return (
              <button key={p} onClick={() => setPosition(p)} style={{
                flexShrink:0,
                padding:'5px 8px', borderRadius:'16px', border:'none',
                minHeight:'34px',
                background: active ? C.primary : C.surfaceHigh,
                color: active ? '#061a0e' : C.textMuted,
                fontWeight: active ? 700 : 400,
                fontSize:'0.68rem', cursor:'pointer',
                whiteSpace:'nowrap',
                transition:'background 0.12s',
              }}>{p}</button>
            )
          })}
        </div>
      </div>

      {/* Card slot tabs */}
      <div style={{ display:'flex', gap:'8px' }}>
        {[
          { key:'hole',  label:'Hole Cards', cards:holeCards,  limit:2 },
          { key:'board', label:'Board (opt)', cards:boardCards, limit:5 },
        ].map(sl => (
          <div key={sl.key} onClick={() => setActiveSlot(sl.key)} style={{
            flex:1, padding:'8px 10px', borderRadius:'8px', cursor:'pointer',
            background: activeSlot===sl.key ? C.surfaceHigh : C.surfaceHi,
            border:`1px solid ${activeSlot===sl.key ? C.primaryBorder : C.border}`,
          }}>
            <div style={{ fontSize:'0.52rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:activeSlot===sl.key?C.primary:C.textMuted, marginBottom:'5px' }}>
              {sl.label} {sl.cards.length}/{sl.limit}
            </div>
            <div style={{ display:'flex', gap:'3px', flexWrap:'nowrap', overflowX:'auto', scrollbarWidth:'none', minHeight:'30px', alignItems:'center' }}>
              {sl.cards.length===0 && <span style={{ fontSize:'0.6rem', color:C.textMuted, opacity:0.35 }}>Tap to pick</span>}
              {sl.cards.map(c => <MiniCard key={c} card={c} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Card picker — compact, full width, flat */}
      <div style={{ background:C.surfaceHigh, borderRadius:'8px', padding:'8px 6px 6px' }}>
        <div style={{ fontSize:'0.5rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:C.textMuted, marginBottom:'6px', paddingLeft:'2px' }}>
          {activeSlot==='hole' ? 'Hole Cards' : 'Board'} — tap to pick · tap again to remove
        </div>
        <CardPicker
          selected={activeSlot==='hole' ? holeCards : boardCards}
          used={otherUsed}
          onToggle={key => toggleCard(activeSlot, key)}
          limit={activeSlot==='hole' ? 2 : 5}
        />
      </div>

      {/* Result — inline +/- toggle inside input */}
      <div>
        {lbl('Result ($)')}
        <div style={{
          display:'flex', alignItems:'center',
          background:C.surfaceHigh,
          border: resultBorder,
          borderRadius:'8px', height:INPUT_H, overflow:'hidden',
          transition:'border-color 0.15s',
        }}>
          {/* inline sign toggle */}
          <button
            onClick={() => setIsNegative(v => !v)}
            style={{
              width:'42px', height:'100%', border:'none', borderRight:`1px solid ${C.border}`,
              background: isNegative ? 'rgba(244,112,103,0.15)' : 'rgba(84,233,138,0.12)',
              color: isNegative ? C.red : C.primary,
              fontSize:'1.2rem', fontWeight:700, cursor:'pointer', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.15s, color 0.15s',
            }}
          >
            {isNegative ? '−' : '+'}
          </button>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            min="0"
            value={resultAbs}
            onChange={e => setResultAbs(e.target.value.replace(/[^0-9.]/g,''))}
            style={{
              flex:1, height:'100%', padding:'0 12px',
              background:'transparent', border:'none', outline:'none',
              color: resultColor,
              fontSize:'0.95rem', fontWeight:600,
              fontFamily:"'Inter',sans-serif",
              fontVariantNumeric:'tabular-nums',
              colorScheme:'dark',
            }}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        {lbl('Notes (optional)')}
        <textarea
          placeholder="Key decision, villain read..."
          value={notes}
          onChange={e=>setNotes(e.target.value)}
          rows={2}
          style={{ ...baseInput, height:'auto', padding:'10px 12px', resize:'none', lineHeight:1.5 }}
        />
      </div>

      {/* Actions — single row */}
      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={onCancel} style={{
          flex:1, height:'44px', borderRadius:'8px', border:'none',
          background:C.surfaceHigh, color:C.textMuted,
          fontWeight:500, fontSize:'0.8rem', cursor:'pointer',
        }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={holeCards.length<2} style={{
          flex:2, height:'44px', borderRadius:'8px', border:'none',
          background: holeCards.length<2 ? C.surfaceHigh : 'linear-gradient(135deg,#67f09a,#54e98a,#2db866)',
          color: holeCards.length<2 ? C.textMuted : '#061a0e',
          fontWeight:700, fontSize:'0.82rem',
          cursor: holeCards.length<2 ? 'not-allowed' : 'pointer',
          boxShadow: holeCards.length>=2 ? 'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.22)' : 'none',
        }}>
          {isEdit ? 'Save Changes' : 'Save Hand'}
        </button>
      </div>
    </div>
  )
}

// ── Link Session Popup ────────────────────────────────────────────────────────
function LinkPopup({ hand, sessions, onLink, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'16px' }}
      onClick={onClose}
    >
      <div style={{ background:C.surfaceHi, border:`1px solid ${C.borderHi}`, borderRadius:'12px', padding:'16px', width:'100%', maxWidth:'320px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <span style={{ fontSize:'0.88rem', fontWeight:600, color:C.text }}>Link to Session</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', padding:'2px' }}><X size={14}/></button>
        </div>

        {sessions.length === 0 ? (
          <div style={{ fontSize:'0.78rem', color:C.textMuted, textAlign:'center', padding:'20px 0', opacity:0.5 }}>
            No sessions yet — create one in Bankroll.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'260px', overflowY:'auto' }}>
            {hand.sessionId && (
              <button onClick={() => { onLink(hand.id, null); onClose() }} style={{
                padding:'10px 12px', borderRadius:'8px', border:'1px solid rgba(244,112,103,0.3)',
                background:'rgba(244,112,103,0.06)', color:C.red,
                fontSize:'0.75rem', fontWeight:600, cursor:'pointer', textAlign:'left', minHeight:'44px',
              }}>
                ✕ Remove from current session
              </button>
            )}
            {sessions.map(s => (
              <button key={s.id} onClick={() => { onLink(hand.id, s.id); onClose() }} style={{
                padding:'10px 12px', borderRadius:'8px',
                border:`1px solid ${hand.sessionId===s.id ? 'rgba(84,233,138,0.3)' : C.border}`,
                background: hand.sessionId===s.id ? C.primaryDim : C.surfaceHigh,
                color: hand.sessionId===s.id ? C.primary : C.text,
                fontSize:'0.78rem', cursor:'pointer', textAlign:'left', minHeight:'44px',
                display:'flex', flexDirection:'column', gap:'2px',
              }}>
                <span style={{ fontWeight:600 }}>{s.stakes} · {s.date}</span>
                <span style={{ fontSize:'0.65rem', color: (s.profit||0)>=0 ? C.primary : C.red }}>
                  {(s.profit||0)>=0?'+':''}${Math.abs(s.profit||0).toFixed(0)} · {s.location}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hand Card — click body to edit, action buttons stay separate ──────────────
function HandCard({ hand, sessions, onEdit, onDelete, onAnalyze, onLink }) {
  const [showLink, setShowLink] = useState(false)
  const navigate    = useNavigate()
  const isWin       = hand.result > 0
  const isLoss      = hand.result < 0
  const linkedSession = sessions.find(s => s.id === hand.sessionId)

  return (
    <>
      <div style={{
        background:C.surface, border:`1px solid ${C.border}`, borderRadius:'10px',
        position:'relative', overflow:'hidden',
        cursor:'pointer',
        transition:'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHi}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
      >
        {/* Left accent */}
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'2px', background: isWin ? C.primary : isLoss ? C.red : C.border, borderRadius:'2px 0 0 2px' }} />

        {/* Clickable body — opens edit form */}
        <div
          onClick={() => onEdit(hand)}
          style={{ padding:'10px 12px 6px 14px' }}
        >
          {/* Row 1: position + cards + street + result */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'nowrap', overflow:'hidden' }}>
            <span style={{ padding:'3px 7px', borderRadius:'12px', fontSize:'0.6rem', fontWeight:700, background:C.primaryDim, color:C.primary, flexShrink:0, letterSpacing:'0.04em' }}>
              {hand.position}
            </span>

            <div style={{ display:'flex', gap:'3px', flexShrink:0 }}>
              {hand.holeCards.map(c => <MiniCard key={c} card={c} />)}
            </div>

            {hand.boardCards?.length > 0 && (
              <>
                <span style={{ fontSize:'0.58rem', color:C.textMuted, flexShrink:0 }}>|</span>
                <div style={{ display:'flex', gap:'2px', flexShrink:0 }}>
                  {hand.boardCards.slice(0,3).map(c => <MiniCard key={c} card={c} />)}
                  {hand.boardCards.length > 3 && <span style={{ fontSize:'0.58rem', color:C.textMuted, alignSelf:'center' }}>+{hand.boardCards.length-3}</span>}
                </div>
              </>
            )}

            <span style={{ fontSize:'0.6rem', color:C.textMuted, flexShrink:0 }}>{hand.street}</span>

            {hand.result !== 0 && (
              <span style={{ fontSize:'0.85rem', fontWeight:700, letterSpacing:'-0.02em', color:isWin?C.primary:C.red, fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                {isWin?'+':''}{hand.result<0?'-':''}${Math.abs(hand.result)}
              </span>
            )}

            {/* Edit hint icon */}
            <div style={{ marginLeft:'auto', flexShrink:0, opacity:0.2, display:'flex', alignItems:'center' }}>
              <Pencil size={10} color={C.textMuted}/>
            </div>
          </div>

          {/* Row 2: session label */}
          <div style={{ marginTop:'5px' }}>
            {linkedSession ? (
              <span
                onClick={e => { e.stopPropagation(); navigate('/bankroll') }}
                style={{ fontSize:'0.52rem', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:C.primary, cursor:'pointer' }}
              >
                ● Session: {linkedSession.date?.slice(0,10)} · {linkedSession.stakes}
              </span>
            ) : (
              <span style={{ fontSize:'0.52rem', fontWeight:500, letterSpacing:'0.05em', textTransform:'uppercase', color:C.textMuted, opacity:0.45 }}>
                ● Unassigned
              </span>
            )}
          </div>
        </div>

        {/* Action row — stopPropagation so clicks don't trigger edit */}
        <div style={{ display:'flex', gap:'6px', padding:'6px 12px 10px 14px', borderTop:`1px solid ${C.border}` }}>
          <button onClick={e => { e.stopPropagation(); onAnalyze(hand) }} style={{
            display:'flex', alignItems:'center', gap:'3px', padding:'5px 10px',
            borderRadius:'6px', border:'none', background:C.secondaryDim,
            color:C.secondary, fontSize:'0.6rem', fontWeight:600, cursor:'pointer', minHeight:'32px',
          }}>
            <BrainCircuit size={10}/> Analyze
          </button>

          <button onClick={e => { e.stopPropagation(); setShowLink(true) }} style={{
            display:'flex', alignItems:'center', gap:'3px', padding:'5px 10px',
            borderRadius:'6px', border:'none', background:'rgba(255,192,172,0.1)',
            color:'#ffc0ac', fontSize:'0.6rem', fontWeight:600, cursor:'pointer', minHeight:'32px',
          }}>
            <Link2 size={10}/> Link
          </button>

          <div style={{ flex:1 }} />

          <button onClick={e => { e.stopPropagation(); onDelete(hand.id) }} style={{
            background:'none', border:'none', color:C.textMuted, opacity:0.35,
            cursor:'pointer', padding:'4px', display:'flex', alignItems:'center', minHeight:'32px',
            transition:'opacity 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity='0.35'}
          >
            <Trash2 size={12}/>
          </button>
        </div>
      </div>

      {showLink && (
        <LinkPopup hand={hand} sessions={sessions} onLink={onLink} onClose={() => setShowLink(false)} />
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HandHistory({ onAnalyze }) {
  const { hands, sessions, addHand, updateHand, deleteHand, linkHandToSession } = useData()
  const [formMode, setFormMode] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Auto-open edit form if navigated from Bankroll with state
  useEffect(() => {
    if (location.state?.editHand) setFormMode(location.state.editHand)
  }, [])

  const openAdd   = ()     => setFormMode('add')
  const openEdit  = (hand) => setFormMode(hand)
  const closeForm = ()     => setFormMode(null)

  const handleSave = async (hand) => {
    if (formMode === 'add') {
      await addHand(hand)
    } else {
      await updateHand(hand.id, hand)
    }
    closeForm()
  }

  const handleAnalyze = (hand) => { onAnalyze(hand); navigate('/coach') }

  const handleLink = async (handId, sessionId) => {
    await linkHandToSession(handId, sessionId)
  }

  const totalResult = hands.reduce((s, h) => s + (h.result||0), 0)
  const wins        = hands.filter(h => h.result > 0).length
  const winRate     = hands.length ? ((wins/hands.length)*100).toFixed(0) : 0

  const isEditing  = formMode && formMode !== 'add'
  const isAdding   = formMode === 'add'
  const editHand   = isEditing ? formMode : null

  return (
    <div style={{ padding:'16px', paddingBottom:'120px', maxWidth:'720px', margin:'0 auto', paddingTop:'20px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
        <div>
          <h1 style={{ fontSize:'1.3rem', fontWeight:700, color:C.text, letterSpacing:'-0.02em', marginBottom:'3px' }}>Hand History</h1>
          <p style={{ fontSize:'0.72rem', color:C.textMuted }}>{hands.length} hands · tap any hand to edit</p>
        </div>
        {!formMode && (
          <button onClick={openAdd} style={{
            display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px',
            borderRadius:'8px', border:'none', minHeight:'44px',
            background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)',
            color:'#061a0e', fontWeight:700, fontSize:'0.75rem', cursor:'pointer',
            boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.25)',
          }}>
            <Plus size={14}/> Add Hand
          </button>
        )}
      </div>

      {/* Summary grid */}
      {hands.length > 0 && !formMode && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'16px' }}>
          {[
            { label:'Total Result', value:`${totalResult>=0?'+':''}$${Math.abs(totalResult).toFixed(0)}`, color:totalResult>=0?C.primary:C.red },
            { label:'Win Rate',     value:`${winRate}%`,   color:C.secondary },
            { label:'Hands Played', value:hands.length,    color:C.text },
            { label:'Winning',      value:wins,            color:C.primary },
          ].map(s => (
            <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'12px 14px' }}>
              <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'6px' }}>{s.label}</div>
              <div style={{ fontSize:'1.35rem', fontWeight:700, letterSpacing:'-0.02em', color:s.color, fontVariantNumeric:'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {formMode && (
        <div style={{ marginBottom:'16px' }}>
          <HandForm
            initial={editHand || undefined}
            onSave={handleSave}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Hand list */}
      {!formMode && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {hands.length === 0 && (
            <div style={{ padding:'60px 20px', textAlign:'center', color:C.textMuted, opacity:0.4, fontSize:'0.82rem' }}>
              No hands yet. Tap "Add Hand" to log your first.
            </div>
          )}
          {hands.map(hand => (
            <HandCard
              key={hand.id}
              hand={hand}
              sessions={sessions}
              onEdit={openEdit}
              onDelete={async id => await deleteHand(id)}
              onAnalyze={handleAnalyze}
              onLink={handleLink}
            />
          ))}
        </div>
      )}
    </div>
  )
}
