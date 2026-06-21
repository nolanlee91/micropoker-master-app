-- ════════════════════════════════════════════════════════════════════════════
--  Voice transcription — per-user daily cap (anti-spam)
--  Run once in the Supabase SQL Editor. Idempotent (safe to re-run).
--  Pairs with api/coach.js request_type:'transcribe' → bump_transcribe_usage().
-- ════════════════════════════════════════════════════════════════════════════
--
-- Transcription (audio → text, gemini-2.5-flash) does NOT count against the
-- analysis cap (a voice hand should equal a typed hand). But it still costs real
-- Google money, so it gets its OWN generous per-user daily counter — normal use
-- (a few voice notes/day) never hits it; it only stops a script spamming the
-- audio endpoint to burn the budget. Mirrors coach_usage / bump_coach_usage.

create table if not exists coach_transcribe_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table coach_transcribe_usage enable row level security;

-- Read own only; the counter is bumped via the security-definer function below.
create policy "coach_transcribe_usage_read_own" on coach_transcribe_usage
  for select using (auth.uid() = user_id);

-- Atomically increment today's counter and return the new value (avoids races).
create or replace function public.bump_transcribe_usage(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into coach_transcribe_usage (user_id, day, count)
  values (p_user, current_date, 1)
  on conflict (user_id, day)
  do update set count = coach_transcribe_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$$;
