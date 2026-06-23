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
-- coach.js reserves a credit (bump_*) BEFORE the model call and REFUNDS it
-- (refund_*) if the call is rejected or the model fails — so a Gemini timeout
-- never burns a user's credit, while the atomic reserve still blocks over-limit.

-- ── Lifetime analysis counter (anon + free) ──────────────────────────────────
create table if not exists coach_analysis_total (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  count   int  not null default 0
);
alter table coach_analysis_total enable row level security;
drop policy if exists "coach_analysis_total_read_own" on coach_analysis_total;
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

create or replace function public.refund_coach_analysis_total(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_analysis_total set count = greatest(count - 1, 0) where user_id = p_user;
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
drop policy if exists "coach_analysis_month_read_own" on coach_analysis_month;
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

create or replace function public.refund_coach_analysis_month(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_analysis_month set count = greatest(count - 1, 0)
  where user_id = p_user and month = date_trunc('month', current_date)::date;
end;
$$;

-- ── Refunds for the existing daily counters (flash + transcribe) ──────────────
create or replace function public.refund_coach_usage(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = current_date;
end;
$$;

create or replace function public.refund_transcribe_usage(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_transcribe_usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = current_date;
end;
$$;

-- ── Token-usage log (for pricing decisions; NO hand content stored) ───────────
create table if not exists usage_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid,
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

-- Privacy: when an account is deleted, NULL out its user_id so no PII link survives,
-- but keep the (now-anonymous) token aggregate for cost analysis. Idempotent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_events_user_fk') then
    alter table usage_events
      add constraint usage_events_user_fk
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- ── LOCK DOWN the quota RPCs (security) ──────────────────────────────────────
-- These are SECURITY DEFINER and take a target user/ip, so any client that could
-- EXECUTE them could drain (or refund) someone else's quota by passing their UUID.
-- Postgres grants EXECUTE to PUBLIC by default — revoke it; only the service role
-- (used by api/coach.js) may call them.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.bump_coach_usage(uuid)',
    'public.bump_transcribe_usage(uuid)',
    'public.bump_ip_usage(text)',
    'public.bump_global_usage()',
    'public.bump_coach_analysis_total(uuid)',
    'public.bump_coach_analysis_month(uuid)',
    'public.refund_coach_analysis_total(uuid)',
    'public.refund_coach_analysis_month(uuid)',
    'public.refund_coach_usage(uuid)',
    'public.refund_transcribe_usage(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
