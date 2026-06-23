import { createClient } from '@supabase/supabase-js'

// Best-effort: copy a guest's cloud data (sessions + hands) onto a freshly created
// account, so the leak profile carries over when a guest signs up. Called right after
// signUp, while the guest session token is still valid (it proves ownership of the
// source rows). RLS would otherwise block reading the guest's rows once the user signs
// in as the new account — so this runs server-side with the service-role key.
//
// Safety: the new (target) account must currently be EMPTY — we never merge into an
// account that already has data (prevents double-migration and dumping into someone
// else's established account).
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

  // The caller must present the GUEST session token → that's the source of the data.
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user: guest }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !guest) return res.status(401).json({ error: 'Unauthorized' })

  const sourceId = guest.id
  const { targetUserId } = req.body || {}
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' })
  if (targetUserId === sourceId) return res.status(200).json({ ok: true, skipped: 'same user' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // We can't authenticate the TARGET here — right after signUp (email confirmation
  // is mandatory) it has no session yet, only the guest token exists. So we defend
  // ownership with three checks that together make it impractical to dump data into
  // an account you don't own: the target must (a) exist, (b) be freshly created — the
  // legit call happens seconds after signUp — and (c) be empty (below).
  try {
    const { data: tu, error: tuErr } = await admin.auth.admin.getUserById(targetUserId)
    if (tuErr || !tu?.user) return res.status(404).json({ error: 'target not found' })
    const ageMs = Date.now() - new Date(tu.user.created_at).getTime()
    if (!(ageMs >= 0) || ageMs > 15 * 60 * 1000) {
      return res.status(403).json({ error: 'target not eligible for migration' })
    }
  } catch (e) {
    console.error('[migrate-guest-data] target lookup failed:', e.message)
    return res.status(500).json({ error: 'target lookup failed' })
  }

  try {
    // Guard: only migrate into a brand-new, EMPTY account. Supabase returns { error }
    // without throwing — if we ignored it, a failed count would read as "empty" and
    // we'd risk dumping into a non-empty account. Fail closed on a precheck error.
    const [hRes, sRes] = await Promise.all([
      admin.from('hand_history').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
      admin.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    ])
    if (hRes.error || sRes.error) {
      console.error('[migrate-guest-data] empty-check failed:', hRes.error?.message || sRes.error?.message)
      return res.status(500).json({ error: 'precheck failed' })
    }
    if ((hRes.count || 0) > 0 || (sRes.count || 0) > 0) {
      return res.status(200).json({ ok: true, skipped: 'target not empty' })
    }

    // Read source data — abort on a read error (don't report a hollow success).
    const { data: sessions, error: sReadErr } = await admin.from('sessions').select('*').eq('user_id', sourceId)
    if (sReadErr) { console.error('[migrate-guest-data] read sessions failed:', sReadErr.message); return res.status(500).json({ error: 'read failed' }) }
    const { data: hands, error: hReadErr } = await admin.from('hand_history').select('*').eq('user_id', sourceId)
    if (hReadErr) { console.error('[migrate-guest-data] read hands failed:', hReadErr.message); return res.status(500).json({ error: 'read failed' }) }

    // Copy sessions first, mapping old id → new id for the hand FK. Track per-row
    // insert failures so the response reports what actually moved (no false success).
    const idMap = {}
    let sessFail = 0, handFail = 0
    for (const s of (sessions || [])) {
      const { id, user_id, ...rest } = s
      const { data: ins, error } = await admin
        .from('sessions').insert({ ...rest, user_id: targetUserId }).select('id').single()
      if (error) { sessFail++; continue }
      if (ins) idMap[id] = ins.id
    }

    // Copy hands, remapping session_id.
    for (const h of (hands || [])) {
      const { id, user_id, session_id, ...rest } = h
      const { error } = await admin.from('hand_history').insert({
        ...rest,
        user_id: targetUserId,
        session_id: session_id ? (idMap[session_id] || null) : null,
      })
      if (error) handFail++
    }

    return res.status(200).json({
      ok: true,
      sessions: (sessions?.length || 0) - sessFail,
      hands: (hands?.length || 0) - handFail,
      ...(sessFail || handFail ? { failed: { sessions: sessFail, hands: handFail } } : {}),
    })
  } catch (err) {
    console.error('[migrate-guest-data] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
