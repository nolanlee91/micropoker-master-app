import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Creates a Stripe Checkout session for a Pro subscription and returns its URL.
// The caller MUST present a valid Supabase session (same gate as api/coach.js) so
// the resulting subscription is tied to a real user id — the webhook maps it back.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payments not configured' })
  }

  // ── Require a valid Supabase session ───────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' })

  // ── A subscription MUST attach to a real, confirmed account ────────────────
  // The anonymous guest's UUID dies with the browser/cache — if we let it buy Pro,
  // the customer pays but loses access on any new device or cache clear, with no
  // way back into the same subscription. Likewise a typo'd / unconfirmed email
  // would strand them. So require a confirmed-email account before checkout; the
  // frontend turns this 403 into "create an account" instead of an error.
  if (user.is_anonymous) {
    return res.status(403).json({ code: 'ACCOUNT_REQUIRED', error: 'Please create an account before subscribing.' })
  }
  if (!user.email) {
    return res.status(403).json({ code: 'ACCOUNT_REQUIRED', error: 'Add an email to your account before subscribing.' })
  }
  if (!user.email_confirmed_at && !user.confirmed_at) {
    return res.status(403).json({ code: 'EMAIL_UNCONFIRMED', error: 'Please confirm your email (check your inbox) before subscribing.' })
  }

  // ── Resolve the price for the requested plan ───────────────────────────────
  const { plan } = req.body || {}
  const priceId = plan === 'annual'
    ? process.env.STRIPE_PRICE_ANNUAL
    : process.env.STRIPE_PRICE_MONTHLY
  if (!priceId) return res.status(500).json({ error: 'Price not configured' })

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  // Reuse this user's existing Stripe customer if we already have one (avoids
  // duplicate customers on repeat checkouts). Looked up via service role.
  let customerId = null
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (SERVICE_ROLE) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      customerId = data?.stripe_customer_id || null
    } catch { /* non-fatal — Checkout will create a customer */ }
  }

  // ── Block a DUPLICATE subscription ─────────────────────────────────────────
  // We keep ONE subscriptions row per user, so a second checkout would orphan the
  // first sub (still billing on Stripe) while the DB forgets it — and account
  // deletion would then only cancel the remembered one, leaving the other to bill
  // forever. So if this customer already has a live subscription on Stripe, refuse
  // and send them to the Billing Portal (frontend turns ALREADY_SUBSCRIBED into
  // "Manage subscription"). New buyers have no customerId yet → skip this check.
  if (customerId) {
    const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid']
    try {
      const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 })
      if (list.data.some((s) => LIVE_STATUSES.includes(s.status))) {
        return res.status(409).json({ code: 'ALREADY_SUBSCRIBED', error: 'You already have an active subscription — manage it from your account.' })
      }
    } catch (e) {
      // Fail CLOSED: if we can't verify, don't risk a duplicate charge. Only users
      // who already have a customer record hit this, so a brief Stripe hiccup just
      // asks them to retry — it never blocks a genuine first purchase.
      console.error('[checkout] could not verify existing subscriptions:', e.message)
      return res.status(503).json({ error: 'Could not verify your subscription status. Please try again in a moment.' })
    }
  }

  const origin = req.headers.origin || `https://${req.headers.host}`

  try {
    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Tie the checkout back to the Supabase user so the webhook can map it.
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
      success_url: `${origin}/leaks?checkout=success`,
      cancel_url:  `${origin}/leaks?checkout=cancel`,
      allow_promotion_codes: true,
    }
    if (customerId) params.customer = customerId
    else if (user.email) params.customer_email = user.email

    const session = await stripe.checkout.sessions.create(params)
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[checkout] error:', err.message)
    return res.status(500).json({ error: err.message || 'Checkout failed' })
  }
}
