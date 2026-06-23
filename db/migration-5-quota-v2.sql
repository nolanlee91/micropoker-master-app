-- ════════════════════════════════════════════════════════════════════════════
--  Quota v2 — split the EXPENSIVE deep analysis (gemini-2.5-pro) from the cheap
--  flash calls, and lock down the quota RPCs.
--  Run once in the Supabase SQL Editor. Idempotent (safe to re-run).
--  Pairs with api/coach.js.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Model (deep analysis only — flash follow-up/fix/debrief stays on the daily
-- coach_usage counter):
--   • anon  : 3  analyses  LIFETIME (no reset)            → bump_coach_analysis_total
--   • free  : 10 analyses  LIFETIME (no reset)            → bump_coach_analysis_total
--   • pro   : 60 analyses  per CALENDAR MONTH (resets 1st)→ bump_coach_analysis_month
-- coach.js picks the counter by tier; the cap numbers live in env (defaults in code).

-- ── Lifetime analysis counter (anon + free) ──────────────────────────────────
create table if not exists coach_analysis_total (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  count   int  not null default 0
);
alter table coach_analysis_total enable row level security;
create policy "coach_analysis_total_read_own" on coach_analysis_total
  for select using (auth.uid() = user_id);

create or replace function public.bump_coach_analysis_total(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into coach_analysis_total (user_id, count)
  values (p_user, 1)
  on conflict (user_id)
  do update set count = coach_analysis_total.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- ── Per-calendar-month analysis counter (pro) ────────────────────────────────
create table if not exists coach_analysis_month (
  user_id uuid  not null references auth.users(id) on delete cascade,
  month   date  not null,           -- first day of the calendar month
  count   int   not null default 0,
  primary key (user_id, month)
);
alter table coach_analysis_month enable row level security;
create policy "coach_analysis_month_read_own" on coach_analysis_month
  for select using (auth.uid() = user_id);

create or replace function public.bump_coach_analysis_month(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into coach_analysis_month (user_id, month, count)
  values (p_user, date_trunc('month', current_date)::date, 1)
  on conflict (user_id, month)
  do update set count = coach_analysis_month.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- ── Token-usage log (for pricing decisions; NO hand content stored) ───────────
create table if not exists usage_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid,                 -- analytics only; no FK so logs survive deletion
  tier           text,                 -- 'anon' | 'free' | 'pro'
  mode           text,                 -- 'analysis' | 'follow_up' | 'leak_fix' | 'session_debrief' | 'transcribe'
  model          text,                 -- 'gemini-2.5-pro' | 'gemini-2.5-flash'
  prompt_tokens  int,
  thinking_tokens int,
  output_tokens  int
);
-- RLS on with NO policy → only the service role (which bypasses RLS) can read/write.
alter table usage_events enable row level security;
create index if not exists usage_events_created_idx on usage_events (created_at);

-- ── LOCK DOWN the quota RPCs (security) ──────────────────────────────────────
-- These are SECURITY DEFINER and take a target user/ip, so any client that could
-- EXECUTE them could drain someone else's quota by passing their UUID. Postgres
-- grants EXECUTE to PUBLIC by default — revoke it; only the service role (used by
-- api/coach.js) may call them.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.bump_coach_usage(uuid)',
    'public.bump_transcribe_usage(uuid)',
    'public.bump_ip_usage(text)',
    'public.bump_global_usage()',
    'public.bump_coach_analysis_total(uuid)',
    'public.bump_coach_analysis_month(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
