-- FindMySize. Paste the whole file into the Supabase SQL editor and run it.
create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists public.size_charts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid default auth.uid() references auth.users(id) on delete cascade,
  code       text not null unique,
  name       text not null check (char_length(name) between 1 and 60),
  sex        text not null default 'unisex' check (sex in ('male', 'female', 'unisex')),
  unit       text not null default 'in' check (unit in ('in', 'cm')),
  columns    jsonb not null default '[]'::jsonb,
  rows       jsonb not null default '[]'::jsonb,
  popup      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists size_charts_user_idx on public.size_charts (user_id, created_at desc);
drop trigger if exists size_charts_touch on public.size_charts;
create trigger size_charts_touch before update on public.size_charts
  for each row execute function public.touch_updated_at();
alter table public.size_charts enable row level security;
drop policy if exists "size charts: owner all" on public.size_charts;
create policy "size charts: owner all" on public.size_charts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('unlimited')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  selar_customer_id text,
  selar_transaction_id text,
  paid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: owner all" on public.subscriptions;
create policy "subscriptions: owner all" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.activation_codes (
  code text primary key,
  email text not null,
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.activation_codes add column if not exists used_at timestamptz;
alter table public.activation_codes enable row level security;

create table if not exists public.pending_signups (
  email text primary key,
  password text not null,
  created_at timestamptz not null default now()
);
alter table public.pending_signups enable row level security;

create table if not exists public.device_usage (
  device_id text primary key,
  scans int not null default 0,
  charts int not null default 0,
  popups int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.device_usage enable row level security;


-- popup settings on a chart (safe to re-run)
alter table public.size_charts add column if not exists popup jsonb not null default '{}'::jsonb;

-- allow charts created without an account
alter table public.size_charts alter column user_id drop not null;

alter table public.size_charts add column if not exists popup_uses int not null default 0;

-- Brand activation payment tracking
alter table public.brand_activations add column if not exists paid_at timestamptz;
alter table public.brand_activations add column if not exists expires_at timestamptz;
alter table public.brand_activations add column if not exists email text;
