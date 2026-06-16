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
