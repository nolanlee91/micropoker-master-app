// Human labels for each leak category (shared by AICoach nudge + Leak Profile).
export const LEAK_LABELS = {
  river_call_too_wide: 'River Call Too Wide',
  turn_call_too_wide:  'Turn Call Too Wide',
  overbluff:           'Overbluff',
  missed_value:        'Missed Value',
  passive_play:        'Passive Play',
  bad_preflop:         'Bad Preflop',
  overpair_overplay:   'Overpair Overplay',
  top_pair_overplay:   'Top Pair Overplay',
  draw_chasing:        'Draw Chasing',
  no_clear_leak:       'No Clear Leak',
}

// Aggregate AI-analyzed hands into ranked leaks (most money lost first).
// This is the moat: ChatGPT scores one hand and forgets; we accumulate across
// hands and surface what's costing the most. Every negative-EV category is shown
// so the profile isn't empty after a few mistakes; a category seen in ≥2 hands is
// flagged `recurring` (a true pattern vs one-off variance).
export function computeLeaks(hands) {
  const valid = (hands || []).filter(
    h => h.evImpact != null && h.leakCategory && h.leakCategory !== 'no_clear_leak'
  )
  const groups = {}
  for (const h of valid) {
    if (!groups[h.leakCategory]) {
      groups[h.leakCategory] = { category: h.leakCategory, totalEv: 0, count: 0 }
    }
    groups[h.leakCategory].totalEv += h.evImpact
    groups[h.leakCategory].count++
  }
  return Object.values(groups)
    .filter(g => g.totalEv < 0)
    .map(g => ({
      ...g,
      // recurring = a real pattern (≥2 hands), not one-off variance. This is the moat.
      recurring:  g.count >= 2,
      confidence: g.count >= 5 ? 'High' : g.count >= 3 ? 'Medium' : 'Low',
    }))
    .sort((a, b) => a.totalEv - b.totalEv) // most negative (most costly) first
}

// Count of leaks that are actually recurring (≥2 hands) — for the moat-framed prompt.
export function recurringCount(leaks) {
  return (leaks || []).filter(l => l.recurring).length
}

// How many hands have actually been AI-analyzed (drives the progressive reveal).
export function analyzedCount(hands) {
  return (hands || []).filter(h => h.leakCategory || h.aiAnalysis).length
}

// Hands needed to unlock the full Leak Profile. GROWTH-4: lowered from 5 → 3 on
// direct cash-player feedback — a weekend live grinder logs ~2-3 notable hands a
// session, so 5 meant waiting weeks to see any value. The small-sample honesty
// caveats (early-read banner, "patterns taking shape" preview) keep 3 from
// overclaiming.
export const UNLOCK_HANDS = 3

// Minimum analyzed hands before a trend means anything (≥5 per window). Below this
// the two halves are too small and the trend is just noise.
export const TREND_MIN_HANDS = 10

// Per-leak trend: is a leak showing up MORE or LESS in your recent analyzed hands vs
// your earlier ones? This is the retention hook (RISK-4) — proof a leak is actually
// shrinking, not just a static fix tip. Splits analyzed hands by date into an earlier
// and a recent half and compares how often each leak appears. Count-based (not EV,
// which is noisy). Returns {} below TREND_MIN_HANDS so callers never show noise.
export function computeLeakTrends(hands) {
  const valid = (hands || [])
    .filter(h => h.evImpact != null && h.leakCategory && h.leakCategory !== 'no_clear_leak')
    .slice()
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
  if (valid.length < TREND_MIN_HANDS) return {}
  const mid = Math.floor(valid.length / 2)
  const countBy = (arr) => {
    const m = {}
    for (const h of arr) m[h.leakCategory] = (m[h.leakCategory] || 0) + 1
    return m
  }
  const earlier = countBy(valid.slice(0, mid))
  const recent  = countBy(valid.slice(mid))
  const out = {}
  for (const c of new Set([...Object.keys(earlier), ...Object.keys(recent)])) {
    const ec = earlier[c] || 0, rc = recent[c] || 0
    out[c] = { trend: rc < ec ? 'improving' : rc > ec ? 'worsening' : 'steady', earlierCount: ec, recentCount: rc }
  }
  return out
}
