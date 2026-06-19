// GROWTH-3: leak-targeted drills. Each leak_category maps to a generator that
// produces spots training EXACTLY that decision — closing the loop "Coach finds a
// leak → drill it → it shrinks". Generators are correct-BY-CONSTRUCTION (we deal a
// spot, evaluate it with the real handEvaluator, and only emit it when the textbook
// answer is unambiguous) so the drill never serves a poker-wrong / debatable hand.
import { evaluateHeroHand } from './handEvaluator'

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const SUITS = ['s','h','d','c']
const RANK_VAL = { A:14,K:13,Q:12,J:11,T:10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2 }

function freshDeck() {
  const d = []
  for (const r of RANKS) for (const s of SUITS) d.push(r + s)
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[d[i], d[j]] = [d[j], d[i]] }
  return d
}
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[x[i], x[j]] = [x[j], x[i]] } return x }
function pick(a) { return a[Math.floor(Math.random() * a.length)] }

// Coarse strength class from the handEvaluator label.
function strengthClass(label) {
  const s = (label || '').toLowerCase()
  if (s.includes('straight flush') || s.includes('royal') || s.includes('four of a kind') || s.includes('full house')) return 'monster'
  if (s.includes('flush') || s.includes('straight') || s.includes('three of a kind')) return 'strong'
  if (s.includes('two pair')) return 'twopair'
  if (s.includes('one pair') || s.includes('pocket')) return 'onepair'
  return 'air'
}
const VILLAINS = ['a quiet, passive reg', 'a tight reg', 'a typical live reg']

// ── Bluff-catcher discipline ──────────────────────────────────────────────────
// river/turn_call_too_wide, top/overpair_overplay: hero holds ONE PAIR on a WET
// board (flush/straight there) and faces a big bet. Vs a live pool that underbluffs
// big bets, that's a fold. Correct-by-construction: we require a wet board + exactly
// one pair, so "fold" is the unambiguous disciplined answer (not a coin-flip).
function genBluffCatcher(variant) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const deck = freshDeck()
    const hero = [deck.pop(), deck.pop()]
    const nBoard = variant === 'turn' ? 4 : 5
    const board = []
    for (let i = 0; i < nBoard; i++) board.push(deck.pop())
    const ev = evaluateHeroHand(hero, board)
    if (strengthClass(ev.heroHandStrength) !== 'onepair') continue
    const wet = ev.boardTexture?.flushPossible || ev.boardTexture?.straightPossible
    if (!wet) continue
    // Keep the spot UNAMBIGUOUS: board unpaired (so the only pair is the hero's) and
    // the pair is MARGINAL (below the top board card — second pair or worse, or a low
    // pocket pair). Folding that to a big bet on a wet board is textbook, not debatable.
    const bRanks = board.map(c => RANK_VAL[c.slice(0, -1)])
    if (new Set(bRanks).size !== bRanks.length) continue
    const cnt = {}
    ;[...hero, ...board].forEach(c => { const v = RANK_VAL[c.slice(0, -1)]; cnt[v] = (cnt[v] || 0) + 1 })
    const pairRank = Math.max(0, ...Object.keys(cnt).filter(v => cnt[v] >= 2).map(Number))
    if (pairRank >= Math.max(...bRanks)) continue
    const pot = pick([60, 80, 100, 120])
    const bet = variant === 'turn' ? Math.round(pot * 0.7) : pot
    const street = variant === 'turn' ? 'Turn' : 'River'
    const options = shuffle([
      { label: 'Fold', value: 'fold' },
      { label: `Call $${bet}`, value: 'call' },
      { label: 'Raise', value: 'raise' },
    ])
    return {
      heroCards: hero, boardCards: board,
      question: `${street}: you have ${ev.heroHandStrength.toLowerCase()} on a wet board. ${cap(pick(VILLAINS))} jams $${bet} into $${pot}. Your move?`,
      options, answer: 'fold',
      rationale: `The board has a flush/straight there, and live players rarely fire a big ${street.toLowerCase()} bet as a bluff. One pair beats only bluffs you almost never face — fold. Calling is the leak; raising turns a bluff-catcher into a bluff with no fold equity.`,
      formula: 'Live pools underbluff big bets → fold marginal bluff-catchers',
    }
  }
  return null
}

// ── Value betting ─────────────────────────────────────────────────────────────
// passive_play / missed_value: hero has a STRONG made hand (two pair+) on the river,
// checked to. Betting for value is correct vs calling stations. Checking back leaks
// value. Correct-by-construction: require two-pair-or-better.
function genValueBet() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const deck = freshDeck()
    const hero = [deck.pop(), deck.pop()]
    const board = []
    for (let i = 0; i < 5; i++) board.push(deck.pop())
    const ev = evaluateHeroHand(hero, board)
    const cls = strengthClass(ev.heroHandStrength)
    if (cls !== 'twopair' && cls !== 'strong' && cls !== 'monster') continue
    if (!ev.bestFiveCards?.some(c => hero.includes(c))) continue   // hero must contribute (not a board hand)
    const pot = pick([50, 70, 90, 120])
    const options = shuffle([
      { label: `Bet ~70% pot for value`, value: 'bet' },
      { label: 'Check back', value: 'check' },
    ])
    return {
      heroCards: hero, boardCards: board,
      question: `River: you have ${ev.heroHandStrength.toLowerCase()}. It checks to you in a $${pot} pot vs ${pick(VILLAINS)}. Action?`,
      options, answer: 'bet',
      rationale: `Strong made hand + a pool that calls too much = bet for value. Checking back here is the "missed value / passive" leak — you give up bets a calling station would have paid.`,
      formula: 'Value bet your strong hands vs callers — thin value adds up',
    }
  }
  return null
}

// ── Bluff discipline ──────────────────────────────────────────────────────────
// overbluff: hero has AIR (no pair / no draw) on the river, checked to. Vs sticky
// live callers with no fold equity, giving up is correct. Require 'air' on the river.
function genBluffDiscipline() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const deck = freshDeck()
    const hero = [deck.pop(), deck.pop()]
    const board = []
    for (let i = 0; i < 5; i++) board.push(deck.pop())
    const ev = evaluateHeroHand(hero, board)
    if (strengthClass(ev.heroHandStrength) !== 'air') continue
    const pot = pick([40, 60, 80])
    const options = shuffle([
      { label: `Bluff — bet $${Math.round(pot * 0.7)}`, value: 'bluff' },
      { label: 'Check / give up', value: 'check' },
    ])
    return {
      heroCards: hero, boardCards: board,
      question: `River: you have ${ev.heroHandStrength.toLowerCase()} — no pair, no draw — in a $${pot} pot vs ${pick(VILLAINS)}. It's checked to you. Action?`,
      options, answer: 'check',
      rationale: `Live recs call rivers too wide and rarely fold to a single bet, so a no-equity bluff just burns money. Give up. Bluffing here is the "overbluff" leak — pick bluffs with backup equity instead.`,
      formula: 'No fold equity vs sticky callers → don\'t bluff pure air',
    }
  }
  return null
}

// ── Draw + pot odds ───────────────────────────────────────────────────────────
// draw_chasing: hero has a flush draw (9 outs) or OESD (8 outs) on the flop, facing a
// bet. Correct-by-MATH: call only when the price beats the draw's equity. We size the
// bet to make the answer clear (clearly good or clearly bad odds), never borderline.
function genDrawOdds() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const deck = freshDeck()
    const hero = [deck.pop(), deck.pop()]
    const board = [deck.pop(), deck.pop(), deck.pop()]
    if (new Set([...hero, ...board]).size !== 5) continue
    const suits = [...hero, ...board].map(c => c.slice(-1))
    const sc = {}; suits.forEach(s => sc[s] = (sc[s] || 0) + 1)
    const heroSuits = hero.map(c => c.slice(-1))
    const flushDraw = heroSuits.some(s => sc[s] === 4)   // exactly 4 → a draw (not made)
    const vals = [...new Set([...hero, ...board].map(c => RANK_VAL[c.slice(0, -1)]))].sort((a, b) => a - b)
    let oesd = false
    for (let i = 0; i <= vals.length - 4; i++) if (vals[i + 3] - vals[i] === 3) { oesd = true; break }
    const ev = evaluateHeroHand(hero, board)
    if (strengthClass(ev.heroHandStrength) !== 'air') continue   // a clean draw, not a made pair
    if (!flushDraw && !oesd) continue
    const outs = flushDraw ? 9 : 8
    const equity = Math.round(outs * 4)   // rule of 4 on the flop (~%)
    // Choose a pot/bet that makes the decision clear: either a cheap price (call) or
    // an overpriced one (fold). Pot odds % = bet / (pot + 2*bet).
    const pot = pick([50, 60, 80, 100])
    const goodPrice = Math.random() < 0.5
    const bet = goodPrice ? Math.round(pot * 0.33) : Math.round(pot * 1.1)
    const pricePct = Math.round((bet / (pot + 2 * bet)) * 100)
    const shouldCall = pricePct < equity - 3   // need equity to beat the price (margin so it's clear)
    const drawName = flushDraw ? 'flush draw (9 outs)' : 'open-ended straight draw (8 outs)'
    const options = shuffle([
      { label: `Call $${bet}`, value: 'call' },
      { label: 'Fold', value: 'fold' },
    ])
    return {
      heroCards: hero, boardCards: board,
      question: `Flop: you have a ${drawName}. Villain bets $${bet} into $${pot}. Pot odds vs your equity — call or fold?`,
      options, answer: shouldCall ? 'call' : 'fold',
      rationale: shouldCall
        ? `You need ~${pricePct}% to call and your draw has ~${equity}%. The price is good — call (mind implied odds too).`
        : `You need ~${pricePct}% to call but your draw is only ~${equity}%. Overpriced — fold. Chasing here is the "draw chasing" leak.`,
      formula: `Call when equity > price: ~${equity}% vs ~${pricePct}%`,
    }
  }
  return null
}

// ── Preflop ranges (reuses the project's GTO 9-max opening ranges) ─────────────
const GTO_RANGES = {
  UTG: ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','KQs','AKo'],
  MP:  ['AA','KK','QQ','JJ','TT','99','88','77','AKs','AQs','AJs','ATs','KQs','KJs','QJs','AKo','AQo','KQo'],
  CO:  ['AA','KK','QQ','JJ','TT','99','88','77','66','55','AKs','AQs','AJs','ATs','A9s','A8s','KQs','KJs','QJs','JTs','T9s','AKo','AQo','AJo','ATo','KQo','KJo'],
  BTN: ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','AKs','AQs','AJs','ATs','A9s','A8s','A5s','A4s','KQs','KJs','KTs','QJs','JTs','T9s','98s','87s','AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo'],
}
function comboKey(hero) {
  const r1 = hero[0].slice(0, -1), s1 = hero[0].slice(-1)
  const r2 = hero[1].slice(0, -1), s2 = hero[1].slice(-1)
  if (r1 === r2) return r1 + r2
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? [r1, r2] : [r2, r1]
  return hi[0] + hi[1] + (s1 === s2 ? 's' : 'o')
}
function genPreflop() {
  const pos = pick(Object.keys(GTO_RANGES))
  const deck = freshDeck()
  const hero = [deck.pop(), deck.pop()]
  const inRange = GTO_RANGES[pos].includes(comboKey(hero))
  const options = shuffle([
    { label: 'Open-raise', value: 'open' },
    { label: 'Fold', value: 'fold' },
  ])
  return {
    heroCards: hero, boardCards: [], position: pos,
    question: `Preflop, folded to you in the ${pos} (100bb, 9-max live full ring). ${comboKey(hero)} — open or fold?`,
    options, answer: inRange ? 'open' : 'fold',
    rationale: inRange
      ? `${comboKey(hero)} is a standard ${pos} open at full ring. Opening keeps your range tight and ahead of the field.`
      : `${comboKey(hero)} is too loose to open from ${pos} at a 9-handed table — fold. Opening it is the "bad preflop" leak (too wide, out of position).`,
    formula: `${pos} open range (100bb 9-max)`,
  }
}

// ── Leak → drill mapping ──────────────────────────────────────────────────────
export const DRILL_META = {
  river_call_too_wide: { title: 'River Bluff-Catching',  gens: [() => genBluffCatcher('river')] },
  turn_call_too_wide:  { title: 'Turn Discipline',       gens: [() => genBluffCatcher('turn')] },
  top_pair_overplay:   { title: 'Top Pair Control',      gens: [() => genBluffCatcher('river')] },
  overpair_overplay:   { title: 'Overpair Control',      gens: [() => genBluffCatcher('river')] },
  missed_value:        { title: 'Thin Value',            gens: [genValueBet] },
  passive_play:        { title: 'Betting for Value',     gens: [genValueBet] },
  overbluff:           { title: 'Bluff Discipline',      gens: [genBluffDiscipline] },
  draw_chasing:        { title: 'Draw Pot Odds',         gens: [genDrawOdds] },
  bad_preflop:         { title: 'Preflop Ranges',        gens: [genPreflop] },
}

export function drillTitle(leak) { return DRILL_META[leak]?.title || 'Leak Drill' }
export function isDrillable(leak) { return !!DRILL_META[leak] }

// Build a queue of N questions for one leak (all targeting that decision).
export function buildDrillQueue(leak, n = 6) {
  const meta = DRILL_META[leak]
  if (!meta) return []
  const out = []
  let guard = 0
  while (out.length < n && guard < n * 30) {
    guard++
    const q = pick(meta.gens)()
    if (q) out.push({ ...q, tier: 'drill' })
  }
  return out
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }
