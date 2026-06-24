-- ════════════════════════════════════════════════════════════════════════════
--  Migration 6: complimentary Pro grants (comps) — decoupled from Stripe.
--  Run once in the Supabase SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Use this to give a KOL / tester free Pro for N days WITHOUT faking a row in
-- `subscriptions`. A fake subscription row breaks things: after it "expires" the
-- user still reads as hasSubscription=true → they see "Manage subscription" + a
-- false "payment failed" notice, the Billing Portal errors (no real Stripe
-- customer), and they never see "Go Pro" to actually buy.
--
-- Instead, Pro entitlement is:  (real Stripe sub active/trialing & not expired)
--                               OR  (a live row here: complimentary_until > now())
-- coach.js (server) and usePro.js (client) both apply this OR.

create table if not exists pro_grants (
  user_id             uuid        not null primary key references auth.users(id) on delete cascade,
  complimentary_until timestamptz not null,
  reason              text,                 -- e.g. 'KOL pilot — Alice'
  created_at          timestamptz not null default now()
);

alter table pro_grants enable row level security;
-- The client may READ its own grant (usePro entitlement check); only the
-- service role (admin scripts / SQL editor) writes. No insert/update/delete policy.
drop policy if exists "pro_grants_read_own" on pro_grants;
create policy "pro_grants_read_own" on pro_grants
  for select using (auth.uid() = user_id);

-- Comp a user 30 days of Pro (run after they've created an account):
--   insert into pro_grants (user_id, complimentary_until, reason)
--   values ('<USER_UUID>', now() + interval '30 days', 'KOL pilot — <name>')
--   on conflict (user_id) do update
--     set complimentary_until = excluded.complimentary_until, reason = excluded.reason;
