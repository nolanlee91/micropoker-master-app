import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Creates a Stripe Billing Portal session so a Pro user can manage their own
// subscription (update card, cancel, see invoices) on Stripe's hosted page.
// Same auth gate as checkout: a valid Supabase session is required, and we resolve
// the Stripe customer from the subscriptions row the webhook wrote for this user.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const SERVICE_ROLE      = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Billing portal not configured' })
  }

  // ── Require a valid Supabase session ───────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' })

  // ── Resolve this user's Stripe customer from their subscription row ─────────
  let customerId = null
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    customerId = data?.stripe_customer_id || null
  } catch { /* fall through to the no-customer error below */ }

  if (!customerId) {
    return res.status(400).json({ error: 'No subscription found for this account.' })
  }

  const origin = req.headers.origin || `https://${req.headers.host}`

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/leaks`,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[portal] error:', err.message)
    return res.status(500).json({ error: err.message || 'Could not open billing portal.' })
  }
}
