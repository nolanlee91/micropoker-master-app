import { describe, it, expect } from 'vitest'
import { DRILL_META, buildDrillQueue, isDrillable, randomHardSpot } from './drills'
import { LEAK_LABELS } from './leaks'

// COVERAGE GUARD: every real leak the Coach can output must have a drill. If anyone
// adds a new leak_category (in leaks.js / coach.js) without a drill, this fails —
// so a leak can never ship with no way to practise it.
describe('drill coverage', () => {
  for (const leak of Object.keys(LEAK_LABELS)) {
    if (leak === 'no_clear_leak') continue
    it(`${leak} has a drill`, () => { expect(isDrillable(leak)).toBe(true) })
  }
})

// Hand-authored spots are easy to fat-finger a duplicate card into. Scan every
// curated bank spot: hero+board must be distinct, valid cards.
describe('curated spots have no duplicate cards', () => {
  const RE = /^(?:10|[2-9TJQKA])[shdc]$/i
  for (const [leak, meta] of Object.entries(DRILL_META)) {
    if (!meta.bank) continue
    it(`${leak}: every spot uses distinct valid cards`, () => {
      meta.bank.forEach((s, i) => {
        const cards = [...s.heroCards, ...s.boardCards]
        cards.forEach(c => expect(RE.test(c), `${leak}[${i}] bad card ${c}`).toBe(true))
        expect(new Set(cards).size, `${leak}[${i}] has a duplicate card`).toBe(cards.length)
      })
    })
  }
})

describe('hard spot pool', () => {
  it('randomHardSpot returns a valid spot with one correct option', () => {
    for (let i = 0; i < 30; i++) {
      const s = randomHardSpot()
      expect(typeof s.question).toBe('string')
      expect(s.options.filter(o => o.value === s.answer).length).toBe(1)
    }
  })
})

// Each leak's drill must actually yield a full queue (the correct-by-construction
// constraints must not be so tight that the generator starves) and every question
// must have a valid shape with exactly one correct option.
describe('leak drills', () => {
  for (const leak of Object.keys(DRILL_META)) {
    it(`${leak}: builds a full 6-question queue of valid spots`, () => {
      expect(isDrillable(leak)).toBe(true)
      const q = buildDrillQueue(leak, 6)
      expect(q.length).toBe(6)
      for (const item of q) {
        expect(typeof item.question).toBe('string')
        expect(item.question.length).toBeGreaterThan(0)
        expect(Array.isArray(item.options)).toBe(true)
        expect(item.options.length).toBeGreaterThanOrEqual(2)
        // the answer must match exactly one option value
        expect(item.options.filter(o => o.value === item.answer).length).toBe(1)
        expect(typeof item.rationale).toBe('string')
      }
    })
  }

  it('unknown leak is not drillable and yields an empty queue', () => {
    expect(isDrillable('no_clear_leak')).toBe(false)
    expect(buildDrillQueue('no_clear_leak', 6)).toEqual([])
  })
})
