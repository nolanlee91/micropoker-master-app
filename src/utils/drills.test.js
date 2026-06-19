import { describe, it, expect } from 'vitest'
import { DRILL_META, buildDrillQueue, isDrillable } from './drills'

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
