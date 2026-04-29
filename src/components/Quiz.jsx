/**
 * Quiz.jsx — MicroPoker Master
 * 9-max Cash, 100bb effective stacks only.
 * Pipeline: generate spot → solve → validate → build choices → render.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Flame, Clock, CheckCircle, XCircle, Trophy, ArrowLeft, Lock, RotateCcw, ChevronRight } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:'#0B0E14', surface:'#161B22', surfaceHi:'#1E2530', surfaceHigh:'#252D3A',
  border:'#21262D', borderHi:'#30363D',
  primary:'#54e98a', primaryDim:'rgba(84,233,138,0.1)', primaryBorder:'rgba(84,233,138,0.25)',
  secondary:'#92ccff',
  tertiary:'#ffc0ac',
  text:'#E6EDF3', textMuted:'#7D8590', red:'#f47067',
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TIERS = {
  beginner:     { label:'Beginner',     daily:10, color:'84,233,138',   btnBg:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)', btnColor:'#061a0e', topics:'Outs · Equity · Hand Rankings · Positions' },
  intermediate: { label:'Intermediate', daily:3,  color:'146,204,255',  btnBg:'linear-gradient(135deg,#a8d8ff,#92ccff,#5aabee)', btnColor:'#03111e', topics:'Opening Ranges · Pot Odds · Combo Counting' },
  advanced:     { label:'Advanced',     daily:2,  color:'200,160,255',   btnBg:'linear-gradient(135deg,#d4a0ff,#b06aff,#ffd700)', btnColor:'#1a0030', topics:'Bluff Spots · Range Advantage · Exploits' },
}

// ─────────────────────────────────────────────────────────────────────────────
// DECK ENGINE — guaranteed no duplicates
// ─────────────────────────────────────────────────────────────────────────────
const ALL_RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']
const ALL_SUITS = ['s','h','d','c']
const RANK_VAL  = { A:14,K:13,Q:12,J:11,T:10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2 }

class Deck {
  constructor() {
    this._cards = ALL_RANKS.flatMap(r => ALL_SUITS.map(s => r + s))
    this._used  = new Set()
    this._shuffle()
  }
  _shuffle() {
    const a = this._cards
    for (let i = a.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]
    }
  }
  deal(n = 1) {
    const out = []
    for (const c of this._cards) {
      if (!this._used.has(c)) { this._used.add(c); out.push(c); if (out.length === n) break }
    }
    return out
  }
  dealHand()      { return this.deal(2) }
  dealBoard(n)    { return this.deal(n) }
  /** Remaining count of a given rank in the deck (not yet dealt) */
  remaining(rank) { return ALL_SUITS.filter(s => !this._used.has(rank+s)).length }
}

// ─────────────────────────────────────────────────────────────────────────────
// HAND RANKS (for hand-ranking questions)
// ─────────────────────────────────────────────────────────────────────────────
const HAND_RANKS = [
  { name:'Straight Flush', rank:8 },
  { name:'Four of a Kind', rank:7 },
  { name:'Full House',     rank:6 },
  { name:'Flush',          rank:5 },
  { name:'Straight',       rank:4 },
  { name:'Three of a Kind',rank:3 },
  { name:'Two Pair',       rank:2 },
  { name:'One Pair',       rank:1 },
  { name:'High Card',      rank:0 },
]

// ─────────────────────────────────────────────────────────────────────────────
// GTO 100bb 9-MAX CASH OPENING RANGES
// ─────────────────────────────────────────────────────────────────────────────
const GTO_RANGES = {
  UTG:     ['AA','KK','QQ','JJ','TT','99','AKs','AQs','AJs','KQs','AKo'],
  'UTG+1': ['AA','KK','QQ','JJ','TT','99','88','AKs','AQs','AJs','ATs','KQs','KJs','AKo','AQo'],
  MP:      ['AA','KK','QQ','JJ','TT','99','88','77','AKs','AQs','AJs','ATs','KQs','KJs','QJs','AKo','AQo','KQo'],
  HJ:      ['AA','KK','QQ','JJ','TT','99','88','77','66','AKs','AQs','AJs','ATs','A9s','KQs','KJs','QJs','JTs','AKo','AQo','AJo','KQo'],
  CO:      ['AA','KK','QQ','JJ','TT','99','88','77','66','55','AKs','AQs','AJs','ATs','A9s','A8s','KQs','KJs','QJs','JTs','T9s','AKo','AQo','AJo','ATo','KQo','KJo'],
  BTN:     ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','AKs','AQs','AJs','ATs','A9s','A8s','A5s','A4s','KQs','KJs','KTs','QJs','JTs','T9s','98s','87s','AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo'],
  SB:      ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','AKs','AQs','AJs','ATs','A9s','A8s','A5s','A4s','A3s','KQs','KJs','KTs','QJs','JTs','T9s','98s','87s','76s','AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo','QTo'],
  BB:      ['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22','AKs','AQs','AJs','ATs','A9s','A8s','A7s','A5s','A4s','A3s','A2s','KQs','KJs','KTs','K9s','QJs','QTs','JTs','T9s','98s','87s','76s','65s','AKo','AQo','AJo','ATo','A9o','A8o','KQo','KJo','KTo','QJo','QTo'],
}
const POSITIONS = Object.keys(GTO_RANGES)
const GTO_SETS  = Object.fromEntries(Object.entries(GTO_RANGES).map(([k,v])=>[k,new Set(v)]))

function comboKey(h) {
  const r1=h[0].slice(0,-1), s1=h[0].slice(-1)
  const r2=h[1].slice(0,-1), s2=h[1].slice(-1)
  if (r1===r2) return `${r1}${r1}`
  const suited = s1===s2
  return RANK_VAL[r1]>RANK_VAL[r2] ? `${r1}${r2}${suited?'s':'o'}` : `${r2}${r1}${suited?'s':'o'}`
}
function isInRange(hand, pos) { return GTO_SETS[pos]?.has(comboKey(hand)) ?? false }

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION LAYER
// ─────────────────────────────────────────────────────────────────────────────
function validateQ(q) {
  // 1. No duplicate cards
  const cards = [...(q.heroCards||[]), ...(q.boardCards||[])]
  if (new Set(cards).size !== cards.length) return false
  // 2. Exactly one correct answer
  const correct = q.options.filter(o => o.value === q.answer)
  if (correct.length !== 1) return false
  // 3. At least 1 wrong option (binary questions like raise/fold are valid)
  const wrong = q.options.filter(o => o.value !== q.answer)
  if (wrong.length < 1) return false
  // 4. Wrong answers close to correct (numeric questions only)
  if (typeof q.answer === 'number') {
    const tooFar = wrong.filter(o => Math.abs(o.value - q.answer) > 15)
    if (tooFar.length > 0) return false
  }
  return true
}

function safeGenerate(genFn, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const q = genFn()
      if (q && validateQ(q)) return q
    } catch (_) {}
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// SHUFFLE helpers
// ─────────────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]] }
  return a
}

/** Pick n unique items from arr, excluding 'exclude' values */
function pickWrong(pool, correct, n, distanceFn) {
  let candidates = pool.filter(x => x !== correct)
  if (distanceFn) candidates = candidates.sort((a,b) => distanceFn(a) - distanceFn(b))
  return shuffle(candidates).slice(0, n)
}

// ─────────────────────────────────────────────────────────────────────────────
// BEGINNER: OUTS QUESTIONS (weighted draw types)
// ─────────────────────────────────────────────────────────────────────────────
const DRAW_TYPES = [
  { type:'flush',    weight:35, outs:9  },
  { type:'oesd',     weight:35, outs:8  },
  { type:'gutshot',  weight:20, outs:4  },
  { type:'overcards',weight:10, outs:6  },
]

function pickDrawType() {
  const total = DRAW_TYPES.reduce((s,d)=>s+d.weight, 0)
  let r = Math.random()*total
  for (const d of DRAW_TYPES) { r -= d.weight; if (r <= 0) return d }
  return DRAW_TYPES[0]
}

function genFlushDrawSpot() {
  // Hero has 2 cards of suit X, board has 2 cards of suit X → flush draw
  const deck = new Deck()
  const suitPool = shuffle(['s','h','d','c'])
  const drawSuit = suitPool[0]
  // Hero: pick 2 cards of drawSuit
  const heroR1 = shuffle(ALL_RANKS)[0]
  const heroR2 = shuffle(ALL_RANKS.filter(r=>r!==heroR1))[0]
  const hero   = [heroR1+drawSuit, heroR2+drawSuit]
  // Simulate deck usage
  const deck2 = new Deck()
  hero.forEach(c => deck2._used.add(c))
  // Board: 2 of drawSuit + 1 random non-drawSuit
  const boardSuited1 = shuffle(ALL_RANKS.filter(r=>!hero.some(h=>h.startsWith(r))))[0] + drawSuit
  const boardSuited2 = shuffle(ALL_RANKS.filter(r=>!hero.some(h=>h.startsWith(r))&&!boardSuited1.startsWith(r)))[0] + drawSuit
  const offSuits = ['s','h','d','c'].filter(s=>s!==drawSuit)
  const boardOff = shuffle(ALL_RANKS)[0] + offSuits[Math.floor(Math.random()*offSuits.length)]
  const board = shuffle([boardSuited1, boardSuited2, boardOff])
  if (new Set([...hero,...board]).size !== 5) return null

  const outs = 9
  const wrongPool = [7, 8, 9, 10, 11, 12].filter(x=>x!==outs)
  const wrongs = shuffle(wrongPool).slice(0,3)
  const options = shuffle([
    { label:`${outs} outs`, value:outs },
    ...wrongs.map(w=>({ label:`${w} outs`, value:w })),
  ])
  return {
    heroCards:hero, boardCards:board,
    question:'How many outs do you have to complete your Flush by the river?',
    options, answer:outs,
    rationale:`You have 4 cards of the same suit. There are 13 − 4 = 9 flush cards remaining in the deck.`,
    formula:'Flush draw = 9 outs (13 suit cards − 4 visible)',
  }
}

function genOESDSpot() {
  // Create an OESD: 4 consecutive ranks, open on both ends
  const deck = new Deck()
  const startRank = 2 + Math.floor(Math.random()*8) // 2-9 so straight exists both ways
  const seqRanks  = [startRank, startRank+1, startRank+2, startRank+3]
  const rankNames = { 14:'A',13:'K',12:'Q',11:'J',10:'T',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2' }
  const toName = v => rankNames[v] || String(v)
  const suits = shuffle(['s','h','d','c','s','h','d','c']).slice(0,4)
  const four = seqRanks.map((r,i) => toName(r)+suits[i])
  if (new Set(four).size !== 4) return null
  // Split: 2 hero, 2 board
  const hero  = [four[0], four[1]]
  const board = [four[2], four[3], shuffle(['s','h','d','c'].map(s=>'2'+s).filter(c=>!four.includes(c)))[0]]
  if (!board[2]) return null
  if (new Set([...hero,...board]).size !== 5) return null

  const outs = 8
  const wrongs = shuffle([6,7,8,9,10,12].filter(x=>x!==outs)).slice(0,3)
  const options = shuffle([{label:`${outs} outs`,value:outs},...wrongs.map(w=>({label:`${w} outs`,value:w}))])
  return {
    heroCards:hero, boardCards:board,
    question:`How many outs do you have to make a Straight by the river?`,
    options, answer:outs,
    rationale:`Open-ended straight draw: you need one of 2 ranks on either end. Each rank has up to 4 cards = 8 outs total.`,
    formula:'OESD = 8 outs (4 cards × 2 ranks)',
  }
}

function genGutshot() {
  // 4 cards with one gap in the middle
  const startRank = 2 + Math.floor(Math.random()*7)
  const rankNames = { 14:'A',13:'K',12:'Q',11:'J',10:'T',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2' }
  const toName = v => rankNames[v] || String(v)
  // sequence with gap at position 2: e.g. 5,6,_,8,9 → pick 4 of them
  const full = [startRank, startRank+1, startRank+3, startRank+4]
  const suits = shuffle(['s','h','d','c','s','h','d']).slice(0,4)
  const four = full.map((r,i)=>toName(r)+suits[i])
  if (new Set(four).size !== 4) return null
  const hero  = [four[0], four[1]]
  const board = [four[2], four[3], toName(startRank+5 <= 14 ? startRank+5 : 2)+shuffle(['s','h','d','c'])[0]]
  if (new Set([...hero,...board]).size !== 5) return null

  const outs = 4
  const wrongs = shuffle([3,4,5,6,8].filter(x=>x!==outs)).slice(0,3)
  const options = shuffle([{label:`${outs} outs`,value:outs},...wrongs.map(w=>({label:`${w} outs`,value:w}))])
  return {
    heroCards:hero, boardCards:board,
    question:'How many outs do you have to complete your Gutshot Straight by the river?',
    options, answer:outs,
    rationale:`Gutshot (inside straight draw) needs one specific rank to fill the gap = 4 outs.`,
    formula:'Gutshot = 4 outs (only 1 rank fills the gap)',
  }
}

function genOvercardSpot() {
  // Hero has 2 overcards to board, can make pair
  const deck = new Deck()
  const bigRanks = ['A','K','Q','J']
  const heroR1 = shuffle(bigRanks)[0]
  const heroR2 = shuffle(bigRanks.filter(r=>r!==heroR1))[0]
  const hero   = [heroR1+shuffle(['s','h'])[0], heroR2+shuffle(['d','c'])[0]]
  // Board: 3 low cards, none matching hero ranks
  const lowRanks = ['2','3','4','5','6','7','8','9','T'].filter(r=>r!==heroR1&&r!==heroR2)
  const bRanks = shuffle(lowRanks).slice(0,3)
  const bSuits = shuffle(['s','h','d','c','s','h','d']).slice(0,3)
  const board  = bRanks.map((r,i)=>r+bSuits[i])
  if (new Set([...hero,...board]).size !== 5) return null

  const outs = 6 // 3 outs each overcard
  const wrongs = shuffle([4,5,6,7,8].filter(x=>x!==outs)).slice(0,3)
  const options = shuffle([{label:`${outs} outs`,value:outs},...wrongs.map(w=>({label:`${w} outs`,value:w}))])
  return {
    heroCards:hero, boardCards:board,
    question:'How many outs do you have to make Top Pair with one of your two overcards?',
    options, answer:outs,
    rationale:`${heroR1} has 3 remaining cards in the deck, ${heroR2} has 3 remaining = 6 outs to pair either overcard.`,
    formula:'Two overcards = 6 outs (3 + 3)',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BEGINNER: EQUITY QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────
const EQUITY_SPOTS = [
  { draw:'Flush draw (flop)',    outs:9, toGo:2, label:'30-35%', value:32, options:['20-25%','30-35%','45-50%','60-65%'] },
  { draw:'OESD (flop)',          outs:8, toGo:2, label:'30-35%', value:32, options:['15-20%','30-35%','45-50%','60-65%'] },
  { draw:'Flush draw (turn)',    outs:9, toGo:1, label:'18-20%', value:19, options:['8-10%','18-20%','30-35%','45-50%'] },
  { draw:'Gutshot (flop)',       outs:4, toGo:2, label:'15-18%', value:16, options:['5-8%','15-18%','25-30%','40-45%'] },
  { draw:'Combo draw (flop)',    outs:15,toGo:2, label:'50-55%', value:52, options:['25-30%','35-40%','50-55%','65-70%'] },
]

function genEquityQ() {
  const spot = EQUITY_SPOTS[Math.floor(Math.random()*EQUITY_SPOTS.length)]
  const deck  = new Deck()
  const hero  = deck.dealHand()
  const board = deck.dealBoard(spot.toGo===2?3:4)
  if (new Set([...hero,...board]).size !== hero.length+board.length) return null

  const correct = spot.label
  const options = shuffle(spot.options.map(l=>({ label:l, value:l })))
  if (options.filter(o=>o.value===correct).length !== 1) return null

  return {
    heroCards:hero, boardCards:board,
    question:`You have a ${spot.draw}. What is your approximate equity to improve by the river?`,
    options, answer:correct,
    rationale:`${spot.draw}: Rule of ${spot.toGo===2?4:2} → ${spot.outs}×${spot.toGo===2?4:2} ≈ ${spot.outs*(spot.toGo===2?4:2)}%. Standard approximation in 100bb Cash.`,
    formula:`${spot.outs} outs × ${spot.toGo===2?4:2} ≈ ${spot.outs*(spot.toGo===2?4:2)}%`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BEGINNER: HAND RANKING — exactly one stronger hand
// ─────────────────────────────────────────────────────────────────────────────
function genHandRankingQ() {
  // Pick a hand that has EXACTLY ONE hand that beats it (ranks 1–7 only)
  const targets = HAND_RANKS.filter(h => h.rank >= 1 && h.rank <= 7)
  const target  = targets[Math.floor(Math.random()*targets.length)]
  const beater  = HAND_RANKS.find(h => h.rank === target.rank + 1)
  if (!beater) return null

  // Wrong answers: weaker hands only — so still exactly 1 correct
  const weakerPool = HAND_RANKS.filter(h => h.rank < target.rank).map(h=>h.name)
  if (weakerPool.length < 3) return null
  const wrongs = shuffle(weakerPool).slice(0,3)

  const options = shuffle([
    { label:beater.name, value:beater.name },
    ...wrongs.map(w=>({ label:w, value:w })),
  ])
  // Validate: exactly one correct
  if (options.filter(o=>o.value===beater.name).length !== 1) return null

  return {
    heroCards:[], boardCards:[],
    question:`Which hand beats a ${target.name}? (Pick the next strongest)`,
    options, answer:beater.name,
    rationale:`${beater.name} (rank ${target.rank+1}) directly beats ${target.name} (rank ${target.rank}) in 100bb Cash.`,
    formula:`${beater.name} > ${target.name}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BEGINNER: POSITION NAMES
// ─────────────────────────────────────────────────────────────────────────────
const POS_INFO = [
  {short:'UTG',   full:'Under the Gun'},
  {short:'BTN',   full:'Button'},
  {short:'BB',    full:'Big Blind'},
  {short:'SB',    full:'Small Blind'},
  {short:'CO',    full:'Cutoff'},
  {short:'HJ',    full:'Hijack'},
  {short:'MP',    full:'Middle Position'},
  {short:'UTG+1', full:'Under the Gun +1'},
]

function genPositionNameQ() {
  const target = POS_INFO[Math.floor(Math.random()*POS_INFO.length)]
  const wrongs  = shuffle(POS_INFO.filter(p=>p.short!==target.short)).slice(0,3)
  const options = shuffle([
    { label:target.full, value:target.short },
    ...wrongs.map(p=>({ label:p.full, value:p.short })),
  ])
  return {
    heroCards:[], boardCards:[],
    question:`What does "${target.short}" stand for at a 9-max 100bb Cash table?`,
    options, answer:target.short,
    rationale:`${target.short} = ${target.full}. Positional awareness determines your preflop strategy.`,
    formula:'UTG → UTG+1 → MP → HJ → CO → BTN → SB → BB',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERMEDIATE: OPENING RANGE
// (weighted: 50% folds, 30% standard opens, 20% edge spots)
// ─────────────────────────────────────────────────────────────────────────────
const COMMON_POSITIONS = ['UTG','UTG+1','MP','HJ','CO','BTN'] // SB/BB less common opens

function genOpeningRangeQ() {
  const pos = COMMON_POSITIONS[Math.floor(Math.random()*COMMON_POSITIONS.length)]
  const deck = new Deck()
  const hero = deck.dealHand()
  const inR  = isInRange(hero, pos)
  const combo = comboKey(hero)

  const options = shuffle([
    { label:'Raise to 2.5bb', value:'raise' },
    { label:'Fold',           value:'fold'  },
  ])
  if (options.filter(o=>o.value===(inR?'raise':'fold')).length !== 1) return null

  return {
    heroCards:hero, boardCards:[], position:pos,
    question:`100bb Cash, 9-max. You're in ${pos}, folded to you. Standard action?`,
    options, answer:inR?'raise':'fold',
    rationale:inR
      ? `${combo} IS in the ${pos} 100bb Cash opening range — Raise to 2.5bb is standard.`
      : `${combo} is NOT in the ${pos} 100bb Cash range — Fold. Strength requirements are tight from early positions.`,
    formula:inR
      ? `${pos} range includes ${combo} → Open`
      : `${pos} range does NOT include ${combo} → Fold`,
    showRange:true, rangeHighlight:combo,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERMEDIATE: POT ODDS
// ─────────────────────────────────────────────────────────────────────────────
const POT_SCENARIOS = [
  { pot:100, bet:33,  label:'25%', options:['15%','20%','25%','33%'] },
  { pot:100, bet:50,  label:'25%', options:['17%','25%','33%','40%'] },
  { pot:100, bet:75,  label:'30%', options:['20%','25%','30%','40%'] },
  { pot:80,  bet:40,  label:'25%', options:['15%','20%','25%','33%'] },
  { pot:120, bet:60,  label:'25%', options:['17%','25%','33%','40%'] },
  { pot:100, bet:100, label:'33%', options:['20%','25%','33%','45%'] },
]

function genPotOddsQ() {
  const s = POT_SCENARIOS[Math.floor(Math.random()*POT_SCENARIOS.length)]
  // Compute real answer: bet / (pot + bet + call) = bet / (pot + 2*bet)
  const real = Math.round(s.bet/(s.pot+2*s.bet)*100)
  const correct = `${real}%`
  // Use the closest label from options as answer
  const options = shuffle(s.options.map(l=>({ label:l, value:l })))
  // Find which option is closest to real
  const bestOpt = s.options.reduce((best,cur)=>{
    const bv=parseInt(best), cv=parseInt(cur)
    return Math.abs(cv-real)<Math.abs(bv-real)?cur:best
  }, s.options[0])
  if (options.filter(o=>o.value===bestOpt).length !== 1) return null

  return {
    heroCards:[], boardCards:[],
    question:`Pot $${s.pot}, villain bets $${s.bet} (100bb Cash). What is the minimum equity you need to call profitably?`,
    options, answer:bestOpt,
    rationale:`You call $${s.bet} into a total pot of $${s.pot+2*s.bet}. Required equity = ${s.bet}/${s.pot+2*s.bet} ≈ ${real}%.`,
    formula:`${s.bet} / (${s.pot} + ${s.bet} + ${s.bet}) = ${real}%`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERMEDIATE: COMBO COUNTING
// ─────────────────────────────────────────────────────────────────────────────
const COMBO_SPOTS = [
  { hand:'AA',  combos:6,  formula:'C(4,2) = 6 — pairs use choose-2 formula' },
  { hand:'KK',  combos:6,  formula:'C(4,2) = 6' },
  { hand:'QQ',  combos:6,  formula:'C(4,2) = 6' },
  { hand:'AKs', combos:4,  formula:'4 suits × 1 suited combination = 4' },
  { hand:'AKo', combos:12, formula:'4 × 4 = 16 total − 4 suited = 12 offsuit' },
  { hand:'KQs', combos:4,  formula:'4 suits = 4 suited combos' },
  { hand:'KQo', combos:12, formula:'4 × 4 − 4 = 12 offsuit combos' },
]

function genComboQ() {
  const s = COMBO_SPOTS[Math.floor(Math.random()*COMBO_SPOTS.length)]
  const close = [s.combos-2, s.combos-1, s.combos, s.combos+2, s.combos+4].filter(x=>x>0&&x!==s.combos)
  const wrongs = shuffle(close).slice(0,3)
  const options = shuffle([
    { label:`${s.combos} combos`, value:s.combos },
    ...wrongs.map(w=>({ label:`${w} combos`, value:w })),
  ])
  if (options.filter(o=>o.value===s.combos).length !== 1) return null

  return {
    heroCards:[], boardCards:[],
    question:`How many possible starting hand combinations does ${s.hand} have in a standard 52-card deck?`,
    options, answer:s.combos,
    rationale:`${s.hand}: ${s.formula}.`,
    formula:s.formula,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED: BLUFF CANDIDATE
// ─────────────────────────────────────────────────────────────────────────────
function genBluffCandidateQ() {
  const deck = new Deck()
  const hero  = deck.dealHand()
  const board = deck.dealBoard(3)
  if (new Set([...hero,...board]).size !== 5) return null

  // Check flush draw: hero shares suit with 2+ board cards
  const hSuits = hero.map(c=>c.slice(-1))
  const bSuits = board.map(c=>c.slice(-1))
  const sc = {}
  ;[...hSuits,...bSuits].forEach(s=>sc[s]=(sc[s]||0)+1)
  const hasFlushDraw = hSuits.some(s => (sc[s]||0) >= 4)

  // Check OESD: 4 consecutive ranks among all 5 cards
  const vals = [...hero,...board].map(c=>RANK_VAL[c.slice(0,-1)]).sort((a,b)=>a-b)
  const uniq = [...new Set(vals)]
  let hasOESD = false
  for (let i=0; i<uniq.length-3; i++) if (uniq[i+3]-uniq[i]===3) { hasOESD=true; break }

  const isGood = hasFlushDraw || hasOESD
  const correctVal = isGood ? 'good' : 'poor'

  const opts = shuffle([
    { label:'Strong bluff — flush/straight draw gives equity backup', value:'good' },
    { label:'Poor bluff — no draw, no real equity',                   value:'poor' },
  ])

  // Validate: exactly one correct option
  if (opts.filter(o => o.value === correctVal).length !== 1) return null

  return {
    heroCards: hero, boardCards: board,
    question: 'Is this a good semi-bluff candidate on this flop? (100bb Cash)',
    options: opts,
    answer: correctVal,
    rationale: isGood
      ? `You have ${hasFlushDraw ? 'a flush draw (9 outs)' : 'an open-ended straight draw (8 outs)'} — semi-bluffing here has fold equity + draw equity. Ideal spot.`
      : 'No flush draw, no straight draw. Pure air bluffs with zero equity are -EV in 100bb Cash without a specific read.',
    formula: 'Semi-bluff EV = (fold%) × pot + (1−fold%) × (equity × pot)',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED: RANGE ADVANTAGE / C-BET DECISION
// ─────────────────────────────────────────────────────────────────────────────
function genRangeAdvantageQ() {
  const pos = ['UTG','UTG+1','CO','BTN'][Math.floor(Math.random()*4)]
  const deck = new Deck()
  const hero  = deck.dealHand()
  const board = deck.dealBoard(3)
  if (new Set([...hero,...board]).size !== 5) return null

  const inR  = isInRange(hero, pos)
  const combo = comboKey(hero)
  const opts = shuffle([
    { label:'Bet ~33% pot for thin value/protection', value:'bet'   },
    { label:'Check — no equity, no reason to bet',    value:'check' },
  ])
  const answer = inR ? 'bet' : 'check'
  if (opts.filter(o=>o.value===answer).length !== 1) return null

  return {
    heroCards:hero, boardCards:board, position:pos,
    question:`You opened ${pos}, BB called (100bb Cash). Flop is on you. ${combo} — what's your line?`,
    options:opts, answer,
    rationale:inR
      ? `${combo} is in your ${pos} range and has decent equity. Bet ~33% pot: builds the pot, denies equity, protects your hand.`
      : `${combo} is NOT in your ${pos} range — you're weak here. Check back to keep the pot small and avoid building a large pot with no equity.`,
    formula:inR?'Bet for value + protection (in range)':'Check back (out of range / air)',
    showRange:true, rangeHighlight:combo,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION BANK PER TIER (weighted)
// ─────────────────────────────────────────────────────────────────────────────
function getBeginnerQ() {
  const r = Math.random()
  if (r < 0.25) return safeGenerate(genFlushDrawSpot)   || safeGenerate(genEquityQ)
  if (r < 0.50) return safeGenerate(genOESDSpot)        || safeGenerate(genEquityQ)
  if (r < 0.65) return safeGenerate(genGutshot)         || safeGenerate(genHandRankingQ)
  if (r < 0.75) return safeGenerate(genOvercardSpot)    || safeGenerate(genEquityQ)
  if (r < 0.87) return safeGenerate(genHandRankingQ)    || safeGenerate(genPositionNameQ)
  return              safeGenerate(genPositionNameQ)    || safeGenerate(genEquityQ)
}

function getIntermediateQ() {
  const r = Math.random()
  if (r < 0.50) return safeGenerate(genOpeningRangeQ)
  if (r < 0.80) return safeGenerate(genPotOddsQ)
  return              safeGenerate(genComboQ)
}

function getAdvancedQ() {
  // Try each generator, fall back to the next if null
  const r = Math.random()
  if (r < 0.50) {
    return safeGenerate(genBluffCandidateQ)
        || safeGenerate(genRangeAdvantageQ)
        || safeGenerate(genOpeningRangeQ)
  }
  if (r < 0.80) {
    return safeGenerate(genRangeAdvantageQ)
        || safeGenerate(genBluffCandidateQ)
        || safeGenerate(genOpeningRangeQ)
  }
  return   safeGenerate(genOpeningRangeQ)
        || safeGenerate(genBluffCandidateQ)
        || safeGenerate(genRangeAdvantageQ)
}

const TIER_GEN = { beginner:getBeginnerQ, intermediate:getIntermediateQ, advanced:getAdvancedQ }

// ─────────────────────────────────────────────────────────────────────────────
// DAILY PROGRESS STORAGE
// ─────────────────────────────────────────────────────────────────────────────
const TODAY = () => new Date().toISOString().slice(0,10)

// ISO week key: e.g. "2026-W14"
function getWeekKey() {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`
}

function useDailyProgress() {
  const [data, setData] = useLocalStorage('quiz-daily-v2', {
    week:'', beginnerUsed:0, intermediateUsed:0, advancedUsed:0,
    beginnerBest:0, intermediateBest:0, advancedBest:0,
    streak:0, xp:0,
  })

  const thisWeek = getWeekKey()
  // Reset weekly counts only (preserve best scores, streak, xp)
  const safeData = data.week === thisWeek ? data : {
    ...data, week:thisWeek, beginnerUsed:0, intermediateUsed:0, advancedUsed:0,
  }

  const used      = t => safeData[`${t}Used`] || 0
  const best      = t => safeData[`${t}Best`] || 0
  const limit     = t => TIERS[t].daily
  const remaining = t => Math.max(0, limit(t) - used(t))
  const exhausted = t => remaining(t) <= 0

  const consume = (tier, correct, scoreThisSession) => {
    const newUsed   = (safeData[`${tier}Used`]||0) + 1
    const newBest   = Math.max(safeData[`${tier}Best`]||0, scoreThisSession)
    const xpGain    = correct ? (tier==='beginner'?5:tier==='intermediate'?10:18) : 0
    const newStreak = correct ? (safeData.streak||0)+1 : 0
    setData({
      ...safeData,
      [`${tier}Used`]:  newUsed,
      [`${tier}Best`]:  newBest,
      streak: newStreak,
      xp: (safeData.xp||0)+xpGain,
    })
  }

  const resetAll = () => setData({
    week:'', beginnerUsed:0, intermediateUsed:0, advancedUsed:0,
    beginnerBest:0, intermediateBest:0, advancedBest:0, streak:0, xp:0,
  })

  return { used, best, limit, remaining, exhausted, consume, resetAll, streak:safeData.streak||0, xp:safeData.xp||0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const SC = { s:'#111', h:'#cc2222', d:'#cc2222', c:'#111' }
const SL = { s:'♠', h:'♥', d:'♦', c:'♣' }

function PlayCard({ card, size='md' }) {
  const r=card.slice(0,-1), s=card.slice(-1)
  const d = size==='lg'?{w:'48px',h:'64px',rf:'1.1rem',sf:'0.95rem'}
    : size==='sm'?{w:'28px',h:'38px',rf:'0.62rem',sf:'0.55rem'}
    : {w:'38px',h:'52px',rf:'0.88rem',sf:'0.78rem'}
  return (
    <div style={{width:d.w,height:d.h,background:'#fff',borderRadius:'4px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 5px rgba(0,0,0,0.5)',flexShrink:0}}>
      <span style={{fontSize:d.rf,fontWeight:800,color:SC[s],lineHeight:1,letterSpacing:'-0.02em'}}>{r==='T'?'10':r}</span>
      <span style={{fontSize:d.sf,color:SC[s],lineHeight:1}}>{SL[s]}</span>
    </div>
  )
}

const RANKS13=['A','K','Q','J','T','9','8','7','6','5','4','3','2']
function RangeMatrix({ position, highlight }) {
  const rangeSet = GTO_SETS[position] || new Set()
  return (
    <div>
      <div style={{fontSize:'0.58rem',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:C.textMuted,marginBottom:'6px'}}>
        {position} 100bb Cash Opening Range
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(13,1fr)',gap:'2px'}}>
        {RANKS13.map((r1,i)=>RANKS13.map((r2,j)=>{
          let combo,type
          if(i===j){combo=`${r1}${r1}`;type='pair'}
          else if(i<j){combo=`${r1}${r2}s`;type='suited'}
          else{combo=`${r2}${r1}o`;type='offsuit'}
          const inR=rangeSet.has(combo)
          const isHL=highlight===combo
          return (
            <div key={combo} style={{
              aspectRatio:'1/1.1',borderRadius:'2px',
              background:inR?(type==='pair'?'rgba(84,233,138,0.55)':type==='suited'?'rgba(84,233,138,0.3)':'rgba(146,204,255,0.28)'):C.surfaceHi,
              border:isHL?'2px solid #ffffff':'1px solid transparent',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:'clamp(0.28rem,0.6vw,0.42rem)',fontWeight:inR?700:400,
              color:inR?(type==='pair'?'#061a0e':type==='suited'?C.primary:C.secondary):C.textMuted,
              boxSizing:'border-box',
            }}>{combo}</div>
          )
        }))}
      </div>
      <div style={{display:'flex',gap:'10px',marginTop:'5px',flexWrap:'wrap'}}>
        {[{bg:'rgba(84,233,138,0.55)',l:'Pairs'},{bg:'rgba(84,233,138,0.3)',l:'Suited'},{bg:'rgba(146,204,255,0.28)',l:'Offsuit'},{bg:'transparent',border:'2px solid #fff',l:'Current hand'}].map(x=>(
          <div key={x.l} style={{display:'flex',alignItems:'center',gap:'4px'}}>
            <div style={{width:'9px',height:'9px',borderRadius:'1px',background:x.bg,border:x.border||'none'}}/>
            <span style={{fontSize:'0.54rem',color:C.textMuted}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function useCountdown(seconds, active, onExpire) {
  const [left,setLeft]=useState(seconds)
  const ref=useRef(null)
  useEffect(()=>{
    setLeft(seconds)
    if(!active) return
    ref.current=setInterval(()=>{
      setLeft(p=>{if(p<=1){clearInterval(ref.current);onExpire();return 0}return p-1})
    },1000)
    return()=>clearInterval(ref.current)
  },[seconds,active])
  return left
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED PRE-CACHE — generate next Advanced question in background
// ─────────────────────────────────────────────────────────────────────────────
const advCache = { current: null, loading: false }

function preCacheAdvanced() {
  if (advCache.loading || advCache.current) return
  advCache.loading = true
  // Use setTimeout so it doesn't block render
  setTimeout(() => {
    try {
      advCache.current = getAdvancedQ()
    } catch (_) {}
    advCache.loading = false
  }, 0)
}

function consumeAdvCache() {
  const q = advCache.current
  advCache.current = null
  // Immediately start pre-caching next one
  preCacheAdvanced()
  return q
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ SESSION
// ─────────────────────────────────────────────────────────────────────────────
// Timer per tier
const TIMER_BY_TIER = { beginner: 20, intermediate: 60, advanced: 60 }

function QuizSession({ tier, remaining, onBack, onComplete, consume }) {
  // ── Freeze limit at session start — never changes reactively ────────────────
  const frozenLimit = useRef(remaining)
  const limit = frozenLimit.current

  const TIMER_SEC = TIMER_BY_TIER[tier] || 20
  const [qIdx,     setQIdx]     = useState(0)
  const [q,        setQ]        = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [streak,   setStreak]   = useState(0)
  const [done,     setDone]     = useState(false)
  const [timerOn,  setTimerOn]  = useState(false)

  const loadQ = useCallback(() => {
    setSelected(null)
    setTimerOn(false)
    setLoading(true)
    setQ(null)

    // Generate synchronously — all generators are fast (<5ms)
    // Use requestAnimationFrame so React flushes loading=true first, then shows question
    requestAnimationFrame(() => {
      const gen = TIER_GEN[tier]
      const newQ = gen()
      if (newQ) {
        setQ(newQ)
        setLoading(false)
        setTimerOn(true)
      } else {
        // Last resort fallback — should never happen with triple-fallback generators
        setLoading(false)
      }
    })
  }, [tier])

  useEffect(() => {
    loadQ()
  }, [])

  const handleTimeout = useCallback(() => {
    if (selected !== null) return
    setSelected('__timeout__')
    setTimerOn(false)
    consume(tier, false, score)
    setStreak(0)
  }, [selected, score])

  const timeLeft = useCountdown(TIMER_SEC, timerOn, handleTimeout)

  const handleAnswer = val => {
    if (selected !== null || !q) return
    setTimerOn(false)
    setSelected(val)
    const ok = val === q.answer
    const newScore  = score + (ok ? 1 : 0)
    const newStreak = ok ? streak + 1 : 0
    consume(tier, ok, newScore)
    setScore(newScore)
    setStreak(newStreak)
  }

  const handleNext = () => {
    if (qIdx + 1 >= limit) {
      setDone(true)
      onComplete(score + (selected === q?.answer ? 1 : 0))
      return
    }
    setQIdx(i => i + 1)
    loadQ()
  }

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (loading && !done) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'14px', padding:'40px 20px' }}>
      <div style={{
        width:'32px', height:'32px', borderRadius:'50%',
        border:`3px solid ${C.border}`, borderTopColor:C.primary,
        animation:'spin 0.8s linear infinite',
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:'0.78rem', color:C.textMuted }}>Generating question...</div>
      <button onClick={onBack} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:'8px', color:C.textMuted, padding:'8px 16px', cursor:'pointer', fontSize:'0.78rem' }}>
        ← Back
      </button>
    </div>
  )

  // ── Done screen ────────────────────────────────────────────────────────────
  if (done) {
    const finalScore = score
    const pct = limit > 0 ? Math.round((finalScore/limit)*100) : 0
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'14px', alignItems:'center', textAlign:'center', padding:'16px 0' }}>
        <Trophy size={36} color={C.primary}/>
        <div style={{ fontSize:'2rem', fontWeight:700, color:C.primary, letterSpacing:'-0.02em' }}>{finalScore}/{limit}</div>
        <div style={{ fontSize:'0.82rem', color:C.textMuted }}>
          {pct >= 80 ? 'Excellent! Sharp instincts.' : pct >= 60 ? 'Good work. Keep drilling.' : 'Keep going — you\'ll improve!'}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <Flame size={14} color={streak >= 3 ? '#ff7c2a' : C.textMuted}/>
          <span style={{ fontSize:'0.78rem', color:streak >= 3 ? '#ff7c2a' : C.textMuted, fontWeight:600 }}>Streak: {streak}</span>
        </div>
        {/* Free users: no Play Again — show CTA */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ padding:'10px 14px', borderRadius:'8px', background:C.primaryDim, border:`1px solid ${C.primaryBorder}`, fontSize:'0.72rem', color:C.primary, textAlign:'center' }}>
            You completed today's {limit} {TIERS[tier].label} questions.
          </div>
          <button style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'12px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#ffd4a0,#ffc0ac,#e8906a)', color:'#2a1000', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', minHeight:'44px' }}>
            <Lock size={13}/> Upgrade to Pro → Unlimited Questions
          </button>
          <button onClick={onBack} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'11px', borderRadius:'8px', border:'none', background:C.surfaceHigh, color:C.textMuted, fontWeight:600, fontSize:'0.82rem', cursor:'pointer', minHeight:'44px' }}>
            <ArrowLeft size={14}/> ← Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!q) return null

  const isTO    = selected === '__timeout__'
  const isRight = !isTO && selected === q.answer

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',padding:'4px',display:'flex',alignItems:'center'}}><ArrowLeft size={16}/></button>
        <div style={{flex:1}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
            <span style={{fontSize:'0.6rem',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:C.textMuted}}>{TIERS[tier].label} · {qIdx+1}/{limit}</span>
            <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
              <Clock size={11} color={timeLeft<=5?C.red:C.textMuted}/>
              <span style={{fontSize:'0.7rem',fontWeight:700,color:timeLeft<=5?C.red:C.textMuted,fontVariantNumeric:'tabular-nums'}}>{timeLeft}s</span>
            </div>
          </div>
          {/* Timer bar */}
          <div style={{height:'3px',background:C.border,borderRadius:'2px',overflow:'hidden',marginBottom:'3px'}}>
            <div style={{width:`${(timeLeft/TIMER_SEC)*100}%`,height:'100%',background:timeLeft<=5?C.red:C.primary,borderRadius:'2px',transition:'width 1s linear'}}/>
          </div>
          {/* Progress bar */}
          <div style={{height:'3px',background:C.border,borderRadius:'2px',overflow:'hidden'}}>
            <div style={{width:`${(qIdx/limit)*100}%`,height:'100%',background:C.secondary,borderRadius:'2px',transition:'width 0.3s'}}/>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
          <Flame size={13} color={streak>=3?'#ff7c2a':C.textMuted}/>
          <span style={{fontSize:'0.75rem',fontWeight:700,color:streak>=3?'#ff7c2a':C.textMuted}}>{streak}</span>
        </div>
      </div>

      {/* Cards */}
      {(q.heroCards.length>0||q.boardCards.length>0)&&(
        <div style={{background:C.surfaceHigh,borderRadius:'10px',padding:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
          {q.heroCards.length>0&&(
            <div>
              <div style={{fontSize:'0.5rem',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:C.textMuted,marginBottom:'5px'}}>Your hand</div>
              <div style={{display:'flex',gap:'6px'}}>{q.heroCards.map(c=><PlayCard key={c} card={c} size='md'/>)}</div>
            </div>
          )}
          {q.boardCards.length>0&&(
            <div>
              <div style={{fontSize:'0.5rem',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:C.textMuted,marginBottom:'5px'}}>Board</div>
              <div style={{display:'flex',gap:'4px',flexWrap:'nowrap'}}>{q.boardCards.map(c=><PlayCard key={c} card={c} size='sm'/>)}</div>
            </div>
          )}
          {q.position&&<div style={{fontSize:'0.68rem',color:C.secondary,fontWeight:600}}>Position: {q.position}</div>}
        </div>
      )}

      {/* Question */}
      <div style={{fontSize:'0.88rem',fontWeight:500,color:C.text,lineHeight:1.55}}>{q.question}</div>

      {/* Options */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
        {q.options.map((opt,i)=>{
          const isThis=selected===opt.value
          const correct=opt.value===q.answer
          let bg=C.surfaceHigh,border=`1px solid ${C.border}`,col=C.text
          if(selected!==null){
            if(correct){bg='rgba(84,233,138,0.12)';border=`1px solid rgba(84,233,138,0.4)`;col=C.primary}
            else if(isThis){bg='rgba(244,112,103,0.12)';border=`1px solid rgba(244,112,103,0.4)`;col=C.red}
          }
          return (
            <button key={i} onClick={()=>handleAnswer(opt.value)} disabled={selected!==null} style={{
              padding:'11px 8px',borderRadius:'8px',border,background:bg,color:col,
              fontWeight:600,fontSize:'0.82rem',cursor:selected!==null?'default':'pointer',
              transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',
              gap:'5px',minHeight:'44px',lineHeight:1.3,textAlign:'center',
            }}>
              {selected!==null&&correct&&<CheckCircle size={12}/>}
              {selected!==null&&isThis&&!correct&&<XCircle size={12}/>}
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Timeout */}
      {isTO&&<div style={{padding:'10px 12px',borderRadius:'8px',background:'rgba(244,112,103,0.08)',border:`1px solid rgba(244,112,103,0.25)`,fontSize:'0.78rem',color:C.red,fontWeight:600}}>⏱ Time's up! Streak reset.</div>}

      {/* Explanation + Next (only after answering) */}
      {selected!==null&&(
        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
          <div style={{padding:'11px 12px',borderRadius:'8px',background:isRight?'rgba(84,233,138,0.07)':'rgba(244,112,103,0.07)',border:`1px solid ${isRight?'rgba(84,233,138,0.2)':'rgba(244,112,103,0.2)'}`}}>
            <div style={{fontSize:'0.75rem',color:C.text,lineHeight:1.6,marginBottom:'6px',fontWeight:500}}>{q.rationale}</div>
            <div style={{fontFamily:'monospace',fontSize:'0.7rem',color:isRight?C.primary:C.tertiary,background:C.surfaceHigh,padding:'5px 8px',borderRadius:'5px',display:'inline-block'}}>{q.formula}</div>
          </div>
          {q.showRange&&q.position&&(
            <div style={{background:C.surfaceHigh,borderRadius:'10px',padding:'10px'}}>
              <RangeMatrix position={q.position} highlight={q.rangeHighlight}/>
            </div>
          )}
          <button onClick={handleNext} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'12px',borderRadius:'8px',border:'none',background:'linear-gradient(135deg,#67f09a,#54e98a,#2db866)',color:'#061a0e',fontWeight:700,fontSize:'0.82rem',cursor:'pointer',minHeight:'44px',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18),0 0 14px rgba(84,233,138,0.2)'}}>
            {qIdx+1>=limit?'See Results':'Next Question →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CARD
// ─────────────────────────────────────────────────────────────────────────────
function DashboardCard({ tierId, remaining, used, limit, best, onStart }) {
  const t        = TIERS[tierId]
  const col      = `rgb(${t.color})`
  const pct      = Math.round(((limit - remaining) / limit) * 100)
  const complete = remaining <= 0
  const inProg   = used > 0 && !complete
  const isLocked = tierId !== 'beginner' && complete // non-free tiers lock on exhaustion

  const badgeLabel = tierId === 'beginner' ? 'Free' : tierId === 'intermediate' ? '3/day' : '2/day'

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${complete ? C.border : C.borderHi}`,
      borderRadius:'12px', padding:'16px',
      opacity: isLocked ? 0.85 : 1,
    }}>
      {/* Top row */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'10px' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'0.95rem', fontWeight:700, color:complete ? C.textMuted : C.text }}>{t.label}</span>
            <span style={{ fontSize:'0.52rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', padding:'2px 7px', borderRadius:'10px', background:`rgba(${t.color},0.15)`, color:col }}>
              {badgeLabel}
            </span>
          </div>
          <div style={{ fontSize:'0.68rem', color:C.textMuted, lineHeight:1.4, marginBottom:'6px' }}>{t.topics}</div>
          {best > 0 && (
            <div style={{ fontSize:'0.6rem', color:C.textMuted, opacity:0.7 }}>Best today: {best}/{limit}</div>
          )}
        </div>
        <div style={{ textAlign:'right', flexShrink:0, marginLeft:'12px' }}>
          <div style={{ fontSize:'1.5rem', fontWeight:700, letterSpacing:'-0.02em', color:complete ? C.textMuted : col, fontVariantNumeric:'tabular-nums' }}>{remaining}</div>
          <div style={{ fontSize:'0.55rem', color:C.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>/{limit} left</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:'4px', background:C.border, borderRadius:'2px', overflow:'hidden', marginBottom:'12px' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:complete ? C.textMuted : col, borderRadius:'2px', transition:'width 0.3s' }}/>
      </div>

      {/* CTA */}
      {complete ? (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ padding:'10px', borderRadius:'8px', background:C.surfaceHigh, textAlign:'center', fontSize:'0.75rem', color:C.textMuted, fontWeight:500 }}>
            ✓ Completed this week — resets next Monday
          </div>
          <button style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'11px', borderRadius:'8px', border:'none', background:'linear-gradient(135deg,#ffd4a0,#ffc0ac,#e8906a)', color:'#2a1000', fontWeight:700, fontSize:'0.78rem', cursor:'pointer', minHeight:'44px' }}>
            <Lock size={13}/> Upgrade for Unlimited Access →
          </button>
        </div>
      ) : (
        <button
          onClick={onStart}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
            padding:'12px', borderRadius:'8px', border:'none',
            background: t.btnBg,
            color: t.btnColor,
            fontWeight:700, fontSize:'0.82rem', cursor:'pointer', minHeight:'44px',
            boxShadow:`inset 0 1px 0 rgba(255,255,255,0.18), 0 0 14px rgba(${t.color},0.22)`,
          }}
        >
          {inProg ? `Resume ${t.label} (${used}/${limit})` : `Start ${t.label}`} →
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN QUIZ PAGE
// ─────────────────────────────────────────────────────────────────────────────
const LEVELS=[{xp:0,l:'Novice'},{xp:50,l:'Regular'},{xp:150,l:'Grinder'},{xp:350,l:'Shark'},{xp:700,l:'Crusher'},{xp:1200,l:'GTO Pro'}]
function getLevel(xp){let lv=0;for(let i=0;i<LEVELS.length;i++)if(xp>=LEVELS[i].xp)lv=i;return{...LEVELS[lv],next:LEVELS[lv+1]}}

export default function Quiz() {
  const dp = useDailyProgress()
  const [activeTier, setActiveTier] = useState(null)
  const [sessionKey, setSessionKey] = useState(0)

  // Dev reset
  useEffect(()=>{
    window.resetQuizLimit = () => { dp.resetAll(); window.location.reload() }
    console.log('%c[QuizDev] window.resetQuizLimit() → resets all daily limits + XP','color:#54e98a;font-weight:bold')
  },[])

  const lv = getLevel(dp.xp)
  const progress = lv.next ? ((dp.xp-lv.xp)/(lv.next.xp-lv.xp))*100 : 100

  if (activeTier) {
    return (
      <div style={{padding:'16px',paddingBottom:'120px',maxWidth:'720px',margin:'0 auto',paddingTop:'20px'}}>
        <QuizSession
          key={`${activeTier}-${sessionKey}`}
          tier={activeTier}
          remaining={dp.remaining(activeTier)}
          onBack={()=>setActiveTier(null)}
          onComplete={()=>setActiveTier(null)}
          consume={dp.consume}
        />
      </div>
    )
  }

  return (
    <div style={{padding:'16px',paddingBottom:'120px',maxWidth:'720px',margin:'0 auto',paddingTop:'20px'}}>
      <div style={{marginBottom:'16px'}}>
        <h1 style={{fontSize:'1.3rem',fontWeight:700,color:C.text,letterSpacing:'-0.02em',marginBottom:'4px'}}>Quiz</h1>
        <p style={{fontSize:'0.72rem',color:C.textMuted}}>Daily poker training · 100bb Cash · 9-max</p>
      </div>

      {/* XP + Streak */}
      <div style={{background:C.surfaceHigh,borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
            <span style={{fontSize:'0.62rem',fontWeight:700,color:C.primary}}>{lv.l}</span>
            <span style={{fontSize:'0.62rem',color:C.textMuted}}>{dp.xp} XP</span>
          </div>
          <div style={{height:'5px',background:C.border,borderRadius:'3px',overflow:'hidden'}}>
            <div style={{width:`${Math.min(100,progress)}%`,height:'100%',background:C.primary,borderRadius:'3px',transition:'width 0.4s'}}/>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'4px',flexShrink:0}}>
          <Flame size={14} color={dp.streak>=3?'#ff7c2a':C.textMuted}/>
          <span style={{fontSize:'0.82rem',fontWeight:700,color:dp.streak>=3?'#ff7c2a':C.textMuted}}>{dp.streak}</span>
        </div>
      </div>

      {/* Tier cards */}
      <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
        {['beginner','intermediate','advanced'].map(t=>(
          <DashboardCard
            key={t} tierId={t}
            remaining={dp.remaining(t)} used={dp.used(t)}
            limit={dp.limit(t)} best={dp.best(t)}
            onStart={()=>{ setSessionKey(k=>k+1); setActiveTier(t) }}
          />
        ))}
      </div>
    </div>
  )
}
