export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, isHandAnalysis, gameType, playerType } = req.body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided' })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  const gameContext  = gameType  || 'Live Cash'
  const villainType  = playerType || 'Unknown'

  const systemText = isHandAnalysis
    ? `You are a sharp poker coach. Analyze the hand.

CRITICAL: Return ONLY a JSON object. No text before it. No text after it. No markdown. No code blocks. No backticks.

Required format:
{
  "summary": "One blunt verdict sentence",
  "biggestMistake": "The main error in one direct sentence",
  "mistakeType": "overcall OR overbet OR underbet OR bad_bluff OR wrong_fold OR bad_sizing OR missed_value OR correct",
  "whyWrong": "Why this was wrong, max 2 lines",
  "betterLine": "Exact action: jam / fold / call / raise to X bb",
  "confidence": "high OR medium OR low"
}

Rules:
- Only output the JSON. Nothing else.
- In low-SPR pots, recommend jam or fold, not call.
- For live cash, treat 4-bets as value-heavy unless noted.
- QQ vs AK is close equity, not a crush. QQ vs AA/KK is bad shape.
Game: ${gameContext}
Villain type: ${villainType}`
    : `You are a sharp poker coach. Game: ${gameContext}. Villain type: ${villainType}. Direct and practical. Under 150 words. Exact actions only.`

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
        const ALLOWED       = ['summary', 'biggestMistake', 'mistakeType', 'whyWrong', 'betterLine', 'confidence']
        const VALID_TYPES   = ['overcall', 'overbet', 'underbet', 'bad_bluff', 'wrong_fold', 'bad_sizing', 'missed_value', 'correct']

        const out = {}
        for (const k of ALLOWED) out[k] = typeof parsed[k] === 'string' ? parsed[k] : ''
        if (!['high', 'medium', 'low'].includes(out.confidence)) out.confidence = 'medium'
        if (!VALID_TYPES.includes(out.mistakeType))               out.mistakeType = 'other'

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
