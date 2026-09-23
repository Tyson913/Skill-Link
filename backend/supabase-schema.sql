create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key,
    username text not null,
    location text,
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.categories (
    id bigint primary key,
    name text not null unique
);

create table if not exists public.services (
    id bigint primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    category_id bigint references public.categories(id) on delete set null,
    service_name text not null,
    description text,
    price bigint not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.hires (
    id bigint primary key,
    client_id uuid not null references public.profiles(id) on delete cascade,
    service_id bigint not null references public.services(id) on delete cascade,
    agreed_price bigint not null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create table if not exists public.reviews (
    id bigint primary key,
    hire_id bigint not null references public.hires(id) on delete cascade,
    reviewer_id uuid not null references public.profiles(id) on delete cascade,
    rating integer not null check (rating >= 1 and rating <= 5),
    comment text,
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.hires enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Profiles are visible to their owners" on public.profiles;
create policy "Profiles are visible to their owners"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Profiles can be updated by their owners" on public.profiles;
create policy "Profiles can be updated by their owners"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Categories are publicly readable" on public.categories;
create policy "Categories are publicly readable"
on public.categories for select
using (true);

drop policy if exists "Services are publicly readable" on public.services;
create policy "Services are publicly readable"
on public.services for select
using (true);

drop policy if exists "Hires are visible to their clients" on public.hires;
create policy "Hires are visible to their clients"
on public.hires for select
using (auth.uid() = client_id);

drop policy if exists "Hires can be created by their clients" on public.hires;
create policy "Hires can be created by their clients"
on public.hires for insert
with check (auth.uid() = client_id);

drop policy if exists "Reviews are publicly readable" on public.reviews;
create policy "Reviews are publicly readable"
on public.reviews for select
using (true);
