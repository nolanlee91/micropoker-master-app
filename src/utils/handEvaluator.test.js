import { describe, it, expect } from 'vitest'
import { evaluateHeroHand } from './handEvaluator'

// handEvaluator is the deterministic source of truth the AI Coach is forced to copy
// (never trust the model to read its own cards). These tests pin that contract:
// the public evaluateHeroHand(hole, board) → { heroHandStrength, bestFiveCards,
// boardTexture, contextLevel }.
const strength = (hole, board) => evaluateHeroHand(hole, board).heroHandStrength

describe('made hands (7-card best-of)', () => {
  it('royal flush', () => {
    expect(strength(['Ah', 'Kh'], ['Qh', 'Jh', 'Th'])).toBe('Royal Flush')
  })
  it('straight flush (not royal)', () => {
    expect(strength(['9h', '8h'], ['7h', '6h', '5h'])).toBe('Straight Flush, Nine high')
  })
  it('four of a kind', () => {
    expect(strength(['As', 'Ah'], ['Ad', 'Ac', '2h'])).toBe('Four of a Kind, Aces')
  })
  it('full house — names trips before pair', () => {
    expect(strength(['Ks', 'Kh'], ['Kd', '2c', '2h'])).toBe('Full House, Kings full of Twos')
  })
  it('flush', () => {
    expect(strength(['Ah', '5h'], ['Kh', '9h', '2h'])).toBe('Flush, Ace high')
  })
  it('three of a kind', () => {
    expect(strength(['Qs', 'Qh'], ['Qd', '7c', '2h'])).toBe('Three of a Kind, Queens')
  })
  it('two pair — higher pair first', () => {
    expect(strength(['Ah', 'Kd'], ['Ac', 'Ks', '2h'])).toBe('Two Pair, Aces and Kings')
  })
  it('one pair — reports kicker', () => {
    expect(strength(['Ah', 'Kd'], ['As', '7c', '2h'])).toBe('One Pair, Aces, King kicker')
  })
  it('high card', () => {
    expect(strength(['Ah', 'Qd'], ['9s', '7c', '2h'])).toBe('High Card, Ace')
  })
})

describe('straight edge cases', () => {
  it('wheel A-2-3-4-5 is a 5-high straight', () => {
    expect(strength(['Ah', '2d'], ['3c', '4s', '5h'])).toBe('Straight, Wheel (A-2-3-4-5)')
  })
  it('broadway A-K-Q-J-T', () => {
    expect(strength(['Ah', 'Kd'], ['Qc', 'Js', 'Th'])).toBe('Straight, Broadway (A-K-Q-J-T)')
  })
  it('K-A-2-3-4 does NOT wrap into a straight', () => {
    // Ace cannot be both high and low — this is just Ace high.
    expect(strength(['Ah', 'Kd'], ['2c', '3s', '4h'])).toBe('High Card, Ace')
  })
})

describe('ranking precedence (the moat — must classify the BEST 5)', () => {
  it('flush beats a co-existing straight', () => {
    // Board+hole contain both a J-high straight (7-8-9-T-J) and a J-high heart flush.
    // The flush is the stronger hand and must win.
    expect(strength(['2h', '7h'], ['9h', 'Jh', 'Th', '8c'])).toBe('Flush, Jack high')
  })
  it('straight flush beats a plain flush', () => {
    expect(strength(['9h', '8h'], ['7h', '6h', '5h', '2h'])).toBe('Straight Flush, Nine high')
  })
  it('uses board pairs to make a full house from 7 cards', () => {
    expect(strength(['Ah', 'Kd'], ['As', 'Ad', '5c', '5h', '2s'])).toBe('Full House, Aces full of Fives')
  })
})

describe('preflop / incomplete input', () => {
  it('pocket pair', () => {
    const r = evaluateHeroHand(['Ah', 'As'], [])
    expect(r.heroHandStrength).toBe('Pocket Aces')
    expect(r.contextLevel).toBe('preflop')
  })
  it('two unpaired cards', () => {
    expect(strength(['Ah', 'Kd'], [])).toBe('Ace-King high (preflop)')
  })
  it('missing a hole card', () => {
    const r = evaluateHeroHand(['Ah'], ['Kd', 'Qc'])
    expect(r.heroHandStrength).toBe('Unknown — missing hole cards')
    expect(r.contextLevel).toBe('limited')
  })
})

describe('board texture', () => {
  const tex = (board) => evaluateHeroHand(['Ah', 'Kd'], board).boardTexture
  it('paired board', () => {
    expect(tex(['7h', '7d', '2c']).paired).toBe(true)
  })
  it('flush possible with 3 of a suit', () => {
    expect(tex(['Qh', '9h', '2h']).flushPossible).toBe(true)
  })
  it('straight possible on connected board', () => {
    expect(tex(['9h', 'Tc', 'Jd']).straightPossible).toBe(true)
  })
  it('dry board', () => {
    const t = tex(['2h', '7d', 'Kc'])
    expect(t.paired).toBe(false)
    expect(t.flushPossible).toBe(false)
    expect(t.straightPossible).toBe(false)
    expect(t.description).toBe('dry')
  })
})

describe('parsing robustness', () => {
  it('is case-insensitive and accepts T for ten', () => {
    expect(strength(['ah', 'kh'], ['qh', 'jh', 'th'])).toBe('Royal Flush')
  })
  it('drops invalid cards (treated as missing)', () => {
    expect(evaluateHeroHand(['Ah', 'Xx'], []).heroHandStrength).toBe('Unknown — missing hole cards')
  })
})
