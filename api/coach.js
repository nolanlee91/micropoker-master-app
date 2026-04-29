export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, isHandAnalysis, gameType } = req.body
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

  const gameContext = gameType || 'Live Cash'
  const playerType = req.body.playerType || 'Unknown'
  const systemText = isHandAnalysis
    ? `You are a sharp poker coach.
Analyze the hand and return ONLY this format:

Biggest mistake: [One sentence. Be direct but not reckless.]
Better line: [One clear recommended line. Include exception if player type matters.]
Leak detected: [One short leak label + explanation.]

Rules:
- Do not write long paragraphs.
- Do not add intro or conclusion.
- Do not say "never" or "always" unless mathematically forced.
- In low-SPR 4-bet pots, recommend jam or fold, not call.
- For live cash, assume 4-bets are value-heavy unless read says otherwise.
- QQ vs AK is close equity, not a crush.
- QQ vs AA/KK is bad shape.

Game type: ${gameContext}
Player type/read: ${playerType}

Then respond with valid JSON only — no markdown, no backticks:
{
  "summary": "One blunt sentence verdict",
  "biggestMistake": "One direct sentence",
  "mistakeType": "overcall | overbet | underbet | bad_bluff | wrong_fold | bad_sizing | missed_value | correct",
  "whyWrong": "1-2 lines max",
  "realityCheck": "What you beat vs what beats you",
  "leakDetected": "Leak label + short explanation",
  "preflop": "One line or Not applicable",
  "flop": "One line or Not applicable",
  "turn": "One line or Not applicable",
  "river": "One line or Not applicable",
  "betterLine": "Exact action: jam / fold / call / raise to X",
  "confidence": "high | medium | low"
}`
    : `You are a sharp poker coach. Game type: ${gameContext}.
Direct, practical, no fluff. Under 150 words. Exact actions only.`

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
        const allowed = ['summary','biggestMistake','mistakeType','whyWrong','realityCheck','leakDetected','preflop','flop','turn','river','betterLine','confidence']
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
