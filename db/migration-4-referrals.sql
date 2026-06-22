-- ================================================================
-- MicroPoker Master — Migration 4: KOL referrals / commissions
-- Run in the Supabase SQL Editor (after migration.sql).
-- ================================================================
--
-- Model (decided 2026-06-21):
--   • Each KOL gets a Stripe promotion code (e.g. NOLAN) → 10% off, repeating 12
--     months (coupon shared by all KOLs). The promo code IS the attribution key.
--   • Commission = 20% of the amount the customer ACTUALLY paid (net of the 10%
--     discount), for the first year only.
--   • Year-1 cap is automatic: the coupon expires after 12 months → the discount
--     disappears from the invoice → the webhook stops recording commission. No
--     separate date guard needed.
--
-- Both tables have RLS enabled with NO policies on purpose: this is private
-- business data, written/read ONLY by the Stripe webhook + admin scripts using
-- the service-role key (which bypasses RLS). The client can never see it.

-- ── KOLs ─────────────────────────────────────────────────────
create table if not exists kols (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  email                    text,                       -- payout contact + self-referral guard
  promo_code               text not null,              -- human-facing code, e.g. NOLAN (display only)
  stripe_promotion_code_id text not null unique,       -- promo_xxx → the real attribution key
  stripe_coupon_id         text,
  commission_rate          numeric(4,3) not null default 0.20,
  active                   boolean not null default true,
  created_at               timestamptz not null default now()
);

alter table kols enable row level security;            -- no policies → service-role only

create index if not exists kols_promo_idx on kols (stripe_promotion_code_id);

-- ── Commissions ──────────────────────────────────────────────
-- One row per paid invoice that earned commission. stripe_invoice_id is UNIQUE
-- so a re-delivered webhook can't double-credit (idempotency).
create table if not exists commissions (
  id                     uuid primary key default gen_random_uuid(),
  kol_id                 uuid not null references kols(id) on delete cascade,
  user_id                uuid references auth.users(id) on delete set null,
  stripe_invoice_id      text not null unique,         -- idempotency key
  stripe_subscription_id text,
  promo_code_id          text,
  currency               text not null default 'usd',
  gross_amount           int  not null,                -- cents the customer actually paid
  commission_amount      int  not null,                -- cents owed to the KOL
  paid_at                timestamptz,
  created_at             timestamptz not null default now()
);

alter table commissions enable row level security;     -- no policies → service-role only

create index if not exists commissions_kol_idx on commissions (kol_id);

-- ── Payout summary (convenience for the SQL editor) ──────────
-- Amounts in dollars. Run `select * from kol_payouts;` to see what to pay each KOL.
create or replace view kol_payouts as
select
  k.id,
  k.name,
  k.email,
  k.promo_code,
  k.active,
  count(c.id)                                  as paid_invoices,
  round(coalesce(sum(c.commission_amount), 0) / 100.0, 2) as commission_owed_usd,
  round(coalesce(sum(c.gross_amount),      0) / 100.0, 2) as revenue_generated_usd
from kols k
left join commissions c on c.kol_id = k.id
group by k.id;
