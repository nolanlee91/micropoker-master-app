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

    // Out-of-order guard: the table keeps ONE row per user (PK user_id), so a late
    // event from an OLD subscription could otherwise clobber the user's CURRENT one.
    // A new active/trialing subscription always takes over; but a non-active event
    // (canceled/deleted/etc.) is only allowed to write if it's for the subscription
    // currently on record — a stale cancel for a different (older) sub is ignored.
    const incomingActive = ['active', 'trialing'].includes(sub.status)
    if (!incomingActive) {
      const { data: cur } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== sub.id) {
        console.log('[webhook] ignoring stale', sub.status, 'event for old sub', sub.id, '(current:', cur.stripe_subscription_id + ')')
        return
      }
    }

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
    // THROW (don't just log) so the handler returns 500 and Stripe RETRIES. Returning
    // 200 on a failed upsert means a paying customer never gets Pro and Stripe never
    // tries again. Upsert is idempotent on user_id, so retries are safe.
    if (error) throw new Error(`subscriptions upsert failed: ${error.message}`)
  }

  // Record a KOL commission for a paid invoice — IF the subscription still carries
  // a promo code that maps to a KOL. The promo code (e.g. NOLAN) is the attribution
  // key: the customer entered it at checkout to get 10% off. We pay 20% of what they
  // ACTUALLY paid (invoice.amount_paid, already net of the discount).
  //
  // Year-1 cap is automatic: the coupon is `repeating 12 months`, so after a year the
  // discount drops off the invoice → no promo code here → no commission. The discount
  // being present IS the "still within year 1" signal — no date math required.
  async function recordCommission(invoice) {
    // Subscription invoices only; ignore one-off / $0 invoices.
    const subId = typeof invoice.subscription === 'string'
      ? invoice.subscription : invoice.subscription?.id
    if (!subId) return
    const amountPaid = invoice.amount_paid || 0
    if (amountPaid <= 0) return

    // Read the promotion code off the subscription's active discount(s). Retrieve
    // expanded so we get the Discount object (the webhook payload only has ids).
    let sub
    try {
      sub = await stripe.subscriptions.retrieve(subId, { expand: ['discounts'] })
    } catch (err) {
      console.error('[webhook] commission: sub retrieve failed', err.message); return
    }
    const discounts = sub.discounts?.length ? sub.discounts : (sub.discount ? [sub.discount] : [])
    let promoCodeId = null
    for (const d of discounts) {
      const pc = (typeof d === 'object' && d) ? d.promotion_code : null
      if (pc) { promoCodeId = typeof pc === 'string' ? pc : pc.id; break }
    }
    if (!promoCodeId) return  // no KOL promo on this invoice → nothing to pay

    // Map the promo code → KOL.
    const { data: kol } = await admin
      .from('kols')
      .select('id, email, commission_rate, active')
      .eq('stripe_promotion_code_id', promoCodeId)
      .maybeSingle()
    if (!kol || kol.active === false) return

    // Anti-abuse: a KOL can't earn commission off their own subscription.
    const buyerEmail = (invoice.customer_email || '').trim().toLowerCase()
    if (kol.email && buyerEmail && kol.email.trim().toLowerCase() === buyerEmail) {
      console.log('[webhook] commission: self-referral blocked for', promoCodeId); return
    }

    const userId = sub.metadata?.supabase_user_id || invoice.metadata?.supabase_user_id || null
    const rate = kol.commission_rate ?? 0.20
    const commission = Math.round(amountPaid * rate)

    // Idempotent on stripe_invoice_id (UNIQUE) — a re-delivered webhook is a no-op.
    const { error } = await admin.from('commissions').insert({
      kol_id:                 kol.id,
      user_id:                userId,
      stripe_invoice_id:      invoice.id,
      stripe_subscription_id: subId,
      promo_code_id:          promoCodeId,
      currency:               invoice.currency || 'usd',
      gross_amount:           amountPaid,
      commission_amount:      commission,
      paid_at:                invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
    })
    // 23505 = unique violation = already recorded (idempotent re-delivery) → fine.
    // Any OTHER error: THROW so the handler 500s and Stripe retries — don't silently
    // drop a commission the KOL is owed. Retry re-hits the same idempotent insert.
    if (error && error.code !== '23505') {
      throw new Error(`commission insert failed: ${error.message}`)
    }
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
      case 'invoice.paid': {
        // Each successful charge (first + every renewal) → KOL commission if a promo
        // code is attached. recordCommission self-limits to year 1 via the coupon.
        await recordCommission(event.data.object)
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
