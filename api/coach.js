import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

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
    // personalized leak fix-plan fields
    leak_category, leak_hands,
    // session debrief fields
    session_hands, session_label,
    // voice transcription fields (audio → notation text)
    audio, audioMime,
  } = req.body

  console.log('[coach] received:', { request_type, isHandAnalysis, msgCount: messages?.length })

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Determine mode
  const isFollowUp = request_type === 'follow_up'
  const isLeakFix  = request_type === 'leak_fix'
  const isDebrief  = request_type === 'session_debrief'
  const isTranscribe = request_type === 'transcribe'
  const isAnalysis = isHandAnalysis === true && !isFollowUp && !isLeakFix && !isDebrief && !isTranscribe

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

  const langGuideLeakFix = {
    English:    '',
    Vietnamese: 'IMPORTANT: Write summary, every step, and drill in Vietnamese. Do NOT translate JSON keys.',
    Chinese:    'IMPORTANT: Write summary, every step, and drill in Simplified Chinese. Do NOT translate JSON keys.',
  }

  const langGuideDebrief = {
    English:    '',
    Vietnamese: 'IMPORTANT: Write headline, every topLeak, biggestSpot, mental, and nextFocus in Vietnamese. Do NOT translate JSON keys.',
    Chinese:    'IMPORTANT: Write headline, every topLeak, biggestSpot, mental, and nextFocus in Simplified Chinese. Do NOT translate JSON keys.',
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

  // For a leak fix-plan: the content is the player's OWN hands tagged with this leak,
  // so the model writes a plan grounded in their actual tendencies (not a lookup line).
  if (isLeakFix) {
    const cat = String(leak_category || '').trim()
    const handLines = (Array.isArray(leak_hands) ? leak_hands : [])
      .slice(0, 12)
      .map((h, i) => {
        const hole  = Array.isArray(h.holeCards) ? h.holeCards.join('') : ''
        const board = Array.isArray(h.boardCards) && h.boardCards.length ? h.boardCards.join(' ') : '—'
        const ev    = typeof h.evImpact === 'number'
          ? (h.evImpact > 0 ? `+$${Math.round(h.evImpact)}` : `-$${Math.abs(Math.round(h.evImpact))}`)
          : ''
        const note  = h.aiAnalysis?.biggestMistake || h.aiAnalysis?.summary || h.notes || ''
        return `${i + 1}. ${hole || '??'} on ${board} ${ev} — ${String(note).slice(0, 160)}`
      })
      .join('\n')
    contents.length = 0
    contents.push({ role: 'user', parts: [{ text: `Leak category: ${cat || 'unknown'}\n\nMy hands tagged with this leak:\n${handLines || '(no hand detail available)'}` }] })
  }

  // For a session debrief: feed every hand the player flagged this session so the
  // model reads the night as a whole (recurring patterns, tilt, one focus) — the
  // recurring ritual a weekend live player actually has.
  if (isDebrief) {
    const handLines = (Array.isArray(session_hands) ? session_hands : [])
      .slice(0, 20)
      .map((h, i) => {
        const hole  = Array.isArray(h.holeCards) ? h.holeCards.join('') : ''
        const board = Array.isArray(h.boardCards) && h.boardCards.length ? h.boardCards.join(' ') : '—'
        const ev    = typeof h.evImpact === 'number'
          ? (h.evImpact > 0 ? `+$${Math.round(h.evImpact)}` : `-$${Math.abs(Math.round(h.evImpact))}`)
          : ''
        const leak  = h.leakCategory ? ` [${h.leakCategory}]` : ''
        const note  = h.aiAnalysis?.biggestMistake || h.aiAnalysis?.summary || h.notes || ''
        return `${i + 1}. ${hole || '??'} on ${board} ${ev}${leak} — ${String(note).slice(0, 160)}`
      })
      .join('\n')
    contents.length = 0
    contents.push({ role: 'user', parts: [{ text: `Session: ${session_label || 'recent session'}\n\nHands I flagged this session:\n${handLines || '(no hand detail available)'}` }] })
  }

  // For voice transcription: the content IS the recorded audio. We ask the model to
  // transcribe AND normalise spoken cards to notation, so the resulting text flows
  // through the existing pipeline (extractCardsFromText → evaluateHeroHand) and the
  // deterministic moat still holds.
  if (isTranscribe) {
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'No audio provided' })
    }
    contents.length = 0
    contents.push({
      role: 'user',
      parts: [
        { text: 'Transcribe the poker hand in this audio.' },
        { inline_data: { mime_type: audioMime || 'audio/webm', data: audio } },
      ],
    })
  }

  // Gemini requires at least one content item
  if (contents.length === 0) {
    return res.status(400).json({ error: 'No message content provided' })
  }

  // ── Layer 3: cheap input guard (analysis only) ─────────────────────────────
  // The persona already deflects off-topic CONTENT, but every refusal still costs
  // a model call. Reject obviously non-poker prompts HERE, before spending the
  // (pricier) analysis call — so weather/code spam costs $0.
  if (isAnalysis) {
    const handText = rawMessages.filter(m => m.role === 'user').map(m => m.content).join(' ')
    if (!looksLikePoker(handText)) {
      return res.status(200).json({
        type:  'reply',
        reply: "I only analyze poker hands. Paste a hand — your cards, position, and the action — and I'll find your leaks.",
      })
    }
  }

  // ── Layer 2: per-user daily anti-abuse cap (tiered) ────────────────────────
  // Counts EVERY mode (analysis, follow-up, fix plan, debrief). The cap is tiered
  // by who the user is — NOT to upsell (analysis is the free acquisition weapon and
  // stays on the strong model for everyone), but to stop cost abuse:
  //   • anonymous: small bucket so the no-login demo can't be farmed by rotating
  //     throwaway anon identities (each anon = a fresh user.id);
  //   • signed-in free: generous ceiling a real player never hits;
  //   • Pro: highest.
  // Best-effort: if the counter/lookup is unavailable, fail open (don't block a
  // paying user over an infra hiccup).
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Quota v2 — the EXPENSIVE deep analysis (gemini-2.5-pro, ~$0.09/call) is metered
  // separately from the cheap flash calls (follow-up/fix/debrief). Deep analysis:
  //   • anon / free = a LIFETIME trial (no reset) — a taste that feeds the funnel;
  //   • pro = 60 per CALENDAR MONTH (resets on the 1st), burst-friendly for a player
  //     who reviews a whole session in one sitting.
  const CAP_ANALYSIS_ANON   = parseInt(process.env.COACH_CAP_ANALYSIS_ANON    || '3',  10) // lifetime
  const CAP_ANALYSIS_FREE   = parseInt(process.env.COACH_CAP_ANALYSIS_FREE    || '10', 10) // lifetime
  const CAP_ANALYSIS_PRO_MO = parseInt(process.env.COACH_CAP_ANALYSIS_PRO_MO  || '60', 10) // per calendar month
  // Flash calls (follow-up + fix plan + debrief) are cheap → a generous DAILY cap,
  // purely anti-abuse. (Fix/debrief are Pro-only anyway, so for anon/free this is
  // effectively the follow-up cap.)
  const CAP_FLASH_ANON = parseInt(process.env.COACH_CAP_FLASH_ANON || '5',  10) // /day
  const CAP_FLASH_FREE = parseInt(process.env.COACH_CAP_FLASH_FREE || '10', 10) // /day
  const CAP_FLASH_PRO  = parseInt(process.env.COACH_CAP_FLASH_PRO  || '30', 10) // /day
  // Per-IP cap targets the ONE real farming vector: rotating throwaway ANONYMOUS
  // accounts on a single device/IP to re-roll the free Pro demo. Applied to anon
  // ONLY, so real users behind shared NAT/CGNAT are never throttled.
  const CAP_IP_ANON = parseInt(process.env.COACH_CAP_IP_ANON || '8', 10)
  // Global daily circuit breaker across ALL users — the hard "sleep at night"
  // backstop so a scripted attack can't run the Gemini bill up without bound.
  // Raise as you grow; set very high to effectively disable.
  const GLOBAL_CAP  = parseInt(process.env.COACH_GLOBAL_DAILY_CAP || '3000', 10)
  // Hoisted so the Pro-only entitlement gate below can read it AFTER this block.
  // Stays false unless positively verified → fail closed for Pro-only modes.
  let isProUser = false
  if (SERVICE_ROLE) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

      // (1) Global circuit breaker — trips before any per-user logic so a flood
      //     can never reach the model, no matter how many identities it rotates.
      const { data: gCount, error: gErr } = await admin.rpc('bump_global_usage')
      if (!gErr && typeof gCount === 'number' && gCount > GLOBAL_CAP) {
        return res.status(429).json({ error: 'The coach is at capacity right now. Please try again in a little while.' })
      }

      // (2) Per-IP cap — anonymous only (signed-in users cost real Google accounts
      //     to farm, and we don't want to punish shared-NAT real users).
      if (user.is_anonymous) {
        const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        const ip  = fwd || req.socket?.remoteAddress || ''
        if (ip) {
          // Store only a salted hash — never the raw IP.
          const salt   = process.env.COACH_IP_SALT || SUPABASE_URL || 'mpm'
          const ipHash = createHash('sha256').update(salt + ip).digest('hex')
          const { data: ipCount, error: ipErr } = await admin.rpc('bump_ip_usage', { p_ip: ipHash })
          if (!ipErr && typeof ipCount === 'number' && ipCount > CAP_IP_ANON) {
            return res.status(429).json({ error: "You've hit the free demo limit for this device. Create a free account to keep going — it's free." })
          }
        }
      }

      // (3) Per-user cap. Pro check (mirrors usePro: active/trialing sub not expired)
      //     is shared by the transcribe cap and the analysis cap.
      if (!user.is_anonymous) {
        const { data: sub } = await admin
          .from('subscriptions')
          .select('status, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle()
        const activeStatus = !!sub && ['active', 'trialing'].includes(sub.status)
        const notExpired   = !sub?.current_period_end || new Date(sub.current_period_end) > new Date()
        isProUser = activeStatus && notExpired
      }

      if (isTranscribe) {
        // Voice transcription (flash, cheap) does NOT count against the analysis cap —
        // a voice hand should equal a typed hand. It gets its OWN tiered per-user cap
        // so the audio endpoint can't be spammed to burn the Google budget. Sized to
        // never block a real user (a Pro analyzes up to 20 hands/day + re-records), not
        // to upsell. Anon kept lowest (the farming surface).
        const CAP_T_ANON = parseInt(process.env.COACH_CAP_TRANSCRIBE_ANON || '5', 10)
        const CAP_T_FREE = parseInt(process.env.COACH_CAP_TRANSCRIBE_FREE || '15', 10)
        const CAP_T_PRO  = parseInt(process.env.COACH_CAP_TRANSCRIBE_PRO  || '40', 10)
        const tCap = user.is_anonymous ? CAP_T_ANON : isProUser ? CAP_T_PRO : CAP_T_FREE
        const { data: tCount, error: tErr } = await admin.rpc('bump_transcribe_usage', { p_user: user.id })
        if (!tErr && typeof tCount === 'number' && tCount > tCap) {
          return res.status(429).json({
            error: user.is_anonymous
              ? `Voice note limit reached (${tCap}/day). Create a free account for more.`
              : `Voice note limit reached (${tCap}/day). Come back tomorrow.`,
          })
        }
      } else if (isAnalysis) {
        // DEEP analysis (gemini-2.5-pro). Pro = per-month counter; anon/free = a
        // lifetime counter (the trial doesn't refill). Pick the counter by tier.
        if (isProUser) {
          const { data: count, error: capErr } = await admin.rpc('bump_coach_analysis_month', { p_user: user.id })
          if (!capErr && typeof count === 'number' && count > CAP_ANALYSIS_PRO_MO) {
            return res.status(429).json({ error: `You've used all ${CAP_ANALYSIS_PRO_MO} hand analyses this month. Your quota resets on the 1st.` })
          }
        } else {
          const { data: count, error: capErr } = await admin.rpc('bump_coach_analysis_total', { p_user: user.id })
          const cap = user.is_anonymous ? CAP_ANALYSIS_ANON : CAP_ANALYSIS_FREE
          if (!capErr && typeof count === 'number' && count > cap) {
            const msg = user.is_anonymous
              ? `You've used your ${cap} free analyses. Create a free account for ${CAP_ANALYSIS_FREE} more — it's free.`
              : `You've used all ${cap} free hand analyses. Go Pro for ${CAP_ANALYSIS_PRO_MO} a month — full Leak Profile, fix plans and debriefs included.`
            return res.status(429).json({ error: msg })
          }
        }
      } else {
        // Cheap flash turns (follow-up / fix plan / debrief) → generous daily cap.
        const cap = user.is_anonymous ? CAP_FLASH_ANON : isProUser ? CAP_FLASH_PRO : CAP_FLASH_FREE
        const { data: count, error: capErr } = await admin.rpc('bump_coach_usage', { p_user: user.id })
        if (!capErr && typeof count === 'number' && count > cap) {
          const msg = user.is_anonymous
            ? `You've hit today's free limit. Create a free account to keep going — it's free.`
            : `Daily limit reached (${cap}/day). Come back tomorrow — this keeps the AI fast for everyone.`
          return res.status(429).json({ error: msg })
        }
      }
    } catch (e) {
      console.warn('[coach] usage cap skipped:', e.message)
    }
  }

  // ── Entitlement: fix plan + session debrief are Pro-only ───────────────────
  // The frontend gates these, but enforce it here too so the endpoint can't be
  // called directly by a free/anon user. Fail closed: if Pro couldn't be verified
  // above (no service role, or a lookup error), isProUser stays false and we deny.
  // Analysis, follow-up and transcribe stay open to free + anonymous users.
  if ((isLeakFix || isDebrief) && !isProUser) {
    return res.status(403).json({ error: 'Fix plans and session debriefs are a Pro feature. Upgrade to unlock them.' })
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

STEP 5 — REQUEST MODE (decide this BEFORE judging — it changes the whole verdict)
- Decide whether the hero has ALREADY COMMITTED their action on the decision street, or is ASKING what to do.
  - "advice": the hand stops at the hero's decision with NO action taken, OR the hero asks what to do ("call or fold?", "what should I do?", "is this a fold?"). The hero has NOT acted yet — there is NO mistake to grade.
  - "post_mortem": the hero's decision-street action is stated, or a result is given (they already called / folded / raised / jammed).
- Record it in "requestMode". When genuinely unsure, prefer "advice" (never invent a mistake the hero may not have made).

STEP 6 — DECISION ANALYSIS
- Base the verdict on the reconstructed actionLine, referencing the actual amounts.
- Factor in the game type and villain read AS STATED IN THE HAND, using standard population
  tendencies: live players underbluff big rivers (fold more); online pools are more aggressive
  (call wider); MTT = ICM/stack depth; nits rarely bluff; fish/recs call too much and rarely
  bluff. Read these from the text — never ask for them.
- ROBUSTNESS: real hands have typos, rounding, or a missing/inconsistent amount. Make the
  most reasonable assumption (e.g. assume stacks are deep enough for the action that
  happened), note it in ONE short clause in actionLine, and STILL commit to a definitive
  verdict, mistakeType, and a real ev_impact number estimated from the amounts you DO have.
- NEVER answer "cannot determine" / "limited context" just because one figure is unclear —
  make the most reasonable assumption and still give a clear recommendation or verdict.
  (ev_impact = 0 is CORRECT and expected for advice mode and for hands the hero played
  correctly; only use a NEGATIVE ev_impact for a real committed mistake.) Only use "limited
  context" if there is essentially no hand.

CRITICAL: Return ONLY a JSON object. No text before or after it. No markdown. No code fences. No backticks.

Required format:
{
  "heroHandStrength": "exact classification, e.g. top pair top kicker, second pair, flush draw, etc.",
  "boardTexture": "brief board description, e.g. paired wet board, rainbow dry board",
  "actionLine": "reconstructed line w/ amounts + raise levels, e.g. 'BTN 3-bet to $70 pre, UTG calls; c-bet $90 flop call; bet $180 turn call; faces $250 river jam ($300 eff)'",
  "requestMode": "post_mortem OR advice",
  "summary": "One blunt sentence — a verdict if post_mortem, a recommendation if advice",
  "biggestMistake": "The main error in one direct sentence (empty string if advice or if played correctly)",
  "mistakeType": "overcall OR overbet OR underbet OR bad_bluff OR wrong_fold OR bad_sizing OR missed_value OR correct",
  "leak_category": "${LEAK_CATEGORIES.join(' OR ')}",
  "ev_impact": <number in dollars, negative if user lost EV, positive if profitable>,
  "confidence": "high OR medium OR low",
  "whyWrong": "Why this was wrong, max 2 lines",
  "betterLine": "Exact action: jam / fold / call / raise to X bb"
}

Rules:
- Only output the JSON. Nothing else.
- requestMode rules — apply STRICTLY:
  - If "advice": you are giving a RECOMMENDATION, not grading a mistake. Set mistakeType="correct",
    leak_category="no_clear_leak", ev_impact=0, biggestMistake="". Put the recommended action in
    betterLine; summary reads as advice ("Facing this jam, folding is best because…"). Do NOT invent
    an action the hero didn't take, and do NOT call it a leak.
  - If "post_mortem": judge the ACTUAL action the hero took. If it WAS the best line (e.g. they folded
    and folding is correct), set mistakeType="correct", leak_category="no_clear_leak", ev_impact=0 — do
    NOT manufacture a leak. Assign a real leak_category + negative ev_impact ONLY when the action the
    hero ACTUALLY took was genuinely worse than the best line. Never label a fold as a calling leak (or
    vice-versa) — judge the action that actually happened.
- All amounts are in dollars unless user explicitly writes "bb".
- ev_impact must be GROUNDED in the actual dollars in the hand, NOT a round guess.
  Compute it as the EV difference between the hero's action and the best line, using
  the real amount faced and pot. Example: calling a $250 river jam while beaten ~80%
  of the time costs roughly the amount put in that you don't get back — on the order
  of the bet faced, not a token -$10. Show the number reflects the actual stakes.
- leak_category must be exactly one value from the list above. Pick the SINGLE biggest leak, and choose the MOST SPECIFIC category that fits. Definitions:
  • river_call_too_wide — called a river bet/raise with a marginal hand (2nd pair, weak pair, ace-high) that beats too few value combos for the price; the problem is a too-wide CALLING range (live rivers are underbluffed, so fold more).
  • turn_call_too_wide — called a turn bet / continued without the equity, price, or implied odds to justify it (floating or peeling too light).
  • overbluff — bet or raised as a bluff with little/no fold equity (bluffing a station, or into a range that won't fold); wrong bluff spot.
  • missed_value — had a STRONG made hand and checked or under-bet instead of betting/raising for value; left money on the table (esp. vs calling stations).
  • passive_play — the core issue is lack of aggression/initiative: checking back, calling instead of raising, not c-betting, no protection bet — with a hand that wanted to be the bettor. Use when no single strong-hand value spot was missed but the line was simply too passive.
  • bad_preflop — a preflop error: wrong open/call/3-bet/4-bet, bad sizing, or playing a dominated/trouble hand from the wrong position.
  • overpair_overplay — over-committed (stacked off / called a big bet) with an OVERPAIR that was beaten or up against a range that crushes it.
  • top_pair_overplay — over-committed with TOP PAIR / top-pair-top-kicker where one pair is no longer strong enough for the action faced.
  • draw_chasing — called with a draw lacking the pot/implied odds (chasing at a bad price).
  • no_clear_leak — hero played correctly, or this is advice with no committed action. No leak.
  DISAMBIGUATION: if the hero over-committed a SPECIFIC strong-ish hand, use overpair_overplay / top_pair_overplay — NOT the generic *_call_too_wide (those are for wide calls with marginal holdings). missed_value = a strong hand not bet for value; passive_play = general lack of aggression. Never invent a leak when mistakeType is "correct".
  EXAMPLES (leak_category): AA calling a tight reg's river jam on a wet board → overpair_overplay. Nut flush checked back on the turn → missed_value. Check-calling middle pair down with no aggression all hand → passive_play. Calling a $200 river bet with 2nd pair vs a live nit → river_call_too_wide.
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

  const leakFixSystemText = `You are a sharp poker coach writing a PERSONAL fix plan for ONE recurring leak, based on the player's OWN hands listed below. This is the paid payoff — it must read like you studied THEIR hands, not a generic tip.

CRITICAL: Return ONLY a JSON object. No text before or after. No markdown. No code fences. No backticks.

Required format:
{
  "summary": "One sentence naming the specific pattern you actually see across THESE hands — reference the common thread (positions, lines, board types, villain types).",
  "steps": ["3 to 4 concrete actions doable at the table. Each must reference the player's real tendency from the hands above, not one-size-fits-all advice.", "..."],
  "drill": "One concrete thing to consciously do in the next session to break this leak."
}

Rules:
- Only output the JSON. Nothing else.
- Be SPECIFIC to these hands. If they keep calling river jams in position with one pair, say exactly that. If the sample is thin, say what the few hands suggest — do not pad with generic theory.
- Each step under ~24 words. Direct, no hedging.
- Live population reads: live players underbluff big rivers (so fold more); fish/recs call too much and rarely bluff; nits rarely bluff. Use these where relevant.
- All amounts in dollars unless the hand says "bb".
${langGuideLeakFix[responseLang] ? '\n' + langGuideLeakFix[responseLang] : ''}`

  const debriefSystemText = `You are a sharp poker coach writing a SESSION DEBRIEF from the hands a player flagged in one session. Read the night as a WHOLE — patterns across hands, not a per-hand re-analysis. This is the recurring paid ritual, so it must feel like you watched their session.

CRITICAL: Return ONLY a JSON object. No text before or after. No markdown. No code fences. No backticks.

Required format:
{
  "headline": "One blunt sentence on the session's overall decision quality.",
  "topLeaks": ["2 to 3 recurring decision patterns across THIS session, each one line, most costly first."],
  "biggestSpot": "The single costliest spot of the session and the better line, with the actual cards/amounts.",
  "mental": "A tilt / mental-game observation IF the hands suggest one (e.g. spew after a cooler); otherwise an empty string.",
  "nextFocus": "ONE concrete thing to focus on next session."
}

Rules:
- Only output the JSON. Nothing else.
- Synthesize across hands — call out what REPEATS. Do not just describe each hand.
- Be specific: reference real cards, boards, and dollar amounts from the hands.
- Live population reads: live players underbluff big rivers (fold more); fish call too much and rarely bluff; nits rarely bluff.
- If the sample is small, say what the few hands suggest — do not pad with generic theory.
- "mental" must be an empty string if nothing in the hands points to tilt or mindset.
${langGuideDebrief[responseLang] ? '\n' + langGuideDebrief[responseLang] : ''}`

  const transcribeSystemText = `You transcribe a SPOKEN poker hand into clean text for later analysis. You are a transcriber, not a coach.

Rules:
- Transcribe what the speaker says: their cards, position, effective stack, bet sizes, street-by-street action, and any villain read.
- CONVERT every spoken card mention to standard notation — rank letter + suit letter. Ranks: A K Q J T 9 8 7 6 5 4 3 2 (ten = T). Suits: s h d c. Examples: "ace of spades" -> As, "king of hearts" -> Kh, "ten of clubs" -> Tc, "pocket queens" -> "QQ", "ace king suited" -> "AKs", "nine eight off" -> "98o".
- Keep dollar amounts and positions (BTN, CO, HJ, UTG, SB, BB) as spoken.
- Do NOT analyze, judge, or give advice. Only transcribe and normalise the cards. If the audio has no poker hand, return an empty transcript.

CRITICAL: Return ONLY a JSON object. No markdown, no code fences, no backticks:
{ "transcript": "the hand as one readable line, cards in notation" }`

  const systemText = isAnalysis   ? analysisSystemText
                   : isTranscribe ? transcribeSystemText
                   : isLeakFix    ? leakFixSystemText
                   : isDebrief    ? debriefSystemText
                   : followUpSystemText

  // The structured hand analysis is the paid product, so it gets the stronger
  // reasoning model (deeper on multi-street spots). Follow-up Q&A stays on flash —
  // simpler turns, far cheaper, fast.
  const model = isAnalysis ? 'gemini-2.5-pro' : 'gemini-2.5-flash'

  // Per-mode token budgets. thinkingBudget caps INTERNAL reasoning only — it does NOT
  // shorten the visible answer (maxOutputTokens leaves a comfortable buffer on top).
  // Only deep analysis needs heavy reasoning; flash modes cap thinking so dynamic
  // thinking (~8k) can't quietly inflate cost. Transcribe needs no reasoning at all.
  const thinkBudget = isAnalysis ? 8192 : isTranscribe ? 0 : isFollowUp ? 1024 : 2048
  const maxOut      = isAnalysis ? 9000 : isTranscribe ? 2048 : isFollowUp ? 2048 : 3584

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: {
            // Both 2.5 models are *thinking* models. maxOut = thinkBudget + a visible-
            // answer buffer (see above), so capping thinking bounds cost without
            // truncating the answer.
            maxOutputTokens: maxOut,
            thinkingConfig: { thinkingBudget: thinkBudget },
            // Analysis at temp 0 → far less run-to-run drift in the verdict, the
            // reasoning, and the EV number for the same hand (was 0.2 → noticeably
            // different explanations each call). Follow-up keeps a little warmth.
            temperature: (isAnalysis || isTranscribe) ? 0 : 0.3,
            // Force clean JSON (no markdown fences / prose) so extractJSON parses
            // reliably. Both analysis and follow-up paths expect JSON.
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const data = await geminiRes.json()
    if (data.error) throw new Error(data.error.message || 'Gemini API error')

    // Real token usage per call — `thinking` is the dominant, runtime-only cost and
    // the number to watch if tuning thinkingBudget; `output` is the visible JSON.
    const u = data.usageMetadata || {}
    console.log('[coach] tokens:', { model, prompt: u.promptTokenCount, thinking: u.thoughtsTokenCount, output: u.candidatesTokenCount, total: u.totalTokenCount })

    // Persist aggregated token usage (NO hand content) so we can compute real p50/p95
    // cost per mode/model/tier after 30 days and tune caps/pricing from data. Best-effort.
    if (SERVICE_ROLE) {
      const mode = isAnalysis ? 'analysis' : isTranscribe ? 'transcribe'
                 : isLeakFix ? 'leak_fix' : isDebrief ? 'session_debrief' : 'follow_up'
      const tier = user.is_anonymous ? 'anon' : isProUser ? 'pro' : 'free'
      try {
        await createClient(SUPABASE_URL, SERVICE_ROLE).from('usage_events').insert({
          user_id: user.id, tier, mode, model,
          prompt_tokens:   u.promptTokenCount   ?? null,
          thinking_tokens: u.thoughtsTokenCount ?? null,
          output_tokens:   u.candidatesTokenCount ?? null,
        })
      } catch { /* logging must never break a response */ }
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) throw new Error('Empty response from Gemini')

    console.log('[coach] raw response (200):', raw.slice(0, 200))

    // ── Voice transcription ───────────────────────────────────────────────────
    if (isTranscribe) {
      const parsed = extractJSON(raw)
      const transcript = parsed && typeof parsed.transcript === 'string' ? parsed.transcript : raw
      return res.status(200).json({ type: 'transcript', transcript: transcript.trim() })
    }

    // ── Initial analysis ────────────────────────────────────────────────────
    if (isAnalysis) {
      const parsed = extractJSON(raw)

      if (parsed) {
        const VALID_MISTAKE_TYPES = ['overcall', 'overbet', 'underbet', 'bad_bluff', 'wrong_fold', 'bad_sizing', 'missed_value', 'correct']
        const VALID_LEAK_CATS     = ['river_call_too_wide', 'turn_call_too_wide', 'overbluff', 'missed_value', 'passive_play', 'bad_preflop', 'overpair_overplay', 'top_pair_overplay', 'draw_chasing', 'no_clear_leak']

        const requestMode = parsed.requestMode === 'advice' ? 'advice' : 'post_mortem'

        const out = {
          requestMode,
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

        // Safety net: a recommendation (advice) is NOT a committed mistake, so it must
        // never pollute the Leak Profile — force it neutral regardless of the model (B-fix).
        if (requestMode === 'advice') {
          out.mistakeType    = 'correct'
          out.leak_category  = 'no_clear_leak'
          out.ev_impact      = 0
          out.biggestMistake = ''
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

    // ── Personalized leak fix-plan ────────────────────────────────────────────
    if (isLeakFix) {
      const parsed = extractJSON(raw)
      const steps = parsed && Array.isArray(parsed.steps)
        ? parsed.steps.filter(s => typeof s === 'string' && s.trim()).slice(0, 5)
        : []
      return res.status(200).json({
        type: 'leak_fix',
        leakFix: {
          summary: parsed && typeof parsed.summary === 'string' ? parsed.summary : '',
          steps,
          drill:   parsed && typeof parsed.drill === 'string' ? parsed.drill : '',
        },
      })
    }

    // ── Session debrief ───────────────────────────────────────────────────────
    if (isDebrief) {
      const parsed = extractJSON(raw)
      const topLeaks = parsed && Array.isArray(parsed.topLeaks)
        ? parsed.topLeaks.filter(s => typeof s === 'string' && s.trim()).slice(0, 4)
        : []
      return res.status(200).json({
        type: 'session_debrief',
        debrief: {
          headline:    parsed && typeof parsed.headline    === 'string' ? parsed.headline    : '',
          topLeaks,
          biggestSpot: parsed && typeof parsed.biggestSpot === 'string' ? parsed.biggestSpot : '',
          mental:      parsed && typeof parsed.mental      === 'string' ? parsed.mental      : '',
          nextFocus:   parsed && typeof parsed.nextFocus   === 'string' ? parsed.nextFocus   : '',
        },
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

// ── Lightweight "is this actually a poker hand?" check ──────────────────────
// Lenient by design: real hands (notation OR live-story text) easily pass; only
// clearly off-topic prompts ("what's the weather") fail. Two signals — either is
// enough: (a) ≥2 card tokens like "Ah Kd", or (b) ≥2 poker vocabulary hits.
function looksLikePoker(text) {
  if (!text || typeof text !== 'string') return false
  const cardTokens = (text.match(/\b(10|[2-9tjqka])[shdc]\b/gi) || []).length
  if (cardTokens >= 2) return true
  const t = text.toLowerCase()
  const KW = [
    'fold','call','raise','rais','bet','check','flop','turn','river','preflop','pre-flop',
    'blind','button','btn','utg','cutoff','hijack',' bb',' sb','pot','stack','effective',
    'all-in','all in','jam','shove','3-bet','3bet','4-bet','c-bet','cbet','villain','hero',
    'suited','offsuit','pocket','trips',' set','flush','straight','overpair','kicker','board',
    'nit','tag','lag','fish','limp','squeeze','pot odds','equity','range','poker','hand',
    'ace','king','queen','jack','aces','kings','queens',
  ]
  let hits = 0
  for (const w of KW) { if (t.includes(w) && ++hits >= 2) return true }
  return false
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
