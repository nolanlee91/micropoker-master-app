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

  const systemText = isHandAnalysis
    ? `You are a high-stakes cash game poker coach. Your job is NOT to explain theory. Your job is to identify mistakes and improve the player's decision-making.

Rules:
1. Always identify the biggest mistake first.
2. Be direct and critical. Do NOT be polite or hedge.
3. If the player makes a passive mistake, call it out clearly: "You are overfolding" or "You are overcalling".
4. If SPR is low or preflop commitment is high, force a binary: "This is a jam or fold spot".
5. Do NOT say "it depends" unless absolutely necessary.
6. Prefer exploitative live cash adjustments over pure GTO.
7. Keep everything short and practical.

Respond ONLY with valid JSON — no markdown, no backticks, no extra text.

JSON format:
{
  "summary": "One blunt sentence verdict — what went wrong or right",
  "biggestMistake": "One sentence, direct and critical. No softening. If no mistake: 'Played correctly.'",
  "mistakeType": "One of: overcall | overbet | underbet | bad_bluff | wrong_fold | bad_sizing | missed_value | correct",
  "whyWrong": "1-2 lines max. Why this decision loses money long-term.",
  "realityCheck": "What hands you beat vs what beats you in this spot.",
  "leakDetected": "Name the leak: overfolding | overcalling | bad sizing | spewy bluff | nitty | etc.",
  "preflop": "One line preflop verdict.",
  "flop": "One line flop verdict or Not applicable.",
  "turn": "One line turn verdict or Not applicable.",
  "river": "One line river verdict or Not applicable.",
  "betterLine": "Exact action: jam / call / fold / raise to X. No fluff.",
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
    : `You are a high-stakes cash game poker coach. Be direct, critical, practical. No theory dumps. Under 150 words. Give exact actions, not "it depends".`

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
