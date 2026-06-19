-- ════════════════════════════════════════════════════════════════════════════
--  Anti-abuse v2 — per-IP cap + global circuit breaker
--  Run this once in the Supabase SQL Editor. Idempotent (safe to re-run).
--  Pairs with api/coach.js: bump_ip_usage() + bump_global_usage().
-- ════════════════════════════════════════════════════════════════════════════

-- ── Per-IP daily counter ─────────────────────────────────────────────────────
-- Targets the ONE real farming vector: rotating throwaway ANONYMOUS accounts on a
-- single device/IP to re-roll the free Pro demo. coach.js only bumps this for
-- anonymous users, so real users behind shared NAT/CGNAT are never blocked.
-- We store only a salted SHA-256 hash of the IP — never the raw address.
create table if not exists coach_ip_usage (
  ip_hash text not null,
  day     date not null,
  count   int  not null default 0,
  primary key (ip_hash, day)
);

alter table coach_ip_usage enable row level security;
-- No policy → only the service-role key (which bypasses RLS) can touch it.

create or replace function public.bump_ip_usage(p_ip text)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into coach_ip_usage (ip_hash, day, count)
  values (p_ip, current_date, 1)
  on conflict (ip_hash, day)
  do update set count = coach_ip_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- ── Global daily circuit breaker ─────────────────────────────────────────────
-- One row per day holding the total Coach calls across ALL users. coach.js trips
-- a hard 429 when this exceeds COACH_GLOBAL_DAILY_CAP — the backstop so a scripted
-- attack can never run the Gemini bill up without bound.
create table if not exists coach_global_usage (
  day   date primary key,
  count int  not null default 0
);

alter table coach_global_usage enable row level security;
-- No policy → service-role only.

create or replace function public.bump_global_usage()
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into coach_global_usage (day, count)
  values (current_date, 1)
  on conflict (day)
  do update set count = coach_global_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;
