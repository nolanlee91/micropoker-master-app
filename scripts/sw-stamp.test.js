import { describe, it, expect } from 'vitest'
import { makeBuildId, stampServiceWorker } from './sw-stamp.mjs'

describe('sw-stamp', () => {
  it('replaces the __SW_VERSION__ placeholder', () => {
    const out = stampServiceWorker("const VERSION = '__SW_VERSION__'", 'mpm-xyz')
    expect(out).toBe("const VERSION = 'mpm-xyz'")
    expect(out).not.toContain('__SW_VERSION__')
  })

  it('two consecutive builds produce DIFFERENT sw.js (so every deploy is detectable)', () => {
    const a = makeBuildId()
    const b = makeBuildId()
    expect(a).not.toBe(b)
    const src = "const VERSION = '__SW_VERSION__'"
    expect(stampServiceWorker(src, a)).not.toBe(stampServiceWorker(src, b))
  })

  it('same millisecond still yields distinct ids (random suffix)', () => {
    const a = makeBuildId(1000, 0.1111)
    const b = makeBuildId(1000, 0.2222)
    expect(a).not.toBe(b)
  })
})
