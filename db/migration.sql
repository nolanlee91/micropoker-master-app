-- ================================================================
-- MicroPoker Master — Database Migration
-- Run in Supabase SQL Editor
-- ================================================================

-- Drop old single-blob table if you ran the previous auth migration
-- drop table if exists user_data;

-- ── 1. Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  default_game_type text not null default 'Live Cash',
  default_stake     text not null default '$1/$2',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_own" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ── 2. Sessions ──────────────────────────────────────────────
create table if not exists sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null,
  stake            text not null default '$1/$2',
  location         text not null default 'Live',
  duration_minutes int  not null default 0,
  buy_in           numeric(10,2) not null default 0,
  cash_out         numeric(10,2) not null default 0,
  profit_loss      numeric(10,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table sessions enable row level security;

create policy "sessions_own" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. Hand History ──────────────────────────────────────────
create table if not exists hand_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,
  game_type     text not null default 'Live Cash',
  stake         text,
  position      text not null,
  hole_cards    text[] not null,
  board         text[],
  pot_size      numeric(10,2),
  actions       text,
  result_amount numeric(10,2) not null default 0,
  notes         text,
  ai_analysis   jsonb,
  ev_impact     numeric(10,4),
  leak_category text,
  created_at    timestamptz not null default now()
);

alter table hand_history enable row level security;

create policy "hand_history_own" on hand_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 4. Auto-create profile on signup ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
