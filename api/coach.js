export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, isHandAnalysis, gameType, playerType, language } = req.body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided' })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  const gameContext  = gameType  || 'Live Cash'
  const villainType  = playerType || 'Unknown'
  const responseLang = language   || 'English'

  const langGuide = {
    English:    '',
    Vietnamese: 'IMPORTANT: Write all text values in Vietnamese. Only translate text fields: summary, biggestMistake, whyWrong, betterLine. Do NOT translate JSON keys or enum values (leak_category, confidence, mistakeType, gameTypeUsed, villainTypeUsed must stay in English).',
    Chinese:    'IMPORTANT: Write all text values in Simplified Chinese. Only translate text fields: summary, biggestMistake, whyWrong, betterLine. Do NOT translate JSON keys or enum values (leak_category, confidence, mistakeType, gameTypeUsed, villainTypeUsed must stay in English).',
  }

  const gameGuide = {
    'Live Cash':   'Live Cash: population underbluffs, especially large river bets. Weight villain\'s range toward value. Bet sizing is often polarized and clumsy. Exploit passive tendencies.',
    'Online Cash': 'Online Cash: population is more aggressive and balanced. River overbets can be bluffs. Assume more solver-aware lines. GTO deviations are smaller.',
    'MTT':         'MTT: stack depth and ICM matter. Factor tournament life into close spots. Near the bubble or final table, tighten up marginal calls. Short stacks = push/fold range.',
  }

  const villainGuide = {
    'Unknown': 'Villain type unknown: use population defaults.',
    'Nit':     'Nit: extremely tight range. 3-bets and large bets are almost always value. Bluff rarely. Fold to aggression is usually correct.',
    'TAG':     'TAG: solid balanced range. Respect aggression but do not over-fold. Look for thin value and well-timed bluffs.',
    'LAG':     'LAG: wide range, high bluff frequency. Call down wider on boards that miss their range. Do not over-fold to river bets.',
    'Fish':    'Fish: wide calls, passive mistakes, very unbalanced range. Do not bluff. Bet thin for value. They rarely fold made hands.',
    'Rec':     'Rec: recreational player, wide and passive. Value-bet relentlessly. Bluffing is low EV. They call too wide but rarely raise as bluffs.',
  }

  const LEAK_CATEGORIES = [
    'river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value',
    'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay',
    'draw_chasing', 'no_clear_leak',
  ]

  const systemText = isHandAnalysis
    ? `You are a sharp poker coach. Analyze the hand.

CRITICAL: Return ONLY a JSON object. No text before or after it. No markdown. No code fences. No backticks.

Required format:
{
  "summary": "One blunt verdict sentence",
  "biggestMistake": "The main error in one direct sentence",
  "mistakeType": "overcall OR overbet OR underbet OR bad_bluff OR wrong_fold OR bad_sizing OR missed_value OR correct",
  "leak_category": "${LEAK_CATEGORIES.join(' OR ')}",
  "ev_impact": <number in dollars, negative if user lost EV, positive if profitable, conservative estimate>,
  "confidence": "high OR medium OR low",
  "whyWrong": "Why this was wrong, max 2 lines",
  "betterLine": "Exact action: jam / fold / call / raise to X bb",
  "gameTypeUsed": "${gameContext}",
  "villainTypeUsed": "${villainType}"
}

Rules:
- Only output the JSON. Nothing else.
- AMOUNTS: All numeric values in user input are dollars ($) unless the user explicitly writes "bb" or "BB". Never convert dollars to BB. ev_impact must be in dollars.
- In low-SPR pots, recommend jam or fold, not call.
- QQ vs AK is close equity, not a crush. QQ vs AA/KK is bad shape.
- ev_impact must be a number (dollars). Negative = lost EV. Positive = gained EV.
- leak_category must be exactly one value from the list above.
- gameTypeUsed must be exactly: ${gameContext}
- villainTypeUsed must be exactly: ${villainType}
${langGuide[responseLang] ? '\n' + langGuide[responseLang] : ''}
Game context: ${gameGuide[gameContext] || gameGuide['Live Cash']}
Villain context: ${villainGuide[villainType] || villainGuide['Unknown']}`
    : `You are a sharp poker coach. Game: ${gameContext}. ${gameGuide[gameContext] || ''} Villain: ${villainType}. ${villainGuide[villainType] || ''} All bet/pot amounts are in dollars unless user writes "bb". Direct and practical. Under 150 words. Exact actions only.${langGuide[responseLang] ? ' ' + langGuide[responseLang] : ''}`

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: isHandAnalysis ? 0.2 : 0.7,
          },
        }),
      }
    )

    const data = await geminiRes.json()
    if (data.error) throw new Error(data.error.message || 'Gemini API error')

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) throw new Error('Empty response from Gemini')

    if (isHandAnalysis) {
      const parsed = extractJSON(raw)

      if (parsed) {
        const VALID_MISTAKE_TYPES = ['overcall', 'overbet', 'underbet', 'bad_bluff', 'wrong_fold', 'bad_sizing', 'missed_value', 'correct']
        const VALID_LEAK_CATS     = ['river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value', 'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay', 'draw_chasing', 'no_clear_leak']

        const out = {
          summary:        typeof parsed.summary        === 'string' ? parsed.summary        : '',
          biggestMistake: typeof parsed.biggestMistake === 'string' ? parsed.biggestMistake : '',
          mistakeType:    VALID_MISTAKE_TYPES.includes(parsed.mistakeType) ? parsed.mistakeType : 'other',
          leak_category:  VALID_LEAK_CATS.includes(parsed.leak_category)  ? parsed.leak_category : 'no_clear_leak',
          ev_impact:      typeof parsed.ev_impact === 'number' ? parsed.ev_impact : 0,
          confidence:     ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
          whyWrong:       typeof parsed.whyWrong   === 'string' ? parsed.whyWrong   : '',
          betterLine:     typeof parsed.betterLine  === 'string' ? parsed.betterLine  : '',
          gameTypeUsed:   gameContext,
          villainTypeUsed: villainType,
        }

        return res.status(200).json({ type: 'analysis', analysis: out })
      }

      // All JSON extraction attempts failed — log and return safe fallback
      console.error('[coach] JSON parse failed. Raw (first 300):', raw.slice(0, 300))
      const fallback = raw
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\{[\s\S]*?\}/g, '')
        .trim()
      return res.status(200).json({
        type:  'reply',
        reply: fallback || 'Analysis complete, but structured output could not be parsed. Please try again.',
      })
    }

    // General chat → plain text
    return res.status(200).json({ type: 'reply', reply: raw })

  } catch (err) {
    console.error('[coach] Error:', err)
    return res.status(500).json({ error: err.message || 'Coach unavailable. Please try again.' })
  }
}

// ── JSON extraction: tries multiple strategies ─────────────────────────────────
function extractJSON(text) {
  // Strategy 1: direct parse
  try {
    const p = JSON.parse(text)
    if (p && typeof p === 'object' && !Array.isArray(p)) return p
  } catch {}

  // Strategy 2: strip markdown code fences, then parse
  const stripped = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    const p = JSON.parse(stripped)
    if (p && typeof p === 'object' && !Array.isArray(p)) return p
  } catch {}

  // Strategy 3: extract first {...} block
  const match = stripped.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const p = JSON.parse(match[0])
      if (p && typeof p === 'object' && !Array.isArray(p)) return p
    } catch {}
  }

  return null
}
