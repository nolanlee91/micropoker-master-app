export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    // initial analysis fields
    messages, isHandAnalysis, gameType, playerType, language,
    // follow-up explicit fields
    request_type, question, hand_context,
    game_type, villain_type, response_language,
  } = req.body

  console.log('[coach] received:', { request_type, isHandAnalysis, msgCount: messages?.length })

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Determine mode
  const isFollowUp = request_type === 'follow_up'
  const isAnalysis = isHandAnalysis === true && !isFollowUp

  // Normalise context fields (accept both naming conventions)
  const gameContext  = game_type  || gameType  || 'Live Cash'
  const villainType  = villain_type || playerType || 'Unknown'
  const responseLang = response_language || language || 'English'

  const langGuide = {
    English:    '',
    Vietnamese: 'IMPORTANT: Write all text values in Vietnamese. Only translate text fields: summary, biggestMistake, whyWrong, betterLine. Do NOT translate JSON keys or enum values.',
    Chinese:    'IMPORTANT: Write all text values in Simplified Chinese. Only translate text fields: summary, biggestMistake, whyWrong, betterLine. Do NOT translate JSON keys or enum values.',
  }

  const langGuideFollowUp = {
    English:    '',
    Vietnamese: 'IMPORTANT: Write answer and keyTakeaway in Vietnamese. Do NOT translate JSON keys or the confidence value.',
    Chinese:    'IMPORTANT: Write answer and keyTakeaway in Simplified Chinese. Do NOT translate JSON keys or the confidence value.',
  }

  const gameGuide = {
    'Live Cash':   'Live Cash: population underbluffs, especially large river bets. Weight villain\'s range toward value.',
    'Online Cash': 'Online Cash: population is more aggressive and balanced. River overbets can be bluffs.',
    'MTT':         'MTT: stack depth and ICM matter. Factor tournament life. Near bubble/FT, tighten marginal calls.',
  }

  const villainGuide = {
    'Unknown': 'Villain type unknown: use population defaults.',
    'Nit':     'Nit: extremely tight range. 3-bets/large bets are almost always value. Fold to aggression is usually correct.',
    'TAG':     'TAG: solid balanced range. Respect aggression but do not over-fold.',
    'LAG':     'LAG: wide range, high bluff frequency. Call down wider on boards that miss their range.',
    'Fish':    'Fish: wide calls, passive mistakes. Do not bluff. Bet thin for value.',
    'Rec':     'Rec: recreational, wide and passive. Value-bet relentlessly. Bluffing is low EV.',
  }

  const LEAK_CATEGORIES = [
    'river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value',
    'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay',
    'draw_chasing', 'no_clear_leak',
  ]

  // ── Build Gemini contents from messages (filter out empty text) ───────────
  const rawMessages = Array.isArray(messages) ? messages : []
  const contents = rawMessages
    .filter(m => m.content && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.trim() }],
    }))

  // For follow-up: if we have question but it's not in messages yet, append it
  if (isFollowUp && question && !rawMessages.some(m => m.content === question)) {
    contents.push({ role: 'user', parts: [{ text: question }] })
  }

  // Gemini requires at least one content item
  if (contents.length === 0) {
    return res.status(400).json({ error: 'No message content provided' })
  }

  // ── Build hand context string (for follow-up) ─────────────────────────────
  let handContextStr = ''
  if (hand_context) {
    const h = hand_context
    const holeCards = Array.isArray(h.holeCards) ? h.holeCards.join(' ') : ''
    const board     = Array.isArray(h.boardCards) && h.boardCards.length ? h.boardCards.join(' ') : 'none'
    const result    = h.result != null && h.result !== 0
      ? (h.result > 0 ? `+$${h.result}` : `-$${Math.abs(h.result)}`)
      : ''
    handContextStr = [
      `Hand context:`,
      `- Hole cards: ${holeCards}`,
      `- Board: ${board}`,
      `- Position: ${h.position || ''}`,
      result ? `- Result: ${result}` : null,
      h.notes ? `- Notes: ${h.notes}` : null,
    ].filter(Boolean).join('\n')
  }

  // ── System prompts ────────────────────────────────────────────────────────
  const analysisSystemText = `You are a sharp poker coach. Before analyzing, reason through the hand in this exact order:

STEP 1 — HAND PARSING
- List hole cards and board cards exactly as given.

STEP 2 — HAND STRENGTH (deterministic — no guessing)
- Determine the best 5-card hand the hero can make.
- Classify EXACTLY as one of: high card / pair / two pair / trips / straight / flush / full house / quads / straight flush.
- DO NOT assume straight or flush unless the cards explicitly form one. Count the cards.
- DO NOT invent any opponent's hand.

STEP 3 — BOARD TEXTURE
- Note if board is: paired / flush draw possible / straight draw possible / dry / wet.

STEP 4 — DECISION ANALYSIS
- Only now analyze the action and give your verdict.
- If action line is missing or unclear, say "limited context" in summary.

CRITICAL: Return ONLY a JSON object. No text before or after it. No markdown. No code fences. No backticks.

Required format:
{
  "heroHandStrength": "exact classification, e.g. top pair top kicker, second pair, flush draw, etc.",
  "boardTexture": "brief board description, e.g. paired wet board, rainbow dry board",
  "summary": "One blunt verdict sentence",
  "biggestMistake": "The main error in one direct sentence",
  "mistakeType": "overcall OR overbet OR underbet OR bad_bluff OR wrong_fold OR bad_sizing OR missed_value OR correct",
  "leak_category": "${LEAK_CATEGORIES.join(' OR ')}",
  "ev_impact": <number in dollars, negative if user lost EV, positive if profitable>,
  "confidence": "high OR medium OR low",
  "whyWrong": "Why this was wrong, max 2 lines",
  "betterLine": "Exact action: jam / fold / call / raise to X bb",
  "gameTypeUsed": "${gameContext}",
  "villainTypeUsed": "${villainType}"
}

Rules:
- Only output the JSON. Nothing else.
- All amounts are in dollars unless user explicitly writes "bb".
- ev_impact must be a number (dollars). Negative = lost EV. Positive = gained EV.
- leak_category must be exactly one value from the list above.
- gameTypeUsed must be exactly: ${gameContext}
- villainTypeUsed must be exactly: ${villainType}
${langGuide[responseLang] ? '\n' + langGuide[responseLang] : ''}
Game context: ${gameGuide[gameContext] || gameGuide['Live Cash']}
Villain context: ${villainGuide[villainType] || villainGuide['Unknown']}`

  const followUpSystemText = `You are a sharp poker coach answering a follow-up question.
${handContextStr ? '\n' + handContextStr + '\n' : ''}
CRITICAL: Return ONLY a JSON object. No text before or after it. No markdown. No code fences. No backticks.

Required format:
{
  "type": "follow_up",
  "answer": "Direct answer to the question, max 3 sentences",
  "keyTakeaway": "One concise takeaway sentence",
  "confidence": "high OR medium OR low"
}

Rules:
- Only output the JSON. Nothing else.
- Answer the specific question asked. Do not re-analyze the full hand unless asked.
- For hypothetical questions (e.g. "what if KJ instead of K6"), answer the hypothetical clearly.
- All amounts in dollars unless user writes "bb".
- type field must be exactly: follow_up
${langGuideFollowUp[responseLang] ? '\n' + langGuideFollowUp[responseLang] : ''}
Game context: ${gameGuide[gameContext] || gameGuide['Live Cash']}
Villain context: ${villainGuide[villainType] || villainGuide['Unknown']}`

  const systemText = isAnalysis ? analysisSystemText : followUpSystemText

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
            temperature: isAnalysis ? 0.2 : 0.3,
          },
        }),
      }
    )

    const data = await geminiRes.json()
    if (data.error) throw new Error(data.error.message || 'Gemini API error')

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) throw new Error('Empty response from Gemini')

    console.log('[coach] raw response (200):', raw.slice(0, 200))

    // ── Initial analysis ────────────────────────────────────────────────────
    if (isAnalysis) {
      const parsed = extractJSON(raw)

      if (parsed) {
        const VALID_MISTAKE_TYPES = ['overcall', 'overbet', 'underbet', 'bad_bluff', 'wrong_fold', 'bad_sizing', 'missed_value', 'correct']
        const VALID_LEAK_CATS     = ['river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value', 'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay', 'draw_chasing', 'no_clear_leak']

        const out = {
          heroHandStrength: typeof parsed.heroHandStrength === 'string' ? parsed.heroHandStrength : '',
          boardTexture:     typeof parsed.boardTexture     === 'string' ? parsed.boardTexture     : '',
          summary:          typeof parsed.summary          === 'string' ? parsed.summary          : '',
          biggestMistake:   typeof parsed.biggestMistake   === 'string' ? parsed.biggestMistake   : '',
          mistakeType:      VALID_MISTAKE_TYPES.includes(parsed.mistakeType) ? parsed.mistakeType : 'other',
          leak_category:    VALID_LEAK_CATS.includes(parsed.leak_category)  ? parsed.leak_category : 'no_clear_leak',
          ev_impact:        typeof parsed.ev_impact === 'number' ? parsed.ev_impact : 0,
          confidence:       ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
          whyWrong:         typeof parsed.whyWrong   === 'string' ? parsed.whyWrong   : '',
          betterLine:       typeof parsed.betterLine  === 'string' ? parsed.betterLine  : '',
          gameTypeUsed:     gameContext,
          villainTypeUsed:  villainType,
        }

        return res.status(200).json({ type: 'analysis', analysis: out })
      }

      console.error('[coach] analysis JSON parse failed. Raw (300):', raw.slice(0, 300))
      const fallback = raw.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*?\}/g, '').trim()
      return res.status(200).json({
        type:  'reply',
        reply: fallback || raw,
      })
    }

    // ── Follow-up ───────────────────────────────────────────────────────────
    const parsedFollowUp = extractJSON(raw)
    if (parsedFollowUp) {
      const answer      = parsedFollowUp.answer      != null ? String(parsedFollowUp.answer)      : ''
      const keyTakeaway = parsedFollowUp.keyTakeaway != null ? String(parsedFollowUp.keyTakeaway) : ''
      if (answer || keyTakeaway) {
        return res.status(200).json({
          type: 'follow_up',
          followUp: {
            type: 'follow_up',
            answer,
            keyTakeaway,
            confidence: ['high', 'medium', 'low'].includes(parsedFollowUp.confidence)
                          ? parsedFollowUp.confidence : 'medium',
          },
        })
      }
    }

    // Fallback: return plain text — NEVER empty
    console.log('[coach] follow-up JSON parse failed, returning plain text')
    const stripped = raw.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*?\}/g, '').trim()
    return res.status(200).json({ type: 'reply', reply: stripped || raw })

  } catch (err) {
    console.error('[coach] error:', err.message)
    return res.status(500).json({ error: err.message || 'Coach unavailable. Please try again.' })
  }
}

// ── JSON extraction: tries multiple strategies ──────────────────────────────
function extractJSON(text) {
  try {
    const p = JSON.parse(text)
    if (p && typeof p === 'object' && !Array.isArray(p)) return p
  } catch {}

  const stripped = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    const p = JSON.parse(stripped)
    if (p && typeof p === 'object' && !Array.isArray(p)) return p
  } catch {}

  const match = stripped.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const p = JSON.parse(match[0])
      if (p && typeof p === 'object' && !Array.isArray(p)) return p
    } catch {}
  }

  return null
}
