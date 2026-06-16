// Aggregate AI-analyzed hands into ranked recurring leaks.
// This is the moat: ChatGPT scores one hand and forgets; we accumulate across
// hands and surface the pattern that is costing the most money.
//
// A leak only counts as "recurring" when it shows up in ≥2 hands with a net
// negative EV — a single bad hand is variance, not a leak.
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
    .filter(g => g.totalEv < 0 && g.count >= 2)
    .map(g => ({
      ...g,
      // Confidence grows with sample size — a 2-hand leak is a hint, not a verdict.
      confidence: g.count >= 5 ? 'High' : g.count >= 3 ? 'Medium' : 'Low',
    }))
    .sort((a, b) => a.totalEv - b.totalEv) // most negative (most costly) first
}

// How many hands have actually been AI-analyzed (drives the progressive reveal).
export function analyzedCount(hands) {
  return (hands || []).filter(h => h.leakCategory || h.aiAnalysis).length
}
