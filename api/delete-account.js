import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Permanently delete the signed-in user's account.
//
// CRITICAL ordering: cancel any Stripe subscription BEFORE deleting the Supabase
// user. If we deleted first, the subscriptions row (which holds the Stripe IDs)
// would be gone and Stripe would keep charging the card forever with no way for
// the user to get back in and cancel. So: read the Stripe IDs → cancel on Stripe
// → only then delete the auth user (which cascade-removes all their data).
//
// Stripe cancellation is best-effort and immediate (the account is being wiped, so
// "keep access until period end" is meaningless — there'd be no account to use).
// A missing/already-canceled sub is not an error; we log it and still delete.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE      = process.env.SUPABASE_SERVICE_ROLE_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  // Service role is required (we delete an auth user). Stripe key is required too —
  // without it we could not guarantee the subscription is canceled, and deleting the
  // account anyway would orphan a live, billing subscription. So fail closed.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE || !STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Account deletion is not configured. Please contact support.' })
  }

  // ── Require a valid Supabase session ───────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // ── 1. Cancel the Stripe subscription (if any) BEFORE deleting anything ─────
  try {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const subId = sub?.stripe_subscription_id
    if (subId) {
      const stripe = new Stripe(STRIPE_SECRET_KEY)
      try {
        await stripe.subscriptions.cancel(subId)
        console.log('[delete-account] canceled Stripe sub', subId, 'for user', user.id)
      } catch (e) {
        // Already canceled / not found → fine, the goal (no future billing) holds.
        const code = e?.code || e?.statusCode
        if (code === 'resource_missing' || code === 404) {
          console.log('[delete-account] Stripe sub', subId, 'already gone:', e.message)
        } else {
          // A real Stripe failure: do NOT delete the account, or we'd orphan a
          // billing subscription. Surface it so the user can retry / contact us.
          console.error('[delete-account] Stripe cancel failed:', e.message)
          return res.status(502).json({ error: 'Could not cancel your subscription. Please try again, or contact support before deleting.' })
        }
      }
    }
  } catch (e) {
    console.error('[delete-account] subscription lookup failed:', e.message)
    return res.status(500).json({ error: 'Could not verify your subscription. Please try again.' })
  }

  // ── 2. Delete the auth user (cascades all their rows via FK on auth.users) ──
  try {
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error('[delete-account] deleteUser failed:', delErr.message)
      return res.status(500).json({ error: 'Could not delete your account. Please try again.' })
    }
  } catch (e) {
    console.error('[delete-account] deleteUser threw:', e.message)
    return res.status(500).json({ error: 'Could not delete your account. Please try again.' })
  }

  return res.status(200).json({ ok: true })
}
