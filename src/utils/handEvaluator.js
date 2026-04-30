// Deterministic poker hand evaluator.
// Input: hole cards + board cards in "Ah", "Kd", "Tc" format.
// Output: exact hand classification, best 5 cards, board texture.

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, 'T': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

const RANK_NAMES = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six',
  7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
}

function parseCard(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.trim()
  if (s.length < 2) return null
  const rank = s.slice(0, -1).toUpperCase()
  const suit = s.slice(-1).toLowerCase()
  const value = RANK_VALUES[rank]
  if (!value || !['h', 'd', 'c', 's'].includes(suit)) return null
  return { rank, suit, value, str: rank + suit }
}

function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const result = []
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...rest])
    }
  }
  return result
}

function rankHand5(cards) {
  const vals  = cards.map(c => c.value).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)

  const isFlush = suits.every(s => s === suits[0])

  // Straight check
  const uVals = [...new Set(vals)].sort((a, b) => b - a)
  let isStraight = false, sHigh = 0
  if (uVals.length === 5) {
    if (uVals[0] - uVals[4] === 4) { isStraight = true; sHigh = uVals[0] }
    // Wheel: A-2-3-4-5
    if (!isStraight && uVals[0] === 14 && uVals[1] === 5 && uVals[4] === 2) {
      isStraight = true; sHigh = 5
    }
  }

  // Rank counts sorted by count desc then value desc
  const rc = {}
  for (const v of vals) rc[v] = (rc[v] || 0) + 1
  const groups = Object.entries(rc)
    .map(([v, c]) => ({ v: +v, c }))
    .sort((a, b) => b.c !== a.c ? b.c - a.c : b.v - a.v)
  const counts = groups.map(g => g.c)

  if (isFlush && isStraight) {
    const label = sHigh === 14
      ? 'Royal Flush'
      : `Straight Flush, ${RANK_NAMES[sHigh]} high`
    return { score: [8, sHigh], label }
  }
  if (counts[0] === 4) {
    const q = groups[0].v, k = groups[1].v
    return { score: [7, q, k], label: `Four of a Kind, ${RANK_NAMES[q]}s` }
  }
  if (counts[0] === 3 && counts[1] === 2) {
    const t = groups[0].v, p = groups[1].v
    return { score: [6, t, p], label: `Full House, ${RANK_NAMES[t]}s full of ${RANK_NAMES[p]}s` }
  }
  if (isFlush) {
    return { score: [5, ...vals], label: `Flush, ${RANK_NAMES[vals[0]]} high` }
  }
  if (isStraight) {
    const label = sHigh === 14 ? 'Straight, Broadway (A-K-Q-J-T)'
                : sHigh ===  5 ? 'Straight, Wheel (A-2-3-4-5)'
                :                `Straight, ${RANK_NAMES[sHigh]} high`
    return { score: [4, sHigh], label }
  }
  if (counts[0] === 3) {
    const t = groups[0].v
    const kickers = groups.slice(1).map(g => g.v)
    return { score: [3, t, ...kickers], label: `Three of a Kind, ${RANK_NAMES[t]}s` }
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const p1 = groups[0].v, p2 = groups[1].v, kicker = groups[2]?.v ?? 0
    return { score: [2, p1, p2, kicker], label: `Two Pair, ${RANK_NAMES[p1]}s and ${RANK_NAMES[p2]}s` }
  }
  if (counts[0] === 2) {
    const p = groups[0].v
    const kickers = groups.slice(1).map(g => g.v)
    const kickerStr = kickers.length ? `, ${RANK_NAMES[kickers[0]]} kicker` : ''
    return { score: [1, p, ...kickers], label: `One Pair, ${RANK_NAMES[p]}s${kickerStr}` }
  }
  return { score: [0, ...vals], label: `High Card, ${RANK_NAMES[vals[0]]}` }
}

function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function getBoardTexture(boardCards) {
  const cards = (boardCards || []).map(parseCard).filter(Boolean)
  if (cards.length === 0) {
    return { paired: false, flushPossible: false, straightPossible: false, description: 'preflop' }
  }

  const rc = {}
  for (const c of cards) rc[c.value] = (rc[c.value] || 0) + 1
  const paired = Object.values(rc).some(v => v >= 2)

  const sc = {}
  for (const c of cards) sc[c.suit] = (sc[c.suit] || 0) + 1
  const flushPossible = Object.values(sc).some(v => v >= 3)

  const sortedVals = [...new Set(cards.map(c => c.value))].sort((a, b) => a - b)
  let straightPossible = false
  for (let i = 0; i <= sortedVals.length - 3; i++) {
    if (sortedVals[i + 2] - sortedVals[i] <= 4) { straightPossible = true; break }
  }

  const parts = []
  if (paired) parts.push('paired')
  if (flushPossible) parts.push('flush draw possible')
  if (straightPossible) parts.push('straight draw possible')
  if (!paired && !flushPossible && !straightPossible) parts.push('dry')

  return { paired, flushPossible, straightPossible, description: parts.join(', ') }
}

export function evaluateHeroHand(holeCards, boardCards) {
  const hole  = (holeCards  || []).map(parseCard).filter(Boolean)
  const board = (boardCards || []).map(parseCard).filter(Boolean)
  const texture = getBoardTexture(boardCards)

  if (hole.length < 2) {
    return {
      heroHandStrength: 'Unknown — missing hole cards',
      bestFiveCards: [],
      boardTexture: texture,
      contextLevel: 'limited',
    }
  }

  const all = [...hole, ...board]

  // Pre-flop or too few cards for 5-card hand
  if (all.length < 5) {
    const h0 = hole[0], h1 = hole[1]
    if (h0.value === h1.value) {
      return {
        heroHandStrength: `Pocket ${RANK_NAMES[h0.value]}s`,
        bestFiveCards: hole.map(c => c.str),
        boardTexture: texture,
        contextLevel: 'preflop',
      }
    }
    const [hi, lo] = h0.value > h1.value ? [h0, h1] : [h1, h0]
    return {
      heroHandStrength: `${RANK_NAMES[hi.value]}-${RANK_NAMES[lo.value]} high (preflop)`,
      bestFiveCards: hole.map(c => c.str),
      boardTexture: texture,
      contextLevel: 'preflop',
    }
  }

  // Find best 5-card hand from all available cards
  const combos = combinations(all, 5)
  let best = null, bestCards = null

  for (const combo of combos) {
    const result = rankHand5(combo)
    if (!best || cmpScore(result.score, best.score) > 0) {
      best = result
      bestCards = combo
    }
  }

  if (!best) {
    return {
      heroHandStrength: 'Unknown — evaluation failed',
      bestFiveCards: [],
      boardTexture: texture,
      contextLevel: 'limited',
    }
  }

  return {
    heroHandStrength: best.label,
    bestFiveCards: bestCards.map(c => c.str),
    boardTexture: texture,
    contextLevel: 'full',
  }
}
