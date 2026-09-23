create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.services (
    id text primary key,
    title text not null,
    provider_name text not null,
    category text not null,
    location text not null,
    price numeric not null check (price >= 0),
    rating numeric not null default 0 check (rating >= 0 and rating <= 5),
    description text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.hires (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    service_id text not null references public.services(id) on delete cascade,
    status text not null default 'requested',
    created_at timestamptz not null default now(),
    unique (user_id, service_id, status)
);

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.hires enable row level security;

drop policy if exists "Profiles are visible to their owners" on public.profiles;
create policy "Profiles are visible to their owners"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Profiles can be updated by their owners" on public.profiles;
create policy "Profiles can be updated by their owners"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Services are publicly readable" on public.services;
create policy "Services are publicly readable"
on public.services for select
using (true);

drop policy if exists "Hires are visible to their owners" on public.hires;
create policy "Hires are visible to their owners"
on public.hires for select
using (auth.uid() = user_id);

drop policy if exists "Hires can be created by their owners" on public.hires;
create policy "Hires can be created by their owners"
on public.hires for insert
with check (auth.uid() = user_id);

drop policy if exists "Hires can be updated by their owners" on public.hires;
create policy "Hires can be updated by their owners"
on public.hires for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
