-- Who's Nearby — 001: initial schema
-- Idempotent: safe to run on a fresh project or an existing one.

create table if not exists public.profiles (
  id text not null primary key,
  name text not null default '',
  username text,
  avatar text,
  lat double precision,
  lng double precision,
  last_seen timestamp with time zone,
  gender text,
  seeking text,
  dob text,
  height text,
  weight text,
  role_pref text,
  safety_pref text,
  playstyle_pref text,
  where_pref text,
  how_many_pref text,
  non_man_mode text,
  is_underage boolean not null default false,
  hide_age boolean not null default false,
  grid_visible boolean not null default true,
  map_visible boolean not null default false,
  hide_age_expiry timestamp with time zone,
  invisible_expiry timestamp with time zone,
  edit_profile_pass boolean not null default false,
  edit_profile_expiry timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

-- Additive columns for databases created before the edit_profile feature existed.
alter table public.profiles add column if not exists edit_profile_pass boolean not null default false;
alter table public.profiles add column if not exists edit_profile_expiry timestamp with time zone;

-- Payment receipts (idempotency source for the payment webhook).
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  type text,
  amount bigint,
  currency text default 'XTR',
  provider_payment_charge_id text unique,
  telegram_payment_charge_id text unique,
  status text default 'paid',
  created_at timestamp with time zone not null default now()
);

-- Long-lived entitlements (optional; expiry fields on profiles cover current features).
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  type text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.purchases enable row level security;

drop policy if exists "Allow public read on profiles" on public.profiles;
create policy "Allow public read on profiles" on public.profiles for select using (true);

drop policy if exists "Allow public insert on profiles" on public.profiles;
create policy "Allow public insert on profiles" on public.profiles for insert with check (true);

drop policy if exists "Allow public update on profiles" on public.profiles;
create policy "Allow public update on profiles" on public.profiles for update using (true) with check (true);

drop policy if exists "Allow public select on transactions" on public.transactions;
create policy "Allow public select on transactions" on public.transactions for select using (true);

drop policy if exists "Allow public insert on transactions" on public.transactions;
create policy "Allow public insert on transactions" on public.transactions for insert with check (true);

notify pgrst, 'reload schema';
