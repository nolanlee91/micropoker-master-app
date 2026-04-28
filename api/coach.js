export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, isHandAnalysis } = req.body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided' })
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  // Two modes:
  // 1. Hand analysis (from History "Analyze" button) → return structured JSON
  // 2. General chat → return plain text reply
  const systemText = isHandAnalysis
    ? `You are a professional Texas Hold'em poker coach specializing in GTO strategy and exploitative play for live cash games (100bb effective).

Analyze the hand provided. Respond ONLY with valid JSON — no markdown, no backticks, no extra text.

JSON format:
{
  "summary": "One sentence overall verdict on how the hand was played",
  "biggestMistake": "The single most costly error in one clear sentence. If no major mistake, say 'No major mistakes — hand played well overall'",
  "mistakeType": "One of: overcall | overbet | underbet | bad_bluff | wrong_fold | bad_sizing | missed_value | correct",
  "preflop": "Brief preflop analysis (1-2 sentences)",
  "flop": "Brief flop analysis or 'Not applicable'",
  "turn": "Brief turn analysis or 'Not applicable'",
  "river": "Brief river analysis or 'Not applicable'",
  "betterLine": "Specific alternative action the player should have taken, or 'Continue as played'",
  "confidence": "high | medium | low"
}

mistakeType guide:
- overcall: called when should fold
- overbet: bet/raise too large
- underbet: bet too small, left value behind
- bad_bluff: bluffed in wrong spot
- wrong_fold: folded a profitable hand
- bad_sizing: bet size was technically wrong
- missed_value: missed opportunity to extract more
- correct: no significant mistake`
    : `You are a professional Texas Hold'em poker coach specializing in GTO strategy and exploitative play for live cash games.
Answer questions about hand analysis, strategy, ranges, bet sizing, and game theory.
Be concise, direct, and practical. Under 200 words per response.`

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
            maxOutputTokens: 1024,
            temperature: isHandAnalysis ? 0.3 : 0.7,
          },
        }),
      }
    )

    const data = await geminiRes.json()
    if (data.error) throw new Error(data.error.message || 'Gemini API error')

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) throw new Error('Empty response from Gemini')

    // Hand analysis → parse JSON
    if (isHandAnalysis) {
      try {
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        const allowed = ['summary','biggestMistake','mistakeType','preflop','flop','turn','river','betterLine','confidence']
        const out = {}
        for (const k of allowed) out[k] = typeof parsed[k] === 'string' ? parsed[k] : ''
        if (!['high','medium','low'].includes(out.confidence)) out.confidence = 'medium'
        const validTypes = ['overcall','overbet','underbet','bad_bluff','wrong_fold','bad_sizing','missed_value','correct']
        if (!validTypes.includes(out.mistakeType)) out.mistakeType = 'other'
        return res.status(200).json({ type: 'analysis', analysis: out })
      } catch {
        // JSON parse failed — fall back to plain reply
        return res.status(200).json({ type: 'reply', reply: raw })
      }
    }

    // General chat → plain text
    return res.status(200).json({ type: 'reply', reply: raw })

  } catch (err) {
    console.error('Gemini error:', err)
    return res.status(500).json({ error: err.message || 'Coach unavailable. Please try again.' })
  }
}
