import React, { useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, Percent, Plus, X } from 'lucide-react'
import { theme as t } from '../theme/theme'

// ── Card constants ────────────────────────────────────────────────────────────
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const SUITS = ['s','h','d','c']
const SUIT_LABELS = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_COLORS  = { s: '#1a1a1a', h: '#cc2222', d: '#cc2222', c: '#1a1a1a' }
const DECK = RANKS.flatMap(r => SUITS.map(s => r + s))

// ── Hand evaluator — fixed encoding with proper tiebreaker ────────────────────
function rankValue(r) {
  return { A:14,K:13,Q:12,J:11,T:10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2 }[r]
}

// Base-15 encoding: handType * 15^5 dominates all rank combinations
const B5 = 759375, B4 = 50625, B3 = 3375, B2 = 225, B1 = 15

function evaluate5(cards) {
  const ranks = cards.map(c => rankValue(c[0])).sort((a, b) => b - a)
  const suits = cards.map(c => c.slice(-1))
  const flush = suits.every(s => s === suits[0])

  const rankCounts = {}
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1)
  const groups = Object.entries(rankCounts)
    .map(([r, c]) => [parseInt(r), c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const counts = groups.map(g => g[1])
  const byRank = groups.map(g => g[0])

  const uniq = [...new Set(ranks)].sort((a, b) => b - a)
  let straightHigh = 0
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) { straightHigh = uniq[i]; break }
  }
  // Wheel: A-2-3-4-5
  if (!straightHigh && uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2))
    straightHigh = 5

  const e = (type, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0) =>
    type * B5 + r1 * B4 + r2 * B3 + r3 * B2 + r4 * B1 + r5

  if (flush && straightHigh)          return e(8, straightHigh)
  if (counts[0] === 4)                return e(7, byRank[0], byRank[1])
  if (counts[0] === 3 && counts[1] === 2) return e(6, byRank[0], byRank[1])
  if (flush)                          return e(5, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
  if (straightHigh)                   return e(4, straightHigh)
  if (counts[0] === 3)                return e(3, byRank[0], byRank[1], byRank[2])
  if (counts[0] === 2 && counts[1] === 2) return e(2, byRank[0], byRank[1], byRank[2])
  if (counts[0] === 2)                return e(1, byRank[0], byRank[1], byRank[2], byRank[3])
  return e(0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
}

function bestHand(hole, board) {
  const all = [...hole, ...board]
  if (all.length < 5) return 0
  let best = -1
  for (let i = 0; i < all.length - 4; i++)
  for (let j = i + 1; j < all.length - 3; j++)
  for (let k = j + 1; k < all.length - 2; k++)
  for (let l = k + 1; l < all.length - 1; l++)
  for (let m = l + 1; m < all.length; m++)
    best = Math.max(best, evaluate5([all[i], all[j], all[k], all[l], all[m]]))
  return best
}

// villains = array of 2-card arrays
// Returns equity for hero + each villain as array
function simulate(heroHole, villains, board, iters = 4000) {
  const allKnown = [...heroHole, ...villains.flat(), ...board]
  const used = new Set(allKnown)
  const avail = DECK.filter(c => !used.has(c))

  const n = 1 + villains.length  // hero + villains
  const scores = new Array(n).fill(0)  // equity accumulators (fractional for ties)

  for (let i = 0; i < iters; i++) {
    const deck = [...avail]
    for (let j = deck.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [deck[j], deck[k]] = [deck[k], deck[j]]
    }
    const needed = 5 - board.length
    const runBoard = [...board, ...deck.slice(0, needed)]
    const di = needed

    // Score all players
    const hands = [bestHand(heroHole, runBoard)]
    for (let vi = 0; vi < villains.length; vi++) {
      let vHole = villains[vi]
      if (vHole.length < 2) {
        // random villain — pick 2 cards from remaining deck
        vHole = deck.slice(di + vi * 2, di + vi * 2 + 2)
      }
      hands.push(vHole.length === 2 ? bestHand(vHole, runBoard) : -1)
    }

    const best = Math.max(...hands)
    const winners = hands.filter(h => h === best).length
    hands.forEach((h, idx) => {
      if (h === best) scores[idx] += 1 / winners
    })
  }

  return scores.map(s => Math.round((s / iters) * 1000) / 10)
}

// ── Playing card component — white bg, black/red suits ────────────────────────
function PlayingCard({ card, onClick, size = 'md', dimmed = false }) {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1)
  const color = SUIT_COLORS[suit]
  // xs = board cards (5 must fit on mobile), sm = hole/villain, md = bigger screens
  const dims = size === 'lg'
    ? { w: '48px', h: '64px', rankSz: '1.1rem',  suitSz: '0.95rem' }
    : size === 'md'
    ? { w: '40px', h: '54px', rankSz: '0.9rem',   suitSz: '0.8rem' }
    : size === 'sm'
    ? { w: '32px', h: '44px', rankSz: '0.72rem',  suitSz: '0.65rem' }
    : { w: '26px', h: '36px', rankSz: '0.58rem',  suitSz: '0.52rem' } // xs

  return (
    <div
      onClick={onClick}
      style={{
        width: dims.w, height: dims.h,
        background: '#ffffff',
        borderRadius: '3px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '1px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.9)',
        flexShrink: 0,
        userSelect: 'none',
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <span style={{ fontSize: dims.rankSz, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {rank === 'T' ? '10' : rank}
      </span>
      <span style={{ fontSize: dims.suitSz, color, lineHeight: 1 }}>
        {SUIT_LABELS[suit]}
      </span>
    </div>
  )
}

function EmptySlot({ size = 'md' }) {
  const w = size==='lg' ? '48px' : size==='md' ? '40px' : size==='sm' ? '32px' : '26px'
  const h = size==='lg' ? '64px' : size==='md' ? '54px' : size==='sm' ? '44px' : '36px'
  return (
    <div style={{
      width: w, height: h,
      background: 'rgba(255,255,255,0.03)',
      border: '1.5px dashed rgba(255,255,255,0.12)',
      borderRadius: '3px', flexShrink: 0,
    }} />
  )
}

// ── Card picker — 4 rows × 13 cols, compact for mobile ───────────────────────
function CardPicker({ selected, used, onSelect, label }) {
  return (
    <div>
      {label ? (
        <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7D8590', marginBottom: '10px' }}>
          {label}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px' }}>
        {SUITS.map(suit =>
          RANKS.map(rank => {
            const key = rank + suit
            const isSel  = selected.includes(key)
            const isUsed = used.includes(key) && !isSel
            const color  = SUIT_COLORS[suit]
            return (
              <button
                key={key}
                disabled={isUsed}
                onClick={() => onSelect(key)}
                style={{
                  aspectRatio: '1/1.1',
                  borderRadius: '2px',
                  border: 'none',
                  background: isUsed ? 'rgba(255,255,255,0.04)' : '#ffffff',
                  cursor: isUsed ? 'not-allowed' : 'pointer',
                  opacity: isUsed ? 0.14 : 1,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '0px',
                  outline: isSel ? `2px solid #54e98a` : 'none',
                  outlineOffset: '1px',
                  boxShadow: isSel
                    ? `0 0 8px rgba(84,233,138,0.5), 0 1px 3px rgba(0,0,0,0.4)`
                    : '0 1px 2px rgba(0,0,0,0.4)',
                  transition: 'box-shadow 0.1s',
                  padding: '0',
                }}
              >
                <span style={{
                  fontSize: 'clamp(0.42rem, 1.0vw, 0.64rem)',
                  fontWeight: 800,
                  color: isUsed ? '#bbb' : color,
                  lineHeight: 1.05,
                  letterSpacing: '-0.02em',
                }}>
                  {rank === 'T' ? '10' : rank}
                </span>
                <span style={{
                  fontSize: 'clamp(0.38rem, 0.85vw, 0.55rem)',
                  color: isUsed ? '#bbb' : color,
                  lineHeight: 1,
                }}>
                  {SUIT_LABELS[suit]}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Equity card — per player ──────────────────────────────────────────────────
function EquityCard({ label, equity, cards, color, isHero }) {
  return (
    <div style={{
      background: t.glassCard.background,
      backdropFilter: t.glassCard.backdropFilter,
      border: t.glassCard.border,
      borderRadius: t.radius.lg,
      padding: '18px 22px',
      flex: 1,
      position: 'relative', overflow: 'hidden',
      boxShadow: isHero ? t.shadows.metricCardProfit : t.shadows.metricCard,
    }}>
      {/* Top streak */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: `linear-gradient(90deg, transparent, ${color}88, transparent)`,
      }} />

      {/* Label + hole cards */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px',
      }}>
        <div style={{
          fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: t.colors.onSurfaceVariant,
        }}>
          {label}
        </div>
        {/* Mini hole cards */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {cards.map(card => (
            <div key={card} style={{
              width: '28px', height: '38px',
              background: '#fff', borderRadius: '3px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '0px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800,
                color: SUIT_COLORS[card.slice(-1)], lineHeight: 1,
              }}>
                {card.slice(0,-1) === 'T' ? '10' : card.slice(0,-1)}
              </span>
              <span style={{
                fontSize: '0.65rem',
                color: SUIT_COLORS[card.slice(-1)], lineHeight: 1,
              }}>
                {SUIT_LABELS[card.slice(-1)]}
              </span>
            </div>
          ))}
          {cards.length === 0 && (
            <div style={{
              width: '28px', height: '38px',
              background: 'rgba(255,255,255,0.06)', borderRadius: '3px',
              border: '1px dashed rgba(255,255,255,0.15)',
            }} />
          )}
        </div>
      </div>

      {/* Equity number */}
      <div style={{
        fontSize: '2.8rem', fontWeight: 700, letterSpacing: '-0.03em',
        color, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        display: 'flex', alignItems: 'baseline', gap: '2px',
      }}>
        {equity}
        <span style={{ fontSize: '1.3rem', fontWeight: 400, opacity: 0.5, letterSpacing: 0 }}>%</span>
      </div>
      <div style={{
        fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: t.colors.onSurfaceVariant,
        marginTop: '6px', opacity: 0.5,
      }}>
        Equity
      </div>
    </div>
  )
}

// ── Hand names ────────────────────────────────────────────────────────────────
const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush']

// ── Main component ────────────────────────────────────────────────────────────
export default function OddsCalculator() {
  const [heroCards,    setHeroCards]    = useState([])
  const [villains,     setVillains]     = useState([[]])   // array of 2-card arrays
  const [boardCards,   setBoardCards]   = useState([])
  const [result,       setResult]       = useState(null)
  const [running,      setRunning]      = useState(false)
  // activeSlot: 'hero' | 'board' | 0 | 1 | 2  (villain index)
  const [activeSlot,   setActiveSlot]   = useState('hero')

  const allUsed = [
    ...heroCards,
    ...villains.flat(),
    ...boardCards,
  ]

  const getSlotCards = (slot) => {
    if (slot === 'hero')  return heroCards
    if (slot === 'board') return boardCards
    return villains[slot] || []
  }

  const toggle = useCallback((slot, key) => {
    const limit = slot === 'board' ? 5 : 2
    if (slot === 'hero') {
      setHeroCards(prev =>
        prev.includes(key) ? prev.filter(c => c !== key)
          : prev.length < limit ? [...prev, key] : prev
      )
    } else if (slot === 'board') {
      setBoardCards(prev =>
        prev.includes(key) ? prev.filter(c => c !== key)
          : prev.length < limit ? [...prev, key] : prev
      )
    } else {
      setVillains(prev => {
        const next = prev.map((v, i) => {
          if (i !== slot) return v
          return v.includes(key) ? v.filter(c => c !== key)
            : v.length < limit ? [...v, key] : v
        })
        return next
      })
    }
    setResult(null)
  }, [])

  const addVillain = () => {
    if (villains.length >= 3) return
    setVillains(prev => [...prev, []])
    setActiveSlot(villains.length)
  }

  const removeVillain = (idx) => {
    setVillains(prev => prev.filter((_, i) => i !== idx))
    setActiveSlot('hero')
    setResult(null)
  }

  const handleCalculate = () => {
    if (heroCards.length < 2) return
    setRunning(true)
    setTimeout(() => {
      const activeVillains = villains  // pass all, simulate handles partial
      const equities = simulate(heroCards, activeVillains, boardCards)
      const handScore = bestHand(heroCards, boardCards)
      setResult({
        equities,           // [heroEquity, villain0Equity, villain1Equity, ...]
        villainCount: villains.length,
        hand: boardCards.length >= 3 ? HAND_NAMES[Math.floor(handScore / B5)] : null,
      })
      setRunning(false)
    }, 50)
  }

  const handleReset = () => {
    setHeroCards([]); setVillains([[]]); setBoardCards([])
    setResult(null); setActiveSlot('hero')
  }

  // ── Card display slot ────────────────────────────────────────────────────────
  function CardDisplay({ cards, label, limit, slot, onRemove }) {
    const isActive = activeSlot === slot
    const isBoard  = slot === 'board'
    const cardSize = isBoard ? 'xs' : 'sm'  // xs for board (5 cards fit), sm for others

    return (
      <div
        onClick={() => setActiveSlot(slot)}
        style={{
          background: isActive ? '#252D3A' : '#1E2530',
          borderRadius: '8px', padding: '9px 12px', cursor: 'pointer',
          outline: isActive ? '1.5px solid rgba(84,233,138,0.4)' : 'none',
          transition: 'all 0.15s', position: 'relative',
        }}
      >
        {/* Label row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '0.56rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? '#54e98a' : '#7D8590' }}>
            {label} <span style={{ opacity: 0.4, fontWeight: 400, letterSpacing: 0, fontSize: '0.62rem' }}>{cards.length}/{limit}</span>
          </div>
          {onRemove && (
            <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7D8590', opacity: 0.5, padding: '2px', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* Hint above slots */}
        {cards.length === 0 && (
          <div style={{ fontSize: '0.56rem', color: '#7D8590', opacity: 0.38, marginBottom: '4px' }}>
            Tap to pick cards
          </div>
        )}

        {/* Cards row — ALWAYS nowrap so board stays on one line */}
        <div style={{ display: 'flex', gap: isBoard ? '3px' : '4px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {cards.map(card => (
            <PlayingCard key={card} card={card} size={cardSize} onClick={e => { e.stopPropagation(); toggle(slot, card) }} />
          ))}
          {Array.from({ length: limit - cards.length }).map((_, i) => (
            <EmptySlot key={i} size={cardSize} />
          ))}
        </div>
      </div>
    )
  }

  // ── Render — single scrollable column ────────────────────────────────────────
  return (
    <div style={{ background: '#0B0E14', padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '900px', margin: '0 auto' }}>

      <div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#E6EDF3', letterSpacing: '-0.02em', marginBottom: '3px' }}>Odds Calculator</h1>
        <p style={{ fontSize: '0.72rem', color: '#7D8590' }}>Monte Carlo · 4,000 iterations</p>
      </div>

      {/* Card slots row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <CardDisplay cards={heroCards} label="Your Hand" limit={2} slot="hero" />
        {villains.map((v, idx) => (
          <CardDisplay key={idx} cards={v} label={`Villain ${villains.length > 1 ? idx+1 : ''}`} limit={2} slot={idx} onRemove={villains.length > 1 ? () => removeVillain(idx) : null} />
        ))}
        {villains.length < 3 && (
          <button onClick={addVillain} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', borderRadius: '8px', border: '1px dashed #30363D', background: 'transparent', color: '#7D8590', fontSize: '0.72rem', cursor: 'pointer', minHeight: '40px' }}>
            <Plus size={13} /> Add Villain
          </button>
        )}
        <CardDisplay cards={boardCards} label="Board" limit={5} slot="board" />
      </div>

      {/* Card picker */}
      <div style={{ background: 'rgba(30,37,48,0.6)', backdropFilter: 'blur(16px)', border: '1px solid #21262D', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7D8590', marginBottom: '10px' }}>
          {activeSlot === 'hero' ? 'Your Hand' : activeSlot === 'board' ? 'Board' : `Villain ${villains.length > 1 ? activeSlot+1 : ''}`} — pick cards
        </div>
        <CardPicker
          label=""
          selected={getSlotCards(activeSlot)}
          used={allUsed}
          onSelect={key => toggle(activeSlot, key)}
        />
      </div>

      {/* Calculate button */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleCalculate} disabled={heroCards.length < 2 || running} style={{
          flex: 1, padding: '13px', borderRadius: '8px', border: 'none', minHeight: '48px',
          background: heroCards.length < 2 ? '#1E2530' : 'linear-gradient(135deg,#67f09a,#54e98a,#2db866)',
          color: heroCards.length < 2 ? '#7D8590' : '#061a0e',
          fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.07em', textTransform: 'uppercase',
          cursor: heroCards.length < 2 ? 'not-allowed' : 'pointer',
          opacity: running ? 0.7 : 1,
          boxShadow: heroCards.length >= 2 ? 'inset 0 1px 0 rgba(255,255,255,0.18),0 0 20px rgba(84,233,138,0.28)' : 'none',
        }}>
          {running ? 'Simulating...' : 'Calculate Odds'}
        </button>
        <button onClick={handleReset} style={{ padding: '13px 16px', borderRadius: '8px', border: 'none', background: '#1E2530', color: '#7D8590', cursor: 'pointer', minHeight: '48px', display: 'flex', alignItems: 'center' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Equity cards — 2 col grid on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <EquityCard label="You" equity={result.equities[0]} cards={heroCards} color="#54e98a" isHero />
            {villains.map((v, idx) => (
              <EquityCard key={idx} label={villains.length > 1 ? `Villain ${idx+1}` : 'Villain'} equity={result.equities[idx+1]} cards={v} color={idx===0 ? '#ffc0ac' : '#92ccff'} />
            ))}
          </div>

          {/* Equity bar */}
          <div style={{ background: 'rgba(30,37,48,0.6)', backdropFilter: 'blur(16px)', border: '1px solid #21262D', borderRadius: '10px', padding: '16px 18px' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7D8590', marginBottom: '12px' }}>Equity Distribution</div>
            <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', gap: '2px' }}>
              <div style={{ width: `${result.equities[0]}%`, background: 'linear-gradient(90deg,#54e98a,#2db866)', borderRadius: '4px 0 0 4px', transition: 'width 0.5s', boxShadow: '0 0 8px rgba(84,233,138,0.5)' }} />
              {villains.map((_, idx) => (
                <div key={idx} style={{ width: `${result.equities[idx+1]}%`, background: idx===0 ? '#ffc0ac' : '#92ccff', transition: 'width 0.5s' }} />
              ))}
              <div style={{ flex: 1, background: '#252D3A', borderRadius: '0 4px 4px 0' }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
              {[{ label:'You', color:'#54e98a' }, ...villains.map((_,i) => ({ label:villains.length>1?`Villain ${i+1}`:'Villain', color:i===0?'#ffc0ac':'#92ccff' }))].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color, boxShadow: `0 0 5px ${item.color}80` }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7D8590' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {result.hand && (
            <div style={{ background: 'rgba(84,233,138,0.08)', border: '1px solid rgba(84,233,138,0.2)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={16} color="#54e98a" />
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#54e98a', marginBottom: '2px' }}>Your best hand</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#E6EDF3', letterSpacing: '-0.01em' }}>{result.hand}</div>
              </div>
            </div>
          )}
        </>
      )}

      {!result && (
        <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <Percent size={36} color="#E6EDF3" />
          <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E6EDF3' }}>Select hole cards to begin</div>
        </div>
      )}
    </div>
  )
}
