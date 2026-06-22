#!/usr/bin/env node
// ============================================================================
// Onboard a KOL: create their Stripe promo code + insert the kols row.
//
// One shared coupon (10% off, repeating 12 months) is reused for everyone; each
// KOL gets their own promotion CODE pointing at it. The promo code is the
// attribution key the webhook reads to credit commission.
//
// Usage (run from app root):
//   STRIPE_SECRET_KEY=sk_live_... \
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/create-kol.mjs --code NOLAN --name "Nolan Lee" --email nolan@example.com
//
// Optional flags:
//   --rate 0.20        commission rate (default 0.20)
//   --percent 10       discount percent for the shared coupon (default 10)
//   --max 0            max redemptions for this code (0 = unlimited)
//
// Idempotent-ish: reuses the shared coupon if it already exists; Stripe rejects a
// duplicate promo code, so re-running with the same --code is a safe no-op error.
// ============================================================================
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SHARED_COUPON_LOOKUP = 'mpm-kol-yr1'  // metadata tag to find/reuse the coupon

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const code    = arg('code')
const name    = arg('name')
const email   = arg('email', null)
const rate    = parseFloat(arg('rate', '0.20'))
const percent = parseInt(arg('percent', '10'), 10)
const maxRed  = parseInt(arg('max', '0'), 10)

const { STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!code || !name) {
  console.error('Missing required flags. Need --code and --name.')
  process.exit(1)
}
if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY)
const admin  = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// 1. Find or create the shared "10% off, repeating 12 months" coupon.
async function getSharedCoupon() {
  const existing = await stripe.coupons.list({ limit: 100 })
  const found = existing.data.find(c => c.metadata?.lookup === SHARED_COUPON_LOOKUP)
  if (found) return found
  return stripe.coupons.create({
    percent_off:        percent,
    duration:           'repeating',
    duration_in_months: 12,
    name:               `MPM KOL — ${percent}% off year 1`,
    metadata:           { lookup: SHARED_COUPON_LOOKUP },
  })
}

async function main() {
  const coupon = await getSharedCoupon()
  console.log(`✓ coupon ${coupon.id} (${coupon.percent_off}% off, repeating ${coupon.duration_in_months}mo)`)

  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code:   code.toUpperCase(),
    ...(maxRed > 0 ? { max_redemptions: maxRed } : {}),
    metadata: { kol: name },
  })
  console.log(`✓ promo code ${promo.code} → ${promo.id}`)

  const { data, error } = await admin.from('kols').insert({
    name,
    email,
    promo_code:               promo.code,
    stripe_promotion_code_id: promo.id,
    stripe_coupon_id:         coupon.id,
    commission_rate:          rate,
  }).select('id').single()

  if (error) {
    console.error('✗ Supabase insert failed:', error.message)
    console.error('  (The Stripe promo code was still created — delete it in the dashboard if retrying.)')
    process.exit(1)
  }

  console.log(`✓ KOL row ${data.id}`)
  console.log(`\nDone. Give this to ${name}:`)
  console.log(`   Code: ${promo.code}  →  ${percent}% off, you earn ${Math.round(rate * 100)}% of revenue for their first year.`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
