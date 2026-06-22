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

  try {
    // Guard: only migrate into a brand-new, empty account.
    const [{ count: tHands }, { count: tSessions }] = await Promise.all([
      admin.from('hand_history').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
      admin.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    ])
    if ((tHands || 0) > 0 || (tSessions || 0) > 0) {
      return res.status(200).json({ ok: true, skipped: 'target not empty' })
    }

    // Copy sessions first, mapping old id → new id for the hand FK.
    const { data: sessions } = await admin.from('sessions').select('*').eq('user_id', sourceId)
    const idMap = {}
    for (const s of (sessions || [])) {
      const { id, user_id, ...rest } = s
      const { data: ins } = await admin
        .from('sessions').insert({ ...rest, user_id: targetUserId }).select('id').single()
      if (ins) idMap[id] = ins.id
    }

    // Copy hands, remapping session_id.
    const { data: hands } = await admin.from('hand_history').select('*').eq('user_id', sourceId)
    for (const h of (hands || [])) {
      const { id, user_id, session_id, ...rest } = h
      await admin.from('hand_history').insert({
        ...rest,
        user_id: targetUserId,
        session_id: session_id ? (idMap[session_id] || null) : null,
      })
    }

    return res.status(200).json({ ok: true, sessions: sessions?.length || 0, hands: hands?.length || 0 })
  } catch (err) {
    console.error('[migrate-guest-data] error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
