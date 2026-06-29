import { createClient } from '@supabase/supabase-js'

// Record marketing attribution (UTM first/last touch) — see db/migration-7.
// Two modes:
//   • stamp: attribute the caller's OWN session (anon or real). Called on app load
//     when there is a campaign signal (utm_* or a forwarded referrer).
//   • link: called right after signUp — email confirmation is mandatory, so the new
//     account has NO session yet, only the guest token. Copies the captured touches
//     onto the new real account and records which anon it came from, so the funnel
//     click → hand → signup → paid can be stitched. Mirrors /api/migrate-guest-data.
//
// Writes via the service-role key — marketing_attribution is service-role-only (RLS
// on, no policies), so the client can never read another user's attribution. This is
// the UTM/funnel layer, deliberately separate from KOL commission attribution.

const TOUCH_FIELDS = ['source', 'medium', 'campaign', 'content', 'referrer', 'landing_path', 'captured_at']

// Keep only known fields, stringify + length-cap, and report whether the touch
// carries any real signal (not just a captured_at timestamp).
function cleanTouch(t) {
  if (!t || typeof t !== 'object') return null
  const out = {}
  let any = false
  for (const f of TOUCH_FIELDS) {
    const v = t[f]
    if (v == null) { out[f] = null; continue }
    out[f] = String(v).slice(0, 500)
    if (f !== 'captured_at') any = true
  }
  return any ? out : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE      = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Not configured' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user: caller }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !caller) return res.status(401).json({ error: 'Unauthorized' })

  const { mode, firstTouch, lastTouch, targetUserId } = req.body || {}
  const first = cleanTouch(firstTouch)
  const last  = cleanTouch(lastTouch)
  if (!first && !last) return res.status(200).json({ ok: true, skipped: 'no attribution' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // Resolve who this row belongs to + whether it's an anon stamp or a signup link.
  let userId, isAnonymous, fromAnon = null
  if (mode === 'link') {
    // Caller is the GUEST (anon); target is the freshly created real account. We
    // can't authenticate the target yet (no session pre-confirmation), so defend
    // ownership the same way migrate-guest-data does: it must exist and be < 15 min
    // old (the legit call fires seconds after signUp).
    if (!targetUserId || targetUserId === caller.id) {
      return res.status(400).json({ error: 'targetUserId required' })
    }
    try {
      const { data: tu, error } = await admin.auth.admin.getUserById(targetUserId)
      if (error || !tu?.user) return res.status(404).json({ error: 'target not found' })
      const ageMs = Date.now() - new Date(tu.user.created_at).getTime()
      if (!(ageMs >= 0) || ageMs > 15 * 60 * 1000) {
        return res.status(403).json({ error: 'target not eligible' })
      }
    } catch (e) {
      console.error('[track-attribution] target lookup failed:', e.message)
      return res.status(500).json({ error: 'target lookup failed' })
    }
    userId = targetUserId
    isAnonymous = false
    fromAnon = caller.id
  } else {
    userId = caller.id
    isAnonymous = !!caller.is_anonymous
  }

  try {
    // Read-modify-write: last-touch always overwrites; first-touch is preserved
    // once set (the channel that ORIGINALLY brought them).
    const { data: existing, error: selErr } = await admin
      .from('marketing_attribution').select('first_captured_at').eq('user_id', userId).maybeSingle()
    if (selErr) { console.error('[track-attribution] lookup failed:', selErr.message); return res.status(500).json({ error: 'lookup failed' }) }

    const payload = { user_id: userId, is_anonymous: isAnonymous, updated_at: new Date().toISOString() }
    if (fromAnon) payload.signed_up_from_anon = fromAnon
    if (last) for (const f of TOUCH_FIELDS) payload['last_' + f] = last[f] ?? null
    if (!existing || !existing.first_captured_at) {
      const ft = first || last
      if (ft) for (const f of TOUCH_FIELDS) payload['first_' + f] = ft[f] ?? null
    }

    const { error: upErr } = await admin
      .from('marketing_attribution').upsert(payload, { onConflict: 'user_id' })
    if (upErr) { console.error('[track-attribution] upsert failed:', upErr.message); return res.status(500).json({ error: upErr.message }) }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[track-attribution] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
