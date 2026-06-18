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

  const origin = req.headers.origin || `https://${req.headers.host}`

  try {
    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Tie the checkout back to the Supabase user so the webhook can map it.
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
      success_url: `${origin}/coach?checkout=success`,
      cancel_url:  `${origin}/coach?checkout=cancel`,
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
