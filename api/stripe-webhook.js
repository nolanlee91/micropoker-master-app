import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Stripe signature verification needs the RAW request body, so disable Vercel's
// automatic JSON body parsing for this route.
export const config = { api: { bodyParser: false } }

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const WEBHOOK_SECRET    = process.env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_ROLE      = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!STRIPE_SECRET_KEY || !WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  // ── Verify the event actually came from Stripe ─────────────────────────────
  let event
  try {
    const raw = await readRawBody(req)
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WEBHOOK_SECRET)
  } catch (err) {
    console.error('[webhook] signature verify failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // Upsert the subscriptions row from a Stripe Subscription object. Pro is derived
  // downstream from status + current_period_end, so we just mirror Stripe here.
  async function upsertFromSubscription(sub, userIdHint) {
    const userId = userIdHint || sub.metadata?.supabase_user_id
    if (!userId) { console.warn('[webhook] missing supabase_user_id on sub', sub.id); return }
    const item = sub.items?.data?.[0]
    // current_period_end lives on the Subscription in older API versions and on the
    // subscription ITEM in newer ones (2025-03+/dahlia). Read whichever is present.
    const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null
    const row = {
      user_id:                userId,
      stripe_customer_id:     typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      stripe_subscription_id: sub.id,
      status:                 sub.status,
      price_id:               item?.price?.id || null,
      current_period_end:     periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end:   !!sub.cancel_at_period_end,
      updated_at:             new Date().toISOString(),
    }
    const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' })
    if (error) console.error('[webhook] upsert error:', error.message)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id || session.metadata?.supabase_user_id
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          await upsertFromSubscription(sub, userId)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // status 'canceled' + past period_end → entitlement check returns false.
        await upsertFromSubscription(event.data.object)
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[webhook] handler error:', err.message)
    return res.status(500).json({ error: err.message })
  }

  return res.status(200).json({ received: true })
}
