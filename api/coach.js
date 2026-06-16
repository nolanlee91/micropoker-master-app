import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Require a valid Supabase session ───────────────────────────────────────
  // Without this, anyone could hit /api/coach and burn the Gemini quota.
  const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Auth not configured' })
  }
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const {
    // initial analysis fields
    messages, isHandAnalysis, language,
    // deterministic hand evaluation (computed on frontend)
    verifiedHeroHandStrength, verifiedBestFiveCards, verifiedBoardTexture,
    // follow-up explicit fields
    request_type, question, hand_context, response_language,
  } = req.body

  console.log('[coach] received:', { request_type, isHandAnalysis, msgCount: messages?.length })

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Determine mode
  const isFollowUp = request_type === 'follow_up'
  const isAnalysis = isHandAnalysis === true && !isFollowUp

  // Game type & villain read are no longer structured inputs — the model reads them
  // from the hand text. Only language remains a normalised setting.
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

STEP 3 — BOARD TEXTURE (read the COMMUNITY cards ONLY — this is where coaches hallucinate)
- List the community cards (flop + turn + river) and write out their five ranks.
- The board is "paired" ONLY if two or more of THOSE COMMUNITY cards share a rank.
  The hero (or villain) holding a card that matches a board card does NOT pair the board.
- HARD RULE: if the five board ranks are all different, the board is UNPAIRED. On an
  unpaired board a full house and quads are IMPOSSIBLE — do NOT say "full house",
  "boat", or "paired" anywhere. The strongest possible made hands are: sets, straights,
  flushes, two pair. Only claim villain "has a full house" if the board is actually paired.
- Then note: paired / monotone / flush possible / straight possible / dry / wet.
- When you name the hands that beat the hero, list only hands that are POSSIBLE given
  this exact board.

STEP 4 — ACTION RECONSTRUCTION (do this BEFORE judging — it must be identical every time for the same hand)
- Reconstruct the betting line street by street with the exact amounts given.
- Identify each preflop raise LEVEL explicitly: open / 3-bet / 4-bet / squeeze, and who did it.
- State the effective stack, the pot going into the decision, and the EXACT amount the hero is facing on the decision street.
- Put this reconstruction in the "actionLine" field. If something is genuinely missing, say so there; do not invent amounts.

STEP 5 — DECISION ANALYSIS
- Base the verdict on the reconstructed actionLine, referencing the actual amounts.
- Factor in the game type and villain read AS STATED IN THE HAND, using standard population
  tendencies: live players underbluff big rivers (fold more); online pools are more aggressive
  (call wider); MTT = ICM/stack depth; nits rarely bluff; fish/recs call too much and rarely
  bluff. Read these from the text — never ask for them.
- ROBUSTNESS: real hands have typos, rounding, or a missing/inconsistent amount. Make the
  most reasonable assumption (e.g. assume stacks are deep enough for the action that
  happened), note it in ONE short clause in actionLine, and STILL commit to a definitive
  verdict, mistakeType, and a real ev_impact number estimated from the amounts you DO have.
- NEVER answer "cannot determine" / "limited context" and NEVER leave ev_impact at 0 just
  because one figure is unclear. Only use "limited context" if there is essentially no hand.

CRITICAL: Return ONLY a JSON object. No text before or after it. No markdown. No code fences. No backticks.

Required format:
{
  "heroHandStrength": "exact classification, e.g. top pair top kicker, second pair, flush draw, etc.",
  "boardTexture": "brief board description, e.g. paired wet board, rainbow dry board",
  "actionLine": "reconstructed line w/ amounts + raise levels, e.g. 'BTN 3-bet to $70 pre, UTG calls; c-bet $90 flop call; bet $180 turn call; faces $250 river jam ($300 eff)'",
  "summary": "One blunt verdict sentence",
  "biggestMistake": "The main error in one direct sentence",
  "mistakeType": "overcall OR overbet OR underbet OR bad_bluff OR wrong_fold OR bad_sizing OR missed_value OR correct",
  "leak_category": "${LEAK_CATEGORIES.join(' OR ')}",
  "ev_impact": <number in dollars, negative if user lost EV, positive if profitable>,
  "confidence": "high OR medium OR low",
  "whyWrong": "Why this was wrong, max 2 lines",
  "betterLine": "Exact action: jam / fold / call / raise to X bb"
}

Rules:
- Only output the JSON. Nothing else.
- All amounts are in dollars unless user explicitly writes "bb".
- ev_impact must be GROUNDED in the actual dollars in the hand, NOT a round guess.
  Compute it as the EV difference between the hero's action and the best line, using
  the real amount faced and pot. Example: calling a $250 river jam while beaten ~80%
  of the time costs roughly the amount put in that you don't get back — on the order
  of the bet faced, not a token -$10. Show the number reflects the actual stakes.
- leak_category must be exactly one value from the list above.
${langGuide[responseLang] ? '\n' + langGuide[responseLang] : ''}
${verifiedHeroHandStrength
  ? `\nVERIFIED HERO HAND (computed by deterministic code — YOU MUST USE THIS EXACT VALUE):
  heroHandStrength = "${verifiedHeroHandStrength}"${verifiedBestFiveCards?.length ? `\n  Best 5 cards: ${verifiedBestFiveCards.join(' ')}` : ''}${verifiedBoardTexture ? `\n  Board texture: ${verifiedBoardTexture}` : ''}
CRITICAL RULES:
- Copy heroHandStrength EXACTLY as shown above into your JSON response.
- Do NOT infer a different hand from the cards or from notes.
- Notes may describe the OPPONENT's hand — do NOT apply that to the hero.`
  : ''}`

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
- Factor in game type & villain as stated in the hand (live underbluffs, online is more
  aggressive, nits rarely bluff) using standard population tendencies.
${langGuideFollowUp[responseLang] ? '\n' + langGuideFollowUp[responseLang] : ''}`

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
            // gemini-2.5-flash is a *thinking* model: reasoning tokens count toward
            // maxOutputTokens. The analysis prompt asks for multi-step reasoning, so
            // 4096 could be exhausted on thinking and truncate the JSON mid-field
            // (→ parse fail → raw JSON shown). 8192 leaves room for thinking + output.
            maxOutputTokens: 8192,
            // Analysis at temp 0 → far less run-to-run drift in the verdict, the
            // reasoning, and the EV number for the same hand (was 0.2 → noticeably
            // different explanations each call). Follow-up keeps a little warmth.
            temperature: isAnalysis ? 0 : 0.3,
            // Force clean JSON (no markdown fences / prose) so extractJSON parses
            // reliably. Both analysis and follow-up paths expect JSON.
            responseMimeType: 'application/json',
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
          actionLine:       typeof parsed.actionLine       === 'string' ? parsed.actionLine       : '',
          summary:          typeof parsed.summary          === 'string' ? parsed.summary          : '',
          biggestMistake:   typeof parsed.biggestMistake   === 'string' ? parsed.biggestMistake   : '',
          mistakeType:      VALID_MISTAKE_TYPES.includes(parsed.mistakeType) ? parsed.mistakeType : 'other',
          leak_category:    VALID_LEAK_CATS.includes(parsed.leak_category)  ? parsed.leak_category : 'no_clear_leak',
          ev_impact:        typeof parsed.ev_impact === 'number' ? parsed.ev_impact : 0,
          confidence:       ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
          whyWrong:         typeof parsed.whyWrong   === 'string' ? parsed.whyWrong   : '',
          betterLine:       typeof parsed.betterLine  === 'string' ? parsed.betterLine  : '',
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
