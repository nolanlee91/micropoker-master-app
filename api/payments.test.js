import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks for the two external modules every payment handler imports ──────────
// A single set of controllable handles drives all tests.
const sb = {
  getUser: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  tables: {}, // table name -> result object { data, error, count }
}
const stripeH = {
  constructEvent: vi.fn(),
  retrieveSub: vi.fn(),
  cancelSub: vi.fn(),
  createSession: vi.fn(),
  listSubs: vi.fn(),
}

// Chainable, thenable query builder: resolves to the per-table result whether the
// chain ends in .maybeSingle()/.single() or is awaited directly (upsert/insert/eq).
function builder(result) {
  const b = {}
  const self = () => b
  b.select = vi.fn(self)
  b.eq = vi.fn(self)
  b.upsert = vi.fn(self)
  b.insert = vi.fn(self)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  b.single = vi.fn(() => Promise.resolve(result))
  b.then = (onF, onR) => Promise.resolve(result).then(onF, onR) // make `await builder` work
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: (...a) => sb.getUser(...a),
      admin: {
        getUserById: (...a) => sb.getUserById(...a),
        deleteUser: (...a) => sb.deleteUser(...a),
      },
    },
    from: (table) => builder(sb.tables[table] ?? { data: null, error: null }),
  }),
}))

vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: (...a) => stripeH.constructEvent(...a) }
    subscriptions = { retrieve: (...a) => stripeH.retrieveSub(...a), cancel: (...a) => stripeH.cancelSub(...a), list: (...a) => stripeH.listSubs(...a) }
    checkout = { sessions: { create: (...a) => stripeH.createSession(...a) } }
  },
}))

// ── tiny req/res doubles ─────────────────────────────────────────────────────
function makeRes() {
  const res = { statusCode: 200, body: undefined, headers: {} }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.send = (b) => { res.body = b; return res }
  res.end = () => res
  return res
}
const jsonReq = (body = {}, headers = {}) => ({ method: 'POST', headers: { authorization: 'Bearer t', ...headers }, body })
const rawReq = (raw = '{}', headers = {}) => ({
  method: 'POST',
  headers: { 'stripe-signature': 'sig', ...headers },
  on(ev, cb) { if (ev === 'data') cb(Buffer.from(raw)); if (ev === 'end') cb(); return this },
})

beforeEach(() => {
  vi.clearAllMocks()
  sb.tables = {}
  Object.assign(process.env, {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'svc',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec',
    STRIPE_PRICE_MONTHLY: 'price_m',
    STRIPE_PRICE_ANNUAL: 'price_y',
  })
})

// ── P0-1: anonymous / unconfirmed cannot start checkout ──────────────────────
describe('create-checkout-session — account gate', () => {
  it('rejects an anonymous guest with ACCOUNT_REQUIRED and never calls Stripe', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'g1', is_anonymous: true } }, error: null })
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('ACCOUNT_REQUIRED')
    expect(stripeH.createSession).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed email with EMAIL_UNCONFIRMED', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false, email: 'a@b.com', email_confirmed_at: null, confirmed_at: null } }, error: null })
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('EMAIL_UNCONFIRMED')
    expect(stripeH.createSession).not.toHaveBeenCalled()
  })

  it('allows a confirmed account and returns the Stripe URL', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u1', is_anonymous: false, email: 'a@b.com', email_confirmed_at: '2026-01-01' } }, error: null })
    stripeH.createSession.mockResolvedValue({ url: 'https://stripe.test/checkout' })
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.url).toBe('https://stripe.test/checkout')
    expect(stripeH.createSession).toHaveBeenCalledTimes(1)
  })
})

// ── P0-2: delete-account fails CLOSED if the subscription lookup errors ───────
describe('delete-account — fail-closed', () => {
  it('does NOT delete the user if the subscription lookup returns an error', async () => {
    const { default: handler } = await import('./delete-account.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    sb.tables.subscriptions = { data: null, error: { message: 'db down' } }
    const res = makeRes()
    await handler(jsonReq(), res)
    expect(res.statusCode).toBe(500)
    expect(sb.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the user when there is no subscription', async () => {
    const { default: handler } = await import('./delete-account.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    sb.tables.subscriptions = { data: null, error: null }
    sb.deleteUser.mockResolvedValue({ error: null })
    const res = makeRes()
    await handler(jsonReq(), res)
    expect(res.statusCode).toBe(200)
    expect(sb.deleteUser).toHaveBeenCalledTimes(1)
    expect(stripeH.cancelSub).not.toHaveBeenCalled()
  })
})

// ── P0-3: webhook 500s on a failed upsert so Stripe RETRIES (no silent drop) ──
describe('stripe-webhook — retry on DB failure', () => {
  const subEvent = {
    type: 'customer.subscription.created',
    data: { object: { id: 'sub1', status: 'active', customer: 'cus1', metadata: { supabase_user_id: 'u1' }, items: { data: [{ price: { id: 'price_m' }, current_period_end: 1893456000 }] } } },
  }

  it('returns 500 when the subscriptions upsert fails', async () => {
    const { default: handler } = await import('./stripe-webhook.js')
    stripeH.constructEvent.mockReturnValue(subEvent)
    sb.tables.subscriptions = { data: null, error: { message: 'upsert boom' } }
    const res = makeRes()
    await handler(rawReq(), res)
    expect(res.statusCode).toBe(500)
  })

  it('returns 200 when the upsert succeeds', async () => {
    const { default: handler } = await import('./stripe-webhook.js')
    stripeH.constructEvent.mockReturnValue(subEvent)
    sb.tables.subscriptions = { data: null, error: null }
    const res = makeRes()
    await handler(rawReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.received).toBe(true)
  })
})

// ── P0: checkout refuses a DUPLICATE subscription (no double billing) ─────────
describe('create-checkout-session — duplicate subscription guard', () => {
  const confirmed = { data: { user: { id: 'u1', is_anonymous: false, email: 'a@b.com', email_confirmed_at: '2026-01-01' } }, error: null }

  it('blocks with ALREADY_SUBSCRIBED when the customer has a live sub, and never creates a session', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue(confirmed)
    sb.tables.subscriptions = { data: { stripe_customer_id: 'cus1' }, error: null }
    stripeH.listSubs.mockResolvedValue({ data: [{ status: 'active' }] })
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('ALREADY_SUBSCRIBED')
    expect(stripeH.createSession).not.toHaveBeenCalled()
  })

  it('ALLOWS checkout when the only existing sub is canceled (re-subscribe)', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue(confirmed)
    sb.tables.subscriptions = { data: { stripe_customer_id: 'cus1' }, error: null }
    stripeH.listSubs.mockResolvedValue({ data: [{ status: 'canceled' }] })
    stripeH.createSession.mockResolvedValue({ url: 'https://stripe.test/checkout' })
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(200)
    expect(stripeH.createSession).toHaveBeenCalledTimes(1)
  })

  it('fails closed (503) if the existing-subscription check throws', async () => {
    const { default: handler } = await import('./create-checkout-session.js')
    sb.getUser.mockResolvedValue(confirmed)
    sb.tables.subscriptions = { data: { stripe_customer_id: 'cus1' }, error: null }
    stripeH.listSubs.mockRejectedValue(new Error('stripe down'))
    const res = makeRes()
    await handler(jsonReq({ plan: 'monthly' }), res)
    expect(res.statusCode).toBe(503)
    expect(stripeH.createSession).not.toHaveBeenCalled()
  })
})

// ── P1: a cancel/delete event for an already-deleted user is a no-op, not a 500 ─
describe('stripe-webhook — deleted-user cancel is a no-op', () => {
  const deletedEvent = {
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub1', status: 'canceled', customer: 'cus1', metadata: { supabase_user_id: 'gone' }, items: { data: [{ price: { id: 'price_m' } }] } } },
  }

  it('returns 200 (not 500) when the upsert hits a foreign-key violation (user gone)', async () => {
    const { default: handler } = await import('./stripe-webhook.js')
    stripeH.constructEvent.mockReturnValue(deletedEvent)
    sb.tables.subscriptions = { data: null, error: { code: '23503', message: 'fk violation' } }
    const res = makeRes()
    await handler(rawReq(), res)
    expect(res.statusCode).toBe(200)
  })
})

// ── P1: migrate-guest-data won't dump into a non-eligible / non-empty target ──
describe('migrate-guest-data — target guards', () => {
  it('rejects a target account that does not exist', async () => {
    const { default: handler } = await import('./migrate-guest-data.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'guest1' } }, error: null })
    sb.getUserById.mockResolvedValue({ data: { user: null }, error: null })
    const res = makeRes()
    await handler(jsonReq({ targetUserId: 'ghost' }), res)
    expect(res.statusCode).toBe(404)
  })

  it('rejects a target account that is too old to be a fresh signup', async () => {
    const { default: handler } = await import('./migrate-guest-data.js')
    sb.getUser.mockResolvedValue({ data: { user: { id: 'guest1' } }, error: null })
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1h old
    sb.getUserById.mockResolvedValue({ data: { user: { id: 'old1', created_at: old } }, error: null })
    const res = makeRes()
    await handler(jsonReq({ targetUserId: 'old1' }), res)
    expect(res.statusCode).toBe(403)
  })
})
