import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, Wallet, Trash2, Link, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'
import { useData } from '../context/DataContext'

const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', surfaceHigh:'#252D3A',
  border:'#21262D', borderHi:'#30363D',
  primary:'#54e98a', primaryDim:'rgba(84,233,138,0.1)', primaryBorder:'rgba(84,233,138,0.25)',
  secondary:'#92ccff', secondaryDim:'rgba(146,204,255,0.1)',
  tertiary:'#ffc0ac',
  text:'#E6EDF3', textMuted:'#7D8590', red:'#f47067',
}

const STAKES_LIST = ['$1/$1','$1/$2','$1/$3','$2/$5','$5/$10']

const lbl = (txt) => (
  <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'6px' }}>{txt}</div>
)

// ── Profit Chart ──────────────────────────────────────────────────────────────
function ProfitChart({ sessions }) {
  if (sessions.length < 2) return null

  const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date))
  const cumulative = []
  let running = 0
  sorted.forEach(s => {
    running += s.profit || 0
    cumulative.push(running)
  })

  const min = Math.min(0, ...cumulative)
  const max = Math.max(0, ...cumulative)
  const range = max - min || 1
  const W = 600, H = 120, PAD = 12

  const points = cumulative.map((v, i) => {
    const x = PAD + (i / (cumulative.length - 1)) * (W - PAD * 2)
    const y = PAD + ((max - v) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const zeroY = PAD + ((max - 0) / range) * (H - PAD * 2)
  const isProfit = running >= 0
  const color = isProfit ? C.primary : C.red
  const lastX = PAD + (W - PAD * 2)
  const lastY = PAD + ((max - running) / range) * (H - PAD * 2)

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'14px 16px', marginBottom:'16px' }}>
      {lbl('Profit / Loss Curve')}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }}>
        {/* Zero line */}
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4" />

        {/* Area fill */}
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <polygon
          points={`${PAD},${H - PAD} ${points.join(' ')} ${W - PAD},${H - PAD}`}
          fill="url(#chartGrad)"
        />

        {/* Line */}
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Last point dot */}
        <circle cx={lastX} cy={lastY} r="3" fill={color} />
      </svg>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px' }}>
        <span style={{ fontSize:'0.58rem', color:C.textMuted }}>{sorted[0]?.date}</span>
        <span style={{ fontSize:'0.7rem', fontWeight:700, color:isProfit ? C.primary : C.red, fontVariantNumeric:'tabular-nums' }}>
          {running >= 0 ? '+' : ''}${Math.abs(running).toFixed(0)}
        </span>
        <span style={{ fontSize:'0.58rem', color:C.textMuted }}>{sorted[sorted.length-1]?.date}</span>
      </div>
    </div>
  )
}

// ── Session Modal ─────────────────────────────────────────────────────────────
function SessionModal({ initial, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(initial || { date:today, stakes:'$1/$2', location:'Live', hours:'', buyIn:'', cashOut:'' })
  const profit = (parseFloat(form.cashOut)||0) - (parseFloat(form.buyIn)||0)
  const isEdit = !!initial

  const inputStyle = { width:'100%', padding:'10px 12px', background:C.surfaceHigh, border:`1px solid ${C.border}`, borderRadius:'8px', color:C.text, fontSize:'0.82rem', outline:'none', minHeight:'44px', colorScheme:'dark', boxSizing:'border-box', fontFamily:"'Inter',sans-serif" }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:'16px' }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'20px', width:'100%', maxWidth:'380px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ fontSize:'1rem', fontWeight:600, color:C.text }}>{isEdit ? 'Edit Session' : 'Log Session'}</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Date</div>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Stakes</div>
            <select value={form.stakes} onChange={e=>setForm(p=>({...p,stakes:e.target.value}))} style={{ ...inputStyle, appearance:'none', cursor:'pointer' }}>
              {STAKES_LIST.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Buy-in ($)</div>
            <input type="number" inputMode="numeric" placeholder="e.g. 300" value={form.buyIn} onChange={e=>setForm(p=>({...p,buyIn:e.target.value}))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Cash-out ($)</div>
            <input type="number" inputMode="numeric" placeholder="e.g. 520" value={form.cashOut} onChange={e=>setForm(p=>({...p,cashOut:e.target.value}))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Hours</div>
            <input type="number" inputMode="decimal" placeholder="e.g. 4" value={form.hours} onChange={e=>setForm(p=>({...p,hours:e.target.value}))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:'0.56rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'5px' }}>Location</div>
            <select value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} style={{ ...inputStyle, appearance:'none', cursor:'pointer' }}>
              {['Live','Online'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {(form.buyIn || form.cashOut) && (
          <div style={{ padding:'10px 14px', borderRadius:'8px', background:profit>=0?'rgba(84,233,138,0.08)':'rgba(244,112,103,0.08)', border:`1px solid ${profit>=0?'rgba(84,233,138,0.2)':'rgba(244,112,103,0.2)'}` }}>
            <div style={{ fontSize:'0.58rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'3px' }}>Profit / Loss</div>
            <div style={{ fontSize:'1.4rem', fontWeight:700, letterSpacing:'-0.02em', color:profit>=0?C.primary:C.red, fontVariantNumeric:'tabular-nums' }}>
              {profit>=0?'+':''}${Math.abs(profit).toFixed(0)}
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background:C.surfaceHigh, color:C.textMuted, fontWeight:500, fontSize:'0.8rem', cursor:'pointer', minHeight:'44px' }}>Cancel</button>
          <button onClick={() => {
            if (!form.buyIn && !form.cashOut) return
            const s = { ...form, profit, buyIn:parseFloat(form.buyIn)||0, cashOut:parseFloat(form.cashOut)||0, hours:parseFloat(form.hours)||0, linkedHandIds:initial?.linkedHandIds||[] }
            if (initial?.id) s.id = initial.id
            onSave(s)
            onClose()
          }} style={{ flex:2, padding:'12px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e', fontWeight:700, fontSize:'0.8rem', cursor:'pointer', minHeight:'44px', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.2)' }}>
            {isEdit ? 'Save Changes' : 'Save Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Link Hands Panel ──────────────────────────────────────────────────────────
const SL = { s:'♠', h:'♥', d:'♦', c:'♣' }
const SC = { s:'#111', h:'#cc2222', d:'#cc2222', c:'#111' }

function TinyCard({ card }) {
  const r = card.slice(0,-1), s = card.slice(-1)
  return (
    <div style={{ width:'20px', height:'27px', background:'#fff', borderRadius:'2px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.5)', flexShrink:0 }}>
      <span style={{ fontSize:'0.52rem', fontWeight:800, color:SC[s], lineHeight:1 }}>{r==='T'?'10':r}</span>
      <span style={{ fontSize:'0.48rem', color:SC[s], lineHeight:1 }}>{SL[s]}</span>
    </div>
  )
}

function LinkHandsPanel({ session, allHands, onLink, onClose }) {
  const unassigned = allHands.filter(h => !h.sessionId)
  const [selected, setSelected] = useState(new Set(session.linkedHandIds || []))
  const toggle = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div style={{ background:C.surfaceHi, border:`1px solid ${C.borderHi}`, borderRadius:'10px', padding:'14px', marginTop:'8px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
        <span style={{ fontSize:'0.75rem', fontWeight:600, color:C.text }}>Link Unassigned Hands</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:C.textMuted, cursor:'pointer', fontSize:'0.7rem' }}>✕</button>
      </div>
      {unassigned.length === 0 ? (
        <div style={{ fontSize:'0.75rem', color:C.textMuted, opacity:0.5, textAlign:'center', padding:'20px 0' }}>No unassigned hands</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'200px', overflowY:'auto' }}>
          {unassigned.map(h => {
            const isSel = selected.has(h.id)
            return (
              <div key={h.id} onClick={() => toggle(h.id)} style={{
                display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px',
                borderRadius:'8px', cursor:'pointer',
                background:isSel?C.primaryDim:C.surfaceHigh,
                border:`1px solid ${isSel?C.primaryBorder:C.border}`,
              }}>
                {isSel ? <CheckSquare size={14} color={C.primary}/> : <Square size={14} color={C.textMuted}/>}
                <span style={{ fontSize:'0.65rem', fontWeight:600, color:C.primary }}>{h.position}</span>
                <div style={{ display:'flex', gap:'2px' }}>{h.holeCards.map(c => <TinyCard key={c} card={c}/>)}</div>
                <span style={{ fontSize:'0.65rem', color:h.result>0?C.primary:h.result<0?C.red:C.textMuted, fontWeight:600, marginLeft:'auto' }}>
                  {h.result>0?'+':''}{h.result}bb
                </span>
              </div>
            )
          })}
        </div>
      )}
      <button onClick={() => { onLink(session.id, [...selected]); onClose() }} style={{
        width:'100%', marginTop:'10px', padding:'10px', borderRadius:'8px', border:'none',
        background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e',
        fontWeight:700, fontSize:'0.78rem', cursor:'pointer', minHeight:'40px',
      }}>
        Link {selected.size} Hand{selected.size!==1?'s':''}
      </button>
    </div>
  )
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, allHands, onDelete, onLink, onEdit, onEditHand }) {
  const [expanded, setExpanded] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const isWin = session.profit >= 0
  const linked = allHands.filter(h => (session.linkedHandIds||[]).includes(h.id))

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ height:'2px', background:isWin?`linear-gradient(90deg,transparent,${C.primary},transparent)`:`linear-gradient(90deg,transparent,${C.red},transparent)` }} />
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, flexWrap:'wrap' }}>
            <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'0.65rem', fontWeight:700, background:C.primaryDim, color:C.primary }}>{session.stakes}</span>
            <span style={{ fontSize:'0.68rem', color:C.textMuted }}>{session.location}</span>
            <span style={{ fontSize:'0.68rem', color:C.textMuted }}>{session.date}</span>
            {session.hours > 0 && <span style={{ fontSize:'0.68rem', color:C.textMuted }}>{session.hours}h</span>}
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:'1.05rem', fontWeight:700, letterSpacing:'-0.02em', color:isWin?C.primary:C.red, fontVariantNumeric:'tabular-nums' }}>
              {isWin?'+':''}${Math.abs(session.profit).toFixed(0)}
            </div>
            {(session.buyIn||session.cashOut) && (
              <div style={{ fontSize:'0.6rem', color:C.textMuted, opacity:0.6 }}>
                In ${session.buyIn||0} → Out ${session.cashOut||0}
              </div>
            )}
          </div>
        </div>

        <div style={{ display:'flex', gap:'6px', marginTop:'10px', flexWrap:'wrap' }}>
          <button onClick={() => onEdit(session)} style={{
            display:'flex', alignItems:'center', gap:'4px', padding:'6px 10px', borderRadius:'6px', border:'none',
            background:C.surfaceHigh, color:C.textMuted, fontSize:'0.65rem', cursor:'pointer', minHeight:'36px',
          }}>✏️ Edit</button>
          <button onClick={() => { setExpanded(v=>!v); setShowLink(false) }} style={{
            display:'flex', alignItems:'center', gap:'4px', padding:'6px 10px', borderRadius:'6px', border:'none',
            background:C.surfaceHigh, color:C.textMuted, fontSize:'0.65rem', cursor:'pointer', minHeight:'36px',
          }}>
            {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            {linked.length} linked
          </button>
          <button onClick={() => { setShowLink(v=>!v); setExpanded(true) }} style={{
            display:'flex', alignItems:'center', gap:'4px', padding:'6px 10px', borderRadius:'6px', border:'none',
            background:C.secondaryDim, color:C.secondary, fontSize:'0.65rem', cursor:'pointer', minHeight:'36px',
          }}>
            <Link size={11}/> Link Hands
          </button>
          <button onClick={() => onDelete(session.id)} style={{
            marginLeft:'auto', background:'none', border:'none', color:C.textMuted, opacity:0.35,
            cursor:'pointer', padding:'4px', display:'flex', alignItems:'center', minHeight:'36px',
          }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.8'}
            onMouseLeave={e=>e.currentTarget.style.opacity='0.35'}
          >
            <Trash2 size={12}/>
          </button>
        </div>

        {showLink && <LinkHandsPanel session={session} allHands={allHands} onLink={onLink} onClose={()=>setShowLink(false)}/>}

        {expanded && linked.length > 0 && (
          <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'6px' }}>
            {linked.map(h => (
              <div key={h.id} onClick={() => onEditHand && onEditHand(h)} style={{
                display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px',
                background:C.surfaceHigh, borderRadius:'8px',
                cursor:onEditHand?'pointer':'default',
                border:`1px solid transparent`, transition:'border-color 0.15s',
              }}
                onMouseEnter={e => { if(onEditHand) e.currentTarget.style.borderColor=C.borderHi }}
                onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}
              >
                <span style={{ fontSize:'0.6rem', fontWeight:700, color:C.primary }}>{h.position}</span>
                <div style={{ display:'flex', gap:'2px' }}>{h.holeCards.map(c => <TinyCard key={c} card={c}/>)}</div>
                <span style={{ fontSize:'0.58rem', color:C.textMuted }}>{h.street}</span>
                <span style={{ fontSize:'0.68rem', color:h.result>0?C.primary:h.result<0?C.red:C.textMuted, fontWeight:600, marginLeft:'auto' }}>
                  {h.result>0?'+':''}${Math.abs(h.result)}
                </span>
                {onEditHand && <span style={{ fontSize:'0.52rem', color:C.textMuted, opacity:0.4 }}>✎</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BankrollManager() {
  const navigate = useNavigate()
  const { sessions, hands, addSession, updateSession, deleteSession, linkHandsToSession } = useData()
  const [showModal,   setShowModal]   = useState(false)
  const [editSession, setEditSession] = useState(null)

  const handleEditHand = (hand) => {
    navigate('/history', { state: { editHand: hand } })
  }

  const stats = useMemo(() => {
    const totalProfit = sessions.reduce((s,r) => s+(r.profit||0), 0)
    const totalHours  = sessions.reduce((s,r) => s+(r.hours||0), 0)
    const wins        = sessions.filter(r => r.profit>0).length
    const winRate     = sessions.length ? ((wins/sessions.length)*100).toFixed(0) : 0
    const hourly      = totalHours>0 ? (totalProfit/totalHours).toFixed(1) : 0
    return { totalProfit, totalHours, wins, winRate, hourly }
  }, [sessions])

  const handleLink = async (sessionId, handIds) => {
    await linkHandsToSession(sessionId, handIds)
  }

  return (
    <div style={{ padding:'16px', paddingBottom:'120px', maxWidth:'720px', margin:'0 auto', paddingTop:'20px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
        <div>
          <h1 style={{ fontSize:'1.3rem', fontWeight:700, color:C.text, letterSpacing:'-0.02em', marginBottom:'3px' }}>Bankroll</h1>
          <p style={{ fontSize:'0.72rem', color:C.textMuted }}>Live Cash · Vancouver</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px', borderRadius:'8px', border:'none', minHeight:'44px',
          background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', color:'#061a0e',
          fontWeight:700, fontSize:'0.72rem', cursor:'pointer', letterSpacing:'0.05em', textTransform:'uppercase',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 16px rgba(84,233,138,0.2)',
        }}>
          <PlusCircle size={13}/> Log Session
        </button>
      </div>

      {/* Stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'16px' }}>
        {[
          { label:'Total Profit',  value:`${stats.totalProfit>=0?'+':''}$${Math.abs(stats.totalProfit).toFixed(0)}`, color:stats.totalProfit>=0?C.primary:C.red },
          { label:'Win Rate',      value:`${stats.winRate}%`,   color:C.secondary },
          { label:'Hourly Rate',   value:`$${stats.hourly}/h`,  color:C.text },
          { label:'Sessions',      value:sessions.length,       color:C.text },
        ].map(s => (
          <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'12px 14px', position:'relative', overflow:'hidden' }}>
            <div style={{ fontSize:'0.55rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:C.textMuted, marginBottom:'8px' }}>{s.label}</div>
            <div style={{ fontSize:'1.4rem', fontWeight:700, letterSpacing:'-0.025em', color:s.color, fontVariantNumeric:'tabular-nums' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Profit chart */}
      <ProfitChart sessions={sessions} />

      {/* Session history */}
      <div style={{ marginBottom:'12px' }}>
        <div style={{ fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:C.textMuted, marginBottom:'10px' }}>Session History</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {sessions.length===0 && (
            <div style={{ padding:'40px 20px', textAlign:'center', color:C.textMuted, opacity:0.35, fontSize:'0.8rem' }}>No sessions yet</div>
          )}
          {[...sessions].reverse().map(s => (
            <SessionCard key={s.id} session={s} allHands={hands}
              onDelete={async id => await deleteSession(id)}
              onLink={handleLink}
              onEdit={s => setEditSession(s)}
              onEditHand={handleEditHand}
            />
          ))}
        </div>
      </div>

      {showModal && (
        <SessionModal
          onSave={async s => { await addSession(s); setShowModal(false) }}
          onClose={()=>setShowModal(false)}
        />
      )}
      {editSession && (
        <SessionModal
          initial={editSession}
          onSave={async updated => { await updateSession(updated.id, updated); setEditSession(null) }}
          onClose={()=>setEditSession(null)}
        />
      )}
    </div>
  )
}
