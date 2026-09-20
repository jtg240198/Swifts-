-- ============================================================
-- St James' Swifts FC — Bonus Ball schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- ============================================================

-- One row per number, 1–59. Numbers are pre-seeded below.
create table if not exists bonus_numbers (
  number int primary key check (number between 1 and 59),
  status text not null default 'free' check (status in ('free','pending','taken')),
  owner_name text,
  owner_email text,
  owner_phone text,
  stripe_customer_id text,
  stripe_subscription_id text,
  pending_expires_at timestamptz,   -- used only while status = 'pending'
  claimed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Seed numbers 1–59 (safe to re-run — does nothing if they already exist)
insert into bonus_numbers (number, status)
select generate_series(1, 59), 'free'
on conflict (number) do nothing;

-- One row per week's draw
create table if not exists bonus_draws (
  id uuid primary key default gen_random_uuid(),
  draw_date date not null unique,       -- the Saturday of the draw
  winning_number int not null check (winning_number between 1 and 59),
  winner_number int,                    -- our number that matched, if any (nullable)
  winner_name text,
  paid_out boolean not null default false,
  created_at timestamptz not null default now()
);

-- Keep updated_at current on bonus_numbers
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bonus_numbers_updated on bonus_numbers;
create trigger trg_bonus_numbers_updated
  before update on bonus_numbers
  for each row execute function set_updated_at();

-- Row Level Security: lock the table down. All reads/writes happen through
-- the Netlify Functions using the Supabase SERVICE ROLE key, which bypasses
-- RLS — so the public anon key (if ever exposed) can't read or edit anything.
alter table bonus_numbers enable row level security;
alter table bonus_draws enable row level security;
-- (No policies created = no access via the anon/public key at all.)
