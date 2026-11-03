-- FindMySize schema. Paste into Supabase SQL Editor and run.
create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Size charts
create table if not exists public.size_charts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9]{8,24}$'),
  name       text not null check (char_length(name) between 1 and 60),
  sex        text not null default 'unisex' check (sex in ('male', 'female', 'unisex')),
  unit       text not null default 'in' check (unit in ('in', 'cm')),
  columns    jsonb not null default '[]'::jsonb,
  rows       jsonb not null default '[]'::jsonb,
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

-- Public lookup by code
drop function if exists public.chart_by_code(text);
create function public.chart_by_code(candidate text)
returns table (name text, sex text, unit text, columns jsonb, rows jsonb)
language sql security definer set search_path = public as $$
  select c.name, c.sex, c.unit, c.columns, c.rows
  from public.size_charts c
  where c.code = lower(trim(candidate))
  limit 1;
$$;
revoke all on function public.chart_by_code(text) from public;
grant execute on function public.chart_by_code(text) to anon, authenticated;

-- Subscriptions
create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  plan                 text not null check (plan in ('unlimited')),
  status               text not null check (status in ('active', 'past_due', 'canceled')),
  selar_customer_id    text,
  selar_transaction_id text,
  paid_until           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: owner all" on public.subscriptions;
create policy "subscriptions: owner all" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Activation codes (one-time after Selar)
create table if not exists public.activation_codes (
  code       text primary key,
  email      text not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.activation_codes enable row level security;
