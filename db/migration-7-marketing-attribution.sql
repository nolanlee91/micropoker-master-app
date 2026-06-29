-- ================================================================
-- MicroPoker Master — Migration 7: Marketing attribution (UTM)
-- Run in the Supabase SQL Editor (after the earlier migrations).
-- ================================================================
--
-- Goal: know which CHANNEL brings users and which brings money — separate
-- from KOL commission attribution (kols/commissions/promo codes). This is the
-- UTM/funnel layer, NOT the payout layer. Do not mix the two.
--
-- Model (decided 2026-06):
--   • Landing (micropokermaster.com) forwards utm_* + referrer + landing_path
--     into the CTA link to the app (different domain → no shared localStorage).
--   • The app captures FIRST-touch (set once) and LAST-touch (overwritten) and
--     writes them server-side via /api/track-attribution (service-role).
--   • One row per Supabase user — anon OR real. The app is anonymous-first, so
--     a visitor gets an anon user_id from second 1; logging a hand happens on
--     that anon id. On sign-up a NEW real account is created and the anon's
--     touches are copied onto it (signed_up_from_anon links the two), so the
--     funnel click → hand → signup → paid can be read end-to-end.
--
-- RLS enabled with NO policies on purpose: private business data, written/read
-- ONLY by the server (service-role key bypasses RLS) + the Supabase dashboard.
-- The client can never read another user's attribution.

create table if not exists marketing_attribution (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  is_anonymous       boolean not null default false,  -- snapshot at write time (anon vs real account)

  -- FIRST touch (set once, the channel that first brought them)
  first_source       text,
  first_medium       text,
  first_campaign     text,
  first_content      text,
  first_referrer     text,
  first_landing_path text,
  first_captured_at  timestamptz,

  -- LAST touch (overwritten each visit, the channel that brought them back)
  last_source        text,
  last_medium        text,
  last_campaign      text,
  last_content       text,
  last_referrer      text,
  last_landing_path  text,
  last_captured_at   timestamptz,

  -- When a real account is created from an anon visitor, the anon user_id it
  -- came from — lets us stitch pre-signup (anon) activity to the paid account.
  signed_up_from_anon uuid,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (user_id)                                     -- one row per user → upsert
);

alter table marketing_attribution enable row level security;  -- no policies → service-role only

create index if not exists marketing_attribution_first_source_idx on marketing_attribution (first_source);
create index if not exists marketing_attribution_anon_idx        on marketing_attribution (signed_up_from_anon);

-- ── Funnel summary (convenience for the SQL editor) ──────────
-- One row per first-touch channel. Read it with: `select * from marketing_funnel;`
--   visitors    = attributed anon visitors (a "click" that landed in the app)
--   logged_hand = of those, how many logged at least one hand (activation)
--   signups     = real accounts created, grouped by the channel they came from
--   paid        = of those signups, how many have an active/trialing subscription
-- Diagnose where the funnel leaks per channel:
--   visitors but no logged_hand → landing/activation problem
--   logged_hand but no signups  → signup/value-gate problem
--   signups but no paid         → paywall/price/value problem
create or replace view marketing_funnel as
select
  coalesce(ma.first_source, '(none)') as source,
  count(*) filter (where ma.is_anonymous) as visitors,
  count(*) filter (
    where ma.is_anonymous
      and exists (select 1 from hand_history h where h.user_id = ma.user_id)
  ) as logged_hand,
  count(*) filter (where not ma.is_anonymous) as signups,
  count(*) filter (
    where not ma.is_anonymous
      and exists (
        select 1 from subscriptions s
        where s.user_id = ma.user_id and s.status in ('active', 'trialing')
      )
  ) as paid
from marketing_attribution ma
group by coalesce(ma.first_source, '(none)')
order by visitors desc;
