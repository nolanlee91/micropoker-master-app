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
  paid_at                timestamptz,                  -- when the customer's invoice was paid
  paid_out_at            timestamptz,                  -- when WE paid the KOL for this row (null = unpaid)
  reversed_at            timestamptz,                  -- set on refund/chargeback → excluded from payout
  created_at             timestamptz not null default now()
);

-- Backfill the ledger columns if commissions was created by an earlier version.
alter table commissions add column if not exists paid_out_at timestamptz;
alter table commissions add column if not exists reversed_at timestamptz;

alter table commissions enable row level security;     -- no policies → service-role only

create index if not exists commissions_kol_idx on commissions (kol_id);

-- ── Payout summary (convenience for the SQL editor) ──────────
-- Amounts in dollars. Run `select * from kol_payouts;` to see what to pay each KOL.
-- `payable_now_usd` is the ONLY number to pay from: it counts commissions that are
-- (a) matured (>30 days old, so past the refund window), (b) not yet paid out, and
-- (c) not reversed by a refund/chargeback. Pay it, THEN stamp those rows paid:
--   update commissions set paid_out_at = now()
--   where kol_id = '<id>' and paid_out_at is null and reversed_at is null
--     and created_at <= now() - interval '30 days';
-- On a refund/chargeback, exclude that commission:
--   update commissions set reversed_at = now() where stripe_invoice_id = '<inv>';
create or replace view kol_payouts as
select
  k.id,
  k.name,
  k.email,
  k.promo_code,
  k.active,
  count(c.id) filter (
    where c.paid_out_at is null and c.reversed_at is null
      and c.created_at <= now() - interval '30 days'
  ) as payable_invoices,
  round(coalesce(sum(c.commission_amount) filter (
    where c.paid_out_at is null and c.reversed_at is null
      and c.created_at <= now() - interval '30 days'
  ), 0) / 100.0, 2) as payable_now_usd,
  round(coalesce(sum(c.commission_amount) filter (
    where c.paid_out_at is null and c.reversed_at is null
  ), 0) / 100.0, 2) as unpaid_incl_immature_usd,
  round(coalesce(sum(c.commission_amount) filter (where c.paid_out_at is not null), 0) / 100.0, 2) as already_paid_usd,
  round(coalesce(sum(c.gross_amount) filter (where c.reversed_at is null), 0) / 100.0, 2) as revenue_generated_usd
from kols k
left join commissions c on c.kol_id = k.id
group by k.id;
