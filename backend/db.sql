























create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

insert into public.app_settings (key, value) values
  ('platform_fee',         '0.05'),
  ('low_rating_max',       '2'),
  ('low_rating_remove_at', '5')
on conflict (key) do nothing;





create table if not exists public.categories (
  name           text primary key,
  sort_order     int  not null,
  blurb          text not null,
  default_skills text[] not null default '{}'
);

insert into public.categories (name, sort_order, blurb, default_skills) values
  ('Home & Repair',         1, 'On-site repair, installation and maintenance for your home.',               array['Troubleshooting','Installation','Maintenance']),
  ('Technology',            2, 'Remote or in-person help with devices, software and setup.',                array['Diagnostics','Setup','Data safety']),
  ('Automotive',            3, 'Cleaning, tune-ups and basic upkeep for cars and motorcycles.',             array['Detailing','Engine care','Inspection']),
  ('Cleaning',              4, 'Thorough cleaning with supplies and equipment included.',                   array['Deep cleaning','Sanitizing','Appliance care']),
  ('Beauty & Wellness',     5, 'Personal grooming and relaxation services at your home.',                   array['Grooming','Massage','Hygiene']),
  ('Education',             6, 'One-on-one lessons paced to the student''s level.',                         array['Lesson planning','Review','Exam prep']),
  ('Creative',              7, 'Design and photo work delivered as final files.',                           array['Concept','Editing','Delivery']),
  ('Construction',          8, 'Skilled labor for building and repair work.',                               array['Masonry','Roofing','Site safety']),
  ('Delivery & Moving',     9, 'Careful transport of items and household goods.',                           array['Loading','Transport','Handling']),
  ('Professional Services',10, 'Accurate paperwork and advice for individuals and small businesses.',       array['Records','Compliance','Review'])
on conflict (name) do update
  set sort_order = excluded.sort_order, blurb = excluded.blurb, default_skills = excluded.default_skills;





create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text not null default '',
  age        int  check (age is null or age between 1 and 120),
  contact    text not null default '',
  location   text not null default '',
  bio        text not null default '' check (char_length(bio) <= 200),
  avatar_url text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));

create table if not exists public.providers (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  full_name    text not null check (char_length(btrim(full_name)) > 0),
  contact      text not null,
  email        text not null,
  availability text not null default 'Weekdays' check (availability in ('Weekdays','Weekends','Every day')),
  address      text not null default '',
  city         text not null default '',
  province     text not null default '',
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  about        text not null default '' check (char_length(about) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);








create table if not exists public.services (
  id                bigint generated always as identity primary key,
  provider_id       uuid not null references public.providers (user_id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 2 and 120),
  category          text not null references public.categories (name) on update cascade,
  price             numeric(12,2) not null check (price >= 0 and price <= 10000000),
  unit              text not null check (unit in ('per hour','per day','per job')),
  description       text not null check (char_length(btrim(description)) between 1 and 2000),
  skills            text[] not null default '{}',
  status            text not null default 'active' check (status in ('active','removed','deleted')),
  rating_avg        numeric(4,2) not null default 0,
  rating_count      int not null default 0,
  removed_at        timestamptz,
  removed_by        uuid references public.profiles (id) on delete set null,
  removed_low_count int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists services_listing_idx  on public.services (status, category);
create index if not exists services_provider_idx on public.services (provider_id);

create table if not exists public.service_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  category    text not null references public.categories (name) on update cascade,
  budget      int  not null default 0 check (budget >= 0),
  location    text not null check (char_length(btrim(location)) > 0),
  description text not null default '',
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists service_requests_created_idx on public.service_requests (created_at desc);

create table if not exists public.cart_items (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  service_id bigint not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);







create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  customer_id    uuid references public.profiles (id) on delete set null,
  customer_name  text not null default '',
  service_id     bigint references public.services (id) on delete set null,
  service_name   text not null,
  category       text not null,
  provider_id    uuid references public.providers (user_id) on delete set null,
  provider_name  text not null,
  unit           text not null,
  unit_price     numeric(12,2) not null,
  qty            int  not null default 1 check (qty between 1 and 30),
  status         text not null default 'Ongoing' check (status in ('Ongoing','Completed','Cancelled')),
  location       text not null,
  dest_lat       double precision check (dest_lat between -90 and 90),
  dest_lng       double precision check (dest_lng between -180 and 180),
  scheduled_at   timestamptz not null,
  when_label     text not null,
  pay_method     text not null check (pay_method in ('gcash','maya','card','cash')),
  card_last4     text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  subtotal       numeric(14,2) not null,
  fee            numeric(14,2) not null,
  total          numeric(14,2) not null,
  pay_status     text not null check (pay_status in ('held','released','due-cash','paid-cash','refunded','void')),
  on_the_way_at  timestamptz,
  arrived_at     timestamptz,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index if not exists bookings_provider_idx on public.bookings (provider_id, created_at desc);
create index if not exists bookings_service_idx  on public.bookings (service_id);

create table if not exists public.booking_locations (
  id         bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  speed      real not null default 0 check (speed >= 0 and speed <= 250),
  created_at timestamptz not null default now()
);
create index if not exists booking_locations_idx on public.booking_locations (booking_id, id desc);





create table if not exists public.reviews (
  id           bigint generated always as identity primary key,
  service_id   bigint not null references public.services (id) on delete cascade,
  booking_id   uuid unique references public.bookings (id) on delete set null,
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text not null,
  stars        smallint not null check (stars between 0 and 5),
  comment      text check (comment is null or char_length(btrim(comment)) between 1 and 2000),
  images       text[] not null default '{}' check (cardinality(images) <= 4),
  reply        text check (reply is null or char_length(btrim(reply)) between 1 and 1000),
  reply_at     timestamptz,
  commented_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists reviews_service_idx on public.reviews (service_id, stars);

create table if not exists public.reports (
  id            bigint generated always as identity primary key,
  booking_id    uuid not null unique references public.bookings (id) on delete cascade,
  reporter_id   uuid references public.profiles (id) on delete set null,
  reporter_name text not null,
  provider_id   uuid references public.providers (user_id) on delete set null,
  provider_name text not null,
  service_name  text not null,
  reason        text not null check (reason in (
                  'Did not show up','Unsafe behavior','Asked for extra or off-app payment',
                  'Poor quality of work','Rude or disrespectful','Damaged or took property',
                  'Fake or misleading profile','Other')),
  details       text not null check (char_length(btrim(details)) between 20 and 500),
  evidence      text[] not null check (cardinality(evidence) between 1 and 4),
  status        text not null default 'open' check (status in ('open','resolved')),
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists reports_provider_idx on public.reports (provider_id, status);





create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  message    text not null,
  icon       text not null default 'bell',
  unread     boolean not null default true,
  ref        text,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles (id) on delete cascade,
  user_b          uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table if not exists public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, id);





create table if not exists public.provider_warnings (
  id          bigint generated always as identity primary key,
  provider_id uuid not null references public.providers (user_id) on delete cascade,
  reason      text not null,
  message     text not null default '' check (char_length(message) <= 300),
  admin_id    uuid references public.profiles (id) on delete set null,
  admin_email text not null,
  created_at  timestamptz not null default now()
);
create index if not exists provider_warnings_idx on public.provider_warnings (provider_id);

create table if not exists public.admin_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id) on delete set null,
  admin_email text not null default '',
  message     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists admin_log_idx on public.admin_log (created_at desc);







create or replace function public.sl_err(p_code text, p_msg text) returns void
language plpgsql as $$
begin
  raise exception 'SL:%:%', p_code, p_msg using errcode = 'P0001';
end $$;

create or replace function public.sl_setting(p_key text, p_default numeric) returns numeric
language sql stable as $$
  select coalesce((select value::numeric from public.app_settings where key = p_key), p_default)
$$;


create or replace function public.sl_norm(t text) returns text
language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;


create or replace function public.sl_stems(t text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct left(w, 5)), '{}')
  from regexp_split_to_table(lower(coalesce(t, '')), '[^a-z]+') as w
  where length(w) > 2 and w not in ('repair', 'work', 'service', 'services', 'home', 'house', 'and', 'the')
$$;


create or replace function public.sl_name_from_email(p_email text) returns text
language sql immutable as $$
  select coalesce(string_agg(upper(left(w.word, 1)) || substr(w.word, 2), ' ' order by w.n), '')
  from unnest(string_to_array(
         btrim(regexp_replace(split_part(coalesce(p_email, ''), '@', 1), '[._-]+', ' ', 'g')), ' '
       )) with ordinality as w(word, n)
  where w.word <> ''
$$;


create or replace function public.sl_meters(lat1 double precision, lng1 double precision,
                                            lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

create or replace function public.sl_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.sl_touch_updated_at();
drop trigger if exists providers_touch on public.providers;
create trigger providers_touch before update on public.providers
  for each row execute function public.sl_touch_updated_at();
drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services
  for each row execute function public.sl_touch_updated_at();


create or replace function public.sl_handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), public.sl_name_from_email(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.sl_handle_new_user();


create or replace function public.sl_recalc_service_rating(p_service bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.services s
     set rating_avg   = coalesce((select round(avg(r.stars)::numeric, 2) from public.reviews r where r.service_id = p_service), 0),
         rating_count = (select count(*) from public.reviews r where r.service_id = p_service)
   where s.id = p_service;
end $$;

create or replace function public.sl_reviews_after() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.sl_recalc_service_rating(old.service_id);
    return old;
  end if;
  perform public.sl_recalc_service_rating(new.service_id);
  if tg_op = 'UPDATE' and old.service_id is distinct from new.service_id then
    perform public.sl_recalc_service_rating(old.service_id);
  end if;
  return new;
end $$;

drop trigger if exists reviews_after on public.reviews;
create trigger reviews_after after insert or update of stars, service_id or delete on public.reviews
  for each row execute function public.sl_reviews_after();



create or replace function public.sl_notify(p_user uuid, p_title text, p_message text,
                                            p_icon text default 'bell', p_ref text default null)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_user is null then return; end if;
  if p_ref is not null and exists (
       select 1 from public.notifications n where n.user_id = p_user and n.ref = p_ref and n.unread) then
    return;
  end if;
  insert into public.notifications (user_id, title, message, icon, ref)
  values (p_user, p_title, p_message, coalesce(p_icon, 'bell'), p_ref);
end $$;

create or replace function public.sl_display_name(p_user uuid) returns text
language sql stable as $$
  select coalesce(
    (select nullif(btrim(pr.full_name), '') from public.providers pr where pr.user_id = p_user),
    (select nullif(btrim(p.name), '')       from public.profiles  p  where p.id = p_user),
    (select split_part(p.email, '@', 1)     from public.profiles  p  where p.id = p_user),
    'User')
$$;

create or replace function public.sl_assert_admin(p_user uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and is_admin) then
    perform public.sl_err('forbidden', 'Admin access required.');
  end if;
end $$;

create or replace function public.sl_log(p_admin uuid, p_text text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.admin_log (admin_id, admin_email, message)
  values (p_admin, coalesce((select email from public.profiles where id = p_admin), ''), p_text);
end $$;






create or replace function public.sl_profile_json(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'age', p.age, 'contact', p.contact,
    'location', p.location, 'bio', p.bio, 'avatar', p.avatar_url,
    'isAdmin', p.is_admin, 'createdAt', p.created_at,
    'complete', (btrim(p.name) <> '' and p.age is not null and btrim(p.contact) <> ''
                 and btrim(p.email) <> '' and btrim(p.location) <> ''))
$$;

create or replace function public.sl_provider_json(pr public.providers) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', pr.user_id, 'fullName', pr.full_name, 'contact', pr.contact, 'email', pr.email,
    'availability', pr.availability, 'address', pr.address, 'city', pr.city,
    'province', pr.province, 'lat', pr.lat, 'lng', pr.lng, 'about', pr.about,
    'createdAt', pr.created_at)
$$;


create or replace function public.sl_service_json(s public.services) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'category', s.category,
    'price', s.price, 'unit', s.unit,
    'rating', s.rating_avg, 'reviews', s.rating_count,
    'description', s.description, 'skills', to_jsonb(s.skills), 'status', s.status,
    'providerId', s.provider_id, 'provider', pr.full_name, 'providerAvatar', pf.avatar_url,
    'availability', pr.availability,
    'location', coalesce(nullif(concat_ws(', ', nullif(pr.city, ''), nullif(pr.province, '')), ''),
                         nullif(pf.location, '')),
    'createdAt', s.created_at)
  from public.providers pr
  join public.profiles pf on pf.id = pr.user_id
  where pr.user_id = s.provider_id
$$;



create or replace function public.sl_service_owner_json(s public.services) returns jsonb
language sql stable as $$
  select public.sl_service_json(s) || jsonb_build_object(
    'hired',  (select count(*) from public.bookings b where b.service_id = s.id and b.status <> 'Cancelled'),
    'earned', (select coalesce(sum(b.subtotal), 0) from public.bookings b where b.service_id = s.id and b.status = 'Completed'))
$$;

create or replace function public.sl_booking_json(b public.bookings) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'ref', b.ref, 'serviceId', b.service_id, 'service', b.service_name,
    'category', b.category, 'providerId', b.provider_id, 'provider', b.provider_name,
    'customerId', b.customer_id, 'customer', b.customer_name,
    'status', b.status, 'createdAt', b.created_at, 'completedAt', b.completed_at,
    'location', b.location, 'when', b.when_label, 'scheduledAt', b.scheduled_at,
    'qty', b.qty, 'unit', b.unit, 'unitPrice', b.unit_price,
    'destination', case when b.dest_lat is not null
                        then jsonb_build_object('lat', b.dest_lat, 'lng', b.dest_lng) end,
    'payment', jsonb_build_object('method', b.pay_method, 'last4', coalesce(b.card_last4, ''),
                                  'subtotal', b.subtotal, 'fee', b.fee, 'total', b.total,
                                  'status', b.pay_status),
    'rated',    (select r.stars from public.reviews r where r.booking_id = b.id),
    'reviewed', coalesce((select r.comment is not null from public.reviews r where r.booking_id = b.id), false),
    'reported', exists (select 1 from public.reports x where x.booking_id = b.id),
    'report',   (select jsonb_build_object('reason', x.reason, 'details', x.details,
                                           'at', x.created_at, 'status', x.status)
                   from public.reports x where x.booking_id = b.id))
$$;

create or replace function public.sl_notification_json(n public.notifications) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', n.id, 'title', n.title, 'message', n.message,
                            'icon', n.icon, 'unread', n.unread, 'createdAt', n.created_at)
$$;






create or replace function public.api_ensure_profile(p_user uuid, p_email text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  insert into public.profiles (id, email, name)
  values (p_user, coalesce(p_email, ''), public.sl_name_from_email(p_email))
  on conflict (id) do nothing;
  select * into p from public.profiles where id = p_user;
  return public.sl_profile_json(p);
end $$;

create or replace function public.api_me(p_user uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare p public.profiles; pr public.providers;
begin
  select * into p from public.profiles where id = p_user;
  if not found then perform public.sl_err('unauthorized', 'Account not found.'); end if;
  select * into pr from public.providers where user_id = p_user;
  return jsonb_build_object(
    'profile', public.sl_profile_json(p),
    'isProvider', pr.user_id is not null,
    'provider', case when pr.user_id is not null then public.sl_provider_json(pr) end,
    'cartCount', (select count(*) from public.cart_items c
                    join public.services s on s.id = c.service_id and s.status = 'active'
                   where c.user_id = p_user),
    'unreadNotifications', (select count(*) from public.notifications n where n.user_id = p_user and n.unread));
end $$;



create or replace function public.api_update_profile(p_user uuid, p_patch jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare p public.profiles; v text; v_age int;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then perform public.sl_err('unauthorized', 'Account not found.'); end if;

  if p_patch ? 'name' then
    v := btrim(coalesce(p_patch->>'name', ''));
    if v = '' or char_length(v) > 100 then perform public.sl_err('invalid', 'Enter your name (up to 100 characters).'); end if;
    p.name := v;
  end if;
  if p_patch ? 'age' then
    begin
      v_age := (p_patch->>'age')::int;
    exception when others then
      perform public.sl_err('invalid', 'Age must be a whole number from 1 to 120.');
    end;
    if v_age is null or v_age < 1 or v_age > 120 then perform public.sl_err('invalid', 'Age must be a whole number from 1 to 120.'); end if;
    p.age := v_age;
  end if;
  if p_patch ? 'contact' then
    v := btrim(coalesce(p_patch->>'contact', ''));
    if v = '' or char_length(v) > 40 then perform public.sl_err('invalid', 'Enter a contact number.'); end if;
    p.contact := v;
  end if;
  if p_patch ? 'location' then
    v := btrim(coalesce(p_patch->>'location', ''));
    if v = '' or char_length(v) > 200 then perform public.sl_err('invalid', 'Enter your location.'); end if;
    p.location := v;
  end if;
  if p_patch ? 'bio' then
    v := btrim(coalesce(p_patch->>'bio', ''));
    if char_length(v) > 200 then perform public.sl_err('invalid', 'Bio can be at most 200 characters.'); end if;
    p.bio := v;
  end if;
  if p_patch ? 'email' then
    v := lower(btrim(coalesce(p_patch->>'email', '')));
    if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v) > 254 then perform public.sl_err('invalid', 'Enter a valid email address.'); end if;
    if exists (select 1 from public.profiles x where lower(x.email) = v and x.id <> p_user) then
      perform public.sl_err('conflict', 'That email is already in use.');
    end if;
    p.email := v;
  end if;

  update public.profiles
     set name = p.name, age = p.age, contact = p.contact, location = p.location,
         bio = p.bio, email = p.email
   where id = p_user;
  select * into p from public.profiles where id = p_user;
  return public.sl_profile_json(p);
end $$;

create or replace function public.api_set_avatar(p_user uuid, p_url text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  update public.profiles set avatar_url = p_url where id = p_user;
  select * into p from public.profiles where id = p_user;
  if not found then perform public.sl_err('unauthorized', 'Account not found.'); end if;
  return public.sl_profile_json(p);
end $$;

create or replace function public.api_is_admin(p_user uuid) returns boolean
language sql stable as $$
  select coalesce((select is_admin from public.profiles where id = p_user), false)
$$;

create or replace function public.api_set_admin(p_user uuid, p_value boolean) returns void
language sql as $$
  update public.profiles set is_admin = p_value where id = p_user
$$;






create or replace function public.api_list_categories() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'blurb', c.blurb,
                                               'skills', to_jsonb(c.default_skills))
                            order by c.sort_order), '[]'::jsonb)
  from public.categories c
$$;




create or replace function public.api_list_services(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_cat    text    := nullif(btrim(p_filters->>'category'), '');
  v_q      text    := nullif(btrim(p_filters->>'q'), '');
  v_max    numeric := nullif(p_filters->>'maxPrice', '')::numeric;
  v_min    numeric := nullif(p_filters->>'minRating', '')::numeric;
  v_unit   text    := nullif(btrim(p_filters->>'unit'), '');
  v_prov   uuid    := nullif(p_filters->>'providerId', '')::uuid;
  v_sort   text    := coalesce(nullif(p_filters->>'sort', ''), 'relevance');
  v_limit  int     := least(greatest(coalesce(nullif(p_filters->>'limit', '')::int, 200), 1), 200);
  v_offset int     := greatest(coalesce(nullif(p_filters->>'offset', '')::int, 0), 0);
  v_like   text;
  v_total  int;
  v_items  jsonb;
begin
  if v_q is not null then
    v_like := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select s.id,
           count(*) over () as total,
           row_number() over (order by
             case when v_sort = 'price_asc'  then s.price end asc,
             case when v_sort = 'price_desc' then s.price end desc,
             case when v_sort = 'newest'     then s.id end desc,
             case when v_sort in ('relevance', 'rating') then s.rating_avg end desc,
             case when v_sort in ('relevance', 'rating') then s.rating_count end desc,
             s.id asc) as rn
      from public.services s
      join public.providers pr on pr.user_id = s.provider_id
     where s.status = 'active'
       and (v_cat  is null or s.category = v_cat)
       and (v_like is null or lower(s.name || ' ' || pr.full_name || ' ' || s.category) like v_like)
       and (v_max  is null or s.price <= v_max)
       and (v_min  is null or s.rating_avg >= v_min)
       and (v_unit is null or s.unit = v_unit)
       and (v_prov is null or s.provider_id = v_prov)
  ), page as (
    select * from base where rn > v_offset and rn <= v_offset + v_limit
  )
  select coalesce(max(page.total), 0),
         coalesce(jsonb_agg(public.sl_service_json(s) order by page.rn), '[]'::jsonb)
    into v_total, v_items
    from page join public.services s on s.id = page.id;

  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

create or replace function public.api_get_service(p_id bigint, p_viewer uuid default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare s public.services; v jsonb;
begin
  select * into s from public.services where id = p_id;
  if not found or s.status = 'deleted'
     or (s.status = 'removed' and s.provider_id is distinct from p_viewer) then
    perform public.sl_err('not_found', 'Service not found.');
  end if;

  v := public.sl_service_json(s);
  return v || jsonb_build_object(
    'isOwn',   coalesce(p_viewer = s.provider_id, false),
    'hired',   exists (select 1 from public.bookings b
                        where b.customer_id = p_viewer and b.service_id = s.id and b.status <> 'Cancelled'),
    'myRating', (select r.stars from public.reviews r
                  where r.service_id = s.id and r.author_id = p_viewer and r.booking_id is not null
                  order by r.created_at desc limit 1),
    'canReview', exists (select 1 from public.reviews r
                          where r.service_id = s.id and r.author_id = p_viewer
                            and r.booking_id is not null and r.comment is null),
    'inCart',  exists (select 1 from public.cart_items c where c.user_id = p_viewer and c.service_id = s.id),
    'reviewList', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'name', r.author_name, 'stars', r.stars, 'comment', r.comment,
                    'images', to_jsonb(r.images), 'date', coalesce(r.commented_at, r.created_at),
                    'reply', case when r.reply is not null
                                  then jsonb_build_object('text', r.reply, 'at', r.reply_at, 'by', v->>'provider') end)
                    order by coalesce(r.commented_at, r.created_at) desc), '[]'::jsonb)
                  from (select * from public.reviews x
                         where x.service_id = s.id and x.comment is not null
                         order by coalesce(x.commented_at, x.created_at) desc limit 50) r));
end $$;


create or replace function public.api_get_provider(p_id uuid, p_viewer uuid default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare pr public.providers; pf public.profiles; v_reviews int; v_rating numeric;
begin
  select * into pr from public.providers where user_id = p_id;
  if not found then perform public.sl_err('not_found', 'Provider not found.'); end if;
  select * into pf from public.profiles where id = p_id;

  select coalesce(sum(s.rating_count), 0),
         case when coalesce(sum(s.rating_count), 0) > 0
              then round(sum(s.rating_avg * s.rating_count) / sum(s.rating_count), 2) else 0 end
    into v_reviews, v_rating
    from public.services s where s.provider_id = p_id and s.status = 'active';

  return jsonb_build_object(
    'id', pr.user_id, 'name', pr.full_name, 'own', coalesce(p_viewer = p_id, false),
    'avatar', pf.avatar_url,
    'bio', coalesce(nullif(btrim(pf.bio), ''), nullif(btrim(pr.about), ''), ''),
    'location', coalesce(nullif(concat_ws(', ', nullif(pr.city, ''), nullif(pr.province, '')), ''), nullif(pf.location, '')),
    'availability', pr.availability,
    'memberSince', pr.created_at,
    'responds', null,
    'rating', v_rating, 'reviews', v_reviews,
    'services', (select coalesce(jsonb_agg(public.sl_service_json(s) order by s.rating_avg desc, s.id), '[]'::jsonb)
                   from public.services s where s.provider_id = p_id and s.status = 'active'),
    'categories', (select coalesce(jsonb_agg(distinct s.category), '[]'::jsonb)
                     from public.services s where s.provider_id = p_id and s.status = 'active'),
    'skills', (select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
                 from public.services s, unnest(s.skills) k
                where s.provider_id = p_id and s.status = 'active'),
    'cheapest', (select jsonb_build_object('price', s.price, 'unit', s.unit)
                   from public.services s where s.provider_id = p_id and s.status = 'active'
                  order by s.price asc, s.id asc limit 1),
    'latestReviews', (select coalesce(jsonb_agg(jsonb_build_object(
                          'name', r.author_name, 'stars', r.stars, 'comment', r.comment,
                          'date', coalesce(r.commented_at, r.created_at), 'service', sv.name)
                          order by coalesce(r.commented_at, r.created_at) desc), '[]'::jsonb)
                        from (select x.* from public.reviews x
                                join public.services s2 on s2.id = x.service_id
                               where s2.provider_id = p_id and s2.status = 'active' and x.comment is not null
                               order by coalesce(x.commented_at, x.created_at) desc limit 4) r
                        join public.services sv on sv.id = r.service_id));
end $$;






create or replace function public.api_cart_list(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'count', count(*),
    'items', coalesce(jsonb_agg(public.sl_service_json(s) order by c.created_at), '[]'::jsonb))
  from public.cart_items c
  join public.services s on s.id = c.service_id and s.status = 'active'
  where c.user_id = p_user
$$;

create or replace function public.api_cart_add(p_user uuid, p_service bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare s public.services;
begin
  select * into s from public.services where id = p_service and status = 'active';
  if not found then perform public.sl_err('not_found', 'Service not found.'); end if;
  if s.provider_id = p_user then perform public.sl_err('invalid', 'You cannot add your own service to the cart.'); end if;
  insert into public.cart_items (user_id, service_id) values (p_user, p_service)
  on conflict do nothing;
  return public.api_cart_list(p_user);
end $$;

create or replace function public.api_cart_remove(p_user uuid, p_service bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from public.cart_items where user_id = p_user and service_id = p_service;
  return public.api_cart_list(p_user);
end $$;









create or replace function public.api_become_provider(p_user uuid, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  me public.profiles; pr public.providers;
  v_name text; v_contact text; v_email text; v_avail text;
  v_addr text; v_city text; v_prov text; v_about text; v_lat double precision; v_lng double precision;
begin
  select * into me from public.profiles where id = p_user;
  if not found then perform public.sl_err('unauthorized', 'Account not found.'); end if;

  select * into pr from public.providers where user_id = p_user;
  if found then
    return jsonb_build_object('created', false, 'provider', public.sl_provider_json(pr));
  end if;

  v_name    := coalesce(nullif(btrim(p_data->>'fullName'), ''), nullif(btrim(me.name), ''));
  v_contact := coalesce(nullif(btrim(p_data->>'contact'),  ''), nullif(btrim(me.contact), ''));
  v_email   := lower(coalesce(nullif(btrim(p_data->>'email'), ''), nullif(btrim(me.email), '')));
  v_avail   := coalesce(nullif(btrim(p_data->>'availability'), ''), 'Weekdays');
  v_addr    := coalesce(btrim(p_data->>'address'), '');
  v_city    := coalesce(btrim(p_data->>'city'), '');
  v_prov    := coalesce(btrim(p_data->>'province'), '');
  v_about   := coalesce(btrim(p_data->>'about'), '');

  if v_name is null or v_contact is null or v_email is null then
    perform public.sl_err('invalid', 'Complete your name, contact number and email first.');
  end if;
  if v_avail not in ('Weekdays', 'Weekends', 'Every day') then
    perform public.sl_err('invalid', 'Choose your availability.');
  end if;
  if char_length(v_name) > 100 or char_length(v_contact) > 40 or char_length(v_about) > 2000
     or char_length(v_addr) > 200 or char_length(v_city) > 100 or char_length(v_prov) > 100 then
    perform public.sl_err('invalid', 'One of the fields is too long.');
  end if;
  begin
    v_lat := nullif(p_data->>'lat', '')::double precision;
    v_lng := nullif(p_data->>'lng', '')::double precision;
  exception when others then
    perform public.sl_err('invalid', 'Map coordinates are not valid.');
  end;
  if (v_lat is null) <> (v_lng is null) or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    v_lat := null; v_lng := null;
  end if;

  insert into public.providers (user_id, full_name, contact, email, availability, address, city, province, lat, lng, about)
  values (p_user, v_name, v_contact, v_email, v_avail, v_addr, v_city, v_prov, v_lat, v_lng, v_about)
  returning * into pr;


  update public.profiles
     set name     = case when btrim(name) = ''     then v_name    else name end,
         contact  = case when btrim(contact) = ''  then v_contact else contact end,
         location = case when btrim(location) = '' and (v_city <> '' or v_prov <> '')
                         then concat_ws(', ', nullif(v_addr, ''), nullif(v_city, ''), nullif(v_prov, ''))
                         else location end
   where id = p_user;

  return jsonb_build_object('created', true, 'provider', public.sl_provider_json(pr));
end $$;

create or replace function public.sl_require_provider(p_user uuid) returns public.providers
language plpgsql stable set search_path = public, pg_temp as $$
declare pr public.providers;
begin
  select * into pr from public.providers where user_id = p_user;
  if not found then perform public.sl_err('forbidden', 'Become a provider first.'); end if;
  return pr;
end $$;



create or replace function public.api_demand(p_limit int default 5) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t.nm, 'category', t.cat, 'count', t.cnt,
           'avgBudget', coalesce(round(t.ab), 0)) order by t.cnt desc, t.first_id), '[]'::jsonb)
  from (
    select count(*) as cnt, min(r.id) as first_id,
           (array_agg(btrim(r.name) order by r.id))[1]  as nm,
           (array_agg(r.category    order by r.id))[1]  as cat,
           avg(nullif(r.budget, 0))                     as ab
      from public.service_requests r
     where public.sl_norm(r.name) <> ''
     group by public.sl_norm(r.name)
     order by count(*) desc, min(r.id)
     limit greatest(coalesce(p_limit, 5), 1)
  ) t
$$;

create or replace function public.api_provider_dashboard(p_user uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare pr public.providers; v_reviews int; v_rating numeric;
begin
  pr := public.sl_require_provider(p_user);

  select coalesce(sum(s.rating_count), 0),
         case when coalesce(sum(s.rating_count), 0) > 0
              then round(sum(s.rating_avg * s.rating_count) / sum(s.rating_count), 2) else 0 end
    into v_reviews, v_rating
    from public.services s where s.provider_id = p_user and s.status in ('active', 'removed');

  return jsonb_build_object(
    'provider', public.sl_provider_json(pr),

    'salary', (select coalesce(sum(b.subtotal), 0) from public.bookings b
                where b.provider_id = p_user and b.status = 'Completed'),
    'rating', v_rating, 'reviews', v_reviews,
    'services', (select coalesce(jsonb_agg(public.sl_service_owner_json(s) order by s.id), '[]'::jsonb)
                   from public.services s where s.provider_id = p_user and s.status in ('active', 'removed')),
    'demand', public.api_demand(5));
end $$;


create or replace function public.api_provider_save_service(p_user uuid, p_id bigint, p_data jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pr public.providers; s public.services;
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_cat text := btrim(coalesce(p_data->>'category', ''));
  v_unit text := btrim(coalesce(p_data->>'unit', ''));
  v_desc text := btrim(coalesce(p_data->>'description', ''));
  v_price numeric;
  v_skills text[];
  r record;
begin
  pr := public.sl_require_provider(p_user);

  if char_length(v_name) < 2 or char_length(v_name) > 120 then perform public.sl_err('invalid', 'Service name must be 2 to 120 characters.'); end if;
  if not exists (select 1 from public.categories where name = v_cat) then perform public.sl_err('invalid', 'Choose a category.'); end if;
  if v_unit not in ('per hour', 'per day', 'per job') then perform public.sl_err('invalid', 'Choose a pricing type.'); end if;
  if v_desc = '' or char_length(v_desc) > 2000 then perform public.sl_err('invalid', 'Enter a description (up to 2000 characters).'); end if;
  begin
    v_price := (p_data->>'price')::numeric;
  exception when others then
    perform public.sl_err('invalid', 'Enter a valid price.');
  end;
  if v_price is null or v_price < 0 or v_price > 10000000 then perform public.sl_err('invalid', 'Enter a valid price.'); end if;


  select coalesce(array_agg(y.k order by y.n), '{}') into v_skills
    from (select d.k, d.n
            from (select distinct on (lower(btrim(e))) left(btrim(e), 40) as k, n
                    from jsonb_array_elements_text(coalesce(p_data->'skills', '[]'::jsonb)) with ordinality as t(e, n)
                   where btrim(e) <> ''
                   order by lower(btrim(e)), n) d
           order by d.n limit 12) y;

  if p_id is null then
    insert into public.services (provider_id, name, category, price, unit, description, skills)
    values (p_user, v_name, v_cat, v_price, v_unit, v_desc, v_skills)
    returning * into s;


    for r in
      select q.id, q.user_id from public.service_requests q
       where q.notified_at is null and q.user_id is not null and q.user_id <> p_user
         and cardinality(public.sl_stems(q.name)) > 0
         and public.sl_stems(q.name) <@ public.sl_stems(s.name)
    loop
      perform public.sl_notify(r.user_id, 'A service you requested is now offered',
                               pr.full_name || ' now offers ' || s.name || '.', 'send', 'req:' || r.id);
      update public.service_requests set notified_at = now() where id = r.id;
    end loop;
  else
    select * into s from public.services where id = p_id and provider_id = p_user for update;
    if not found or s.status = 'deleted' then perform public.sl_err('not_found', 'Service not found.'); end if;
    if s.status = 'removed' then perform public.sl_err('conflict', 'This service was removed by an administrator and cannot be edited.'); end if;
    update public.services
       set name = v_name, category = v_cat, price = v_price, unit = v_unit, description = v_desc, skills = v_skills
     where id = p_id
    returning * into s;
  end if;

  return public.sl_service_owner_json(s);
end $$;

create or replace function public.api_provider_delete_service(p_user uuid, p_id bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare s public.services;
begin
  perform public.sl_require_provider(p_user);
  select * into s from public.services where id = p_id and provider_id = p_user for update;
  if not found or s.status = 'deleted' then perform public.sl_err('not_found', 'Service not found.'); end if;
  if s.status = 'removed' then perform public.sl_err('conflict', 'This service was removed by an administrator.'); end if;
  update public.services set status = 'deleted' where id = p_id;
  delete from public.cart_items where service_id = p_id;
  return jsonb_build_object('deleted', true, 'id', p_id);
end $$;


create or replace function public.api_provider_service_reviews(p_user uuid, p_service bigint) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare s public.services;
begin
  perform public.sl_require_provider(p_user);
  select * into s from public.services where id = p_service and provider_id = p_user and status <> 'deleted';
  if not found then perform public.sl_err('not_found', 'Service not found.'); end if;
  return public.sl_service_owner_json(s) || jsonb_build_object('reviewList',
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.author_name, 'stars', r.stars, 'comment', r.comment,
        'images', to_jsonb(r.images), 'date', coalesce(r.commented_at, r.created_at),
        'reply', case when r.reply is not null
                      then jsonb_build_object('text', r.reply, 'at', r.reply_at) end)
        order by coalesce(r.commented_at, r.created_at) desc), '[]'::jsonb)
       from public.reviews r where r.service_id = p_service and r.comment is not null));
end $$;

create or replace function public.api_provider_reply(p_user uuid, p_review bigint, p_text text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r public.reviews; s public.services; v_text text := btrim(coalesce(p_text, ''));
begin
  perform public.sl_require_provider(p_user);
  select * into r from public.reviews where id = p_review for update;
  if not found then perform public.sl_err('not_found', 'Review not found.'); end if;
  select * into s from public.services where id = r.service_id;
  if s.provider_id is distinct from p_user then perform public.sl_err('forbidden', 'You can only reply to reviews of your own services.'); end if;
  if r.comment is null then perform public.sl_err('invalid', 'There is no written review to reply to.'); end if;
  if r.reply is not null then perform public.sl_err('conflict', 'You already replied to this review.'); end if;
  if v_text = '' or char_length(v_text) > 1000 then perform public.sl_err('invalid', 'Write a reply (up to 1000 characters).'); end if;

  update public.reviews set reply = v_text, reply_at = now() where id = p_review;
  perform public.sl_notify(r.author_id, 'Provider replied',
                           public.sl_display_name(p_user) || ' replied to your review of ' || s.name || '.', 'message-circle');
  return jsonb_build_object('id', p_review, 'reply', jsonb_build_object('text', v_text, 'at', now()));
end $$;






create or replace function public.api_create_request(p_user uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_cat text := btrim(coalesce(p_data->>'category', ''));
  v_loc text := btrim(coalesce(p_data->>'location', ''));
  v_desc text := btrim(coalesce(p_data->>'description', ''));
  v_budget int := 0;
  q public.service_requests;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then perform public.sl_err('invalid', 'Enter the service you need.'); end if;
  if not exists (select 1 from public.categories where name = v_cat) then perform public.sl_err('invalid', 'Choose a category.'); end if;
  if v_loc = '' or char_length(v_loc) > 200 then perform public.sl_err('invalid', 'Enter a location.'); end if;
  if v_desc = '' or char_length(v_desc) > 2000 then perform public.sl_err('invalid', 'Enter the details of your request.'); end if;
  begin
    v_budget := coalesce(nullif(p_data->>'budget', '')::numeric, 0)::int;
  exception when others then
    perform public.sl_err('invalid', 'Budget must be a number.');
  end;
  if v_budget < 0 or v_budget > 10000000 then perform public.sl_err('invalid', 'Budget must be a number.'); end if;

  insert into public.service_requests (user_id, name, category, budget, location, description)
  values (p_user, v_name, v_cat, v_budget, v_loc, v_desc)
  returning * into q;

  perform public.sl_notify(p_user, 'Service request sent',
                           'We will notify you when a provider offers ' || v_name || '.', 'send');
  return jsonb_build_object('id', q.id, 'name', q.name, 'category', q.category, 'budget', q.budget,
                            'location', q.location, 'createdAt', q.created_at);
end $$;















create or replace function public.api_create_booking(p_user uuid, p_data jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  me public.profiles; s public.services; pr public.providers; b public.bookings;
  v_loc text := btrim(coalesce(p_data->>'location', ''));
  v_method text := lower(btrim(coalesce(p_data->>'method', '')));
  v_last4 text := nullif(btrim(coalesce(p_data->>'last4', '')), '');
  v_tz text := coalesce(nullif(btrim(p_data->>'tz'), ''), 'Asia/Manila');
  v_label text := nullif(btrim(coalesce(p_data->>'whenLabel', '')), '');
  v_qty int; v_at timestamptz; v_sub numeric; v_fee numeric; v_total numeric; v_ref text;
  v_lat double precision; v_lng double precision; v_rate numeric := public.sl_setting('platform_fee', 0.05);
begin
  select * into me from public.profiles where id = p_user;
  if not found then perform public.sl_err('unauthorized', 'Account not found.'); end if;

  begin
    select * into s from public.services where id = (p_data->>'serviceId')::bigint;
  exception when others then
    perform public.sl_err('invalid', 'Choose a service.');
  end;
  if not found or s.status <> 'active' then perform public.sl_err('not_found', 'This service is no longer available.'); end if;
  select * into pr from public.providers where user_id = s.provider_id;
  if s.provider_id = p_user then perform public.sl_err('invalid', 'You cannot hire your own service.'); end if;

  if v_loc = '' then perform public.sl_err('invalid', 'Enter the service location.'); end if;
  if char_length(v_loc) > 200 then perform public.sl_err('invalid', 'The service location is too long.'); end if;
  if v_method not in ('gcash', 'maya', 'card', 'cash') then perform public.sl_err('invalid', 'Choose a payment method.'); end if;
  if v_method = 'card' then
    if v_last4 is null or v_last4 !~ '^[0-9]{4}$' then perform public.sl_err('invalid', 'Enter a valid card number.'); end if;
  else
    v_last4 := null;
  end if;

  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'Asia/Manila'; end if;
  if coalesce(p_data->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'time', '') !~ '^\d{2}:\d{2}$' then
    perform public.sl_err('invalid', 'Choose a date and time.');
  end if;
  begin
    v_at := ((p_data->>'date') || ' ' || (p_data->>'time'))::timestamp at time zone v_tz;
  exception when others then
    perform public.sl_err('invalid', 'Choose a valid date and time.');
  end;
  if v_at <= now() then perform public.sl_err('invalid', 'Choose a time in the future.'); end if;

  if exists (select 1 from public.bookings
              where customer_id = p_user and service_id = s.id and scheduled_at = v_at and status = 'Ongoing') then
    perform public.sl_err('conflict', 'You already booked this service for that time.');
  end if;
  if v_label is null then v_label := to_char(v_at at time zone v_tz, 'Dy, Mon FMDD, FMHH12:MI AM'); end if;
  v_label := left(v_label, 80);

  begin
    v_qty := case when s.unit = 'per job' then 1 else coalesce(nullif(p_data->>'qty', '')::int, 1) end;
  exception when others then
    perform public.sl_err('invalid', 'Hours or days must be a whole number from 1 to 30.');
  end;
  if v_qty < 1 or v_qty > 30 then perform public.sl_err('invalid', 'Hours or days must be a whole number from 1 to 30.'); end if;

  begin
    v_lat := nullif(p_data->>'lat', '')::double precision;
    v_lng := nullif(p_data->>'lng', '')::double precision;
  exception when others then
    v_lat := null; v_lng := null;
  end;
  if (v_lat is null) <> (v_lng is null) or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    v_lat := null; v_lng := null;
  end if;

  v_sub := s.price * v_qty;
  v_fee := round(v_sub * v_rate);
  v_total := v_sub + v_fee;

  loop
    v_ref := 'SL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.bookings where ref = v_ref);
  end loop;

  insert into public.bookings (ref, customer_id, customer_name, service_id, service_name, category,
                               provider_id, provider_name, unit, unit_price, qty, status, location,
                               dest_lat, dest_lng, scheduled_at, when_label, pay_method, card_last4,
                               subtotal, fee, total, pay_status)
  values (v_ref, p_user, coalesce(nullif(btrim(me.name), ''), split_part(me.email, '@', 1)), s.id, s.name, s.category,
          s.provider_id, pr.full_name, s.unit, s.price, v_qty, 'Ongoing', v_loc,
          v_lat, v_lng, v_at, v_label, v_method, v_last4,
          v_sub, v_fee, v_total, case when v_method = 'cash' then 'due-cash' else 'held' end)
  returning * into b;

  perform public.sl_notify(p_user, 'Booking confirmed',
                           pr.full_name || ' accepted ' || s.name || ' for ' || v_label || '.', 'check-circle-2');
  perform public.sl_notify(s.provider_id, 'New booking',
                           b.customer_name || ' booked ' || s.name || ' for ' || v_label || '. Reference ' || v_ref || '.', 'calendar-clock');
  return public.sl_booking_json(b);
end $$;

create or replace function public.api_list_bookings(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.sl_booking_json(b) order by b.created_at desc), '[]'::jsonb)
  from public.bookings b where b.customer_id = p_user
$$;

create or replace function public.api_get_booking(p_user uuid, p_id uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_id;
  if not found or (b.customer_id is distinct from p_user and b.provider_id is distinct from p_user) then
    perform public.sl_err('not_found', 'Booking not found.');
  end if;
  return public.sl_booking_json(b);
end $$;


create or replace function public.api_provider_bookings(p_user uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
begin
  perform public.sl_require_provider(p_user);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', b.id, 'ref', b.ref, 'service', b.service_name, 'customer', b.customer_name,
            'customerId', b.customer_id, 'status', b.status, 'when', b.when_label,
            'scheduledAt', b.scheduled_at, 'location', b.location, 'qty', b.qty, 'unit', b.unit,
            'destination', case when b.dest_lat is not null
                                then jsonb_build_object('lat', b.dest_lat, 'lng', b.dest_lng) end,
            'payment', jsonb_build_object('method', b.pay_method, 'subtotal', b.subtotal,
                                          'total', b.total, 'status', b.pay_status),
            'createdAt', b.created_at)
            order by (b.status = 'Ongoing') desc, b.created_at desc), '[]'::jsonb)
          from public.bookings b where b.provider_id = p_user);
end $$;


create or replace function public.api_finish_booking(p_user uuid, p_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_id and customer_id = p_user for update;
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;
  if b.status <> 'Ongoing' then perform public.sl_err('conflict', 'Only an ongoing booking can be marked as finished.'); end if;

  update public.bookings
     set status = 'Completed', completed_at = now(),
         pay_status = case pay_status when 'held' then 'released' when 'due-cash' then 'paid-cash' else pay_status end
   where id = p_id
  returning * into b;

  perform public.sl_notify(p_user,
    case b.pay_status when 'released' then 'Payment released' else 'Cash payment recorded' end,
    '₱' || to_char(b.total, 'FM999,999,999,990') || ' for ' || b.service_name || '.', 'wallet');
  perform public.sl_notify(p_user, 'Review reminder',
    'Share your experience by leaving a rating for your completed service.', 'star');
  perform public.sl_notify(b.provider_id, 'Job completed',
    b.customer_name || ' marked ' || b.service_name || ' as finished. ₱'
      || to_char(b.subtotal, 'FM999,999,999,990') || ' added to your earnings.', 'wallet');
  return public.sl_booking_json(b);
end $$;


create or replace function public.api_cancel_booking(p_user uuid, p_id uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare b public.bookings; v_other uuid;
begin
  select * into b from public.bookings
   where id = p_id and (customer_id = p_user or provider_id = p_user) for update;
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;
  if b.status <> 'Ongoing' then perform public.sl_err('conflict', 'Only an ongoing booking can be cancelled.'); end if;

  update public.bookings
     set status = 'Cancelled', cancelled_at = now(),
         pay_status = case pay_status when 'held' then 'refunded' when 'due-cash' then 'void' else pay_status end
   where id = p_id
  returning * into b;

  v_other := case when p_user = b.customer_id then b.provider_id else b.customer_id end;
  perform public.sl_notify(v_other, 'Booking cancelled',
    public.sl_display_name(p_user) || ' cancelled ' || b.service_name || ' (' || b.ref || ').', 'flag');
  if p_user = b.provider_id then
    perform public.sl_notify(b.customer_id, 'Refund', 'Your payment for ' || b.service_name || ' will not be charged.', 'wallet');
  end if;
  return public.sl_booking_json(b);
end $$;







create or replace function public.api_rate_booking(p_user uuid, p_id uuid, p_stars int) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare b public.bookings; me public.profiles;
begin
  select * into b from public.bookings where id = p_id and customer_id = p_user for update;
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;
  if b.status <> 'Completed' then perform public.sl_err('conflict', 'You can rate a job once it is completed.'); end if;
  if b.service_id is null then perform public.sl_err('conflict', 'This service no longer exists.'); end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then perform public.sl_err('invalid', 'Choose a rating from 1 to 5.'); end if;
  if exists (select 1 from public.reviews where booking_id = p_id) then
    perform public.sl_err('conflict', 'You already rated this job.');
  end if;

  select * into me from public.profiles where id = p_user;
  insert into public.reviews (service_id, booking_id, author_id, author_name, stars)
  values (b.service_id, p_id, p_user, coalesce(nullif(btrim(me.name), ''), split_part(me.email, '@', 1)), p_stars);

  perform public.sl_notify(b.provider_id, 'New rating',
    b.customer_name || ' rated ' || b.service_name || ' ' || p_stars || ' out of 5.', 'star');
  return public.sl_booking_json(b);
end $$;



create or replace function public.api_review_booking(p_user uuid, p_booking uuid, p_service bigint,
                                                    p_text text, p_images jsonb default '[]'::jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r public.reviews; b public.bookings; v_text text := btrim(coalesce(p_text, '')); v_images text[];
begin
  if p_booking is not null then
    select * into r from public.reviews where booking_id = p_booking and author_id = p_user for update;
  else
    select * into r from public.reviews
     where service_id = p_service and author_id = p_user and booking_id is not null and comment is null
     order by created_at desc limit 1 for update;
  end if;
  if not found then perform public.sl_err('conflict', 'Rate this service from your History first.'); end if;
  if r.comment is not null then perform public.sl_err('conflict', 'You already reviewed this job.'); end if;
  if v_text = '' or char_length(v_text) > 2000 then perform public.sl_err('invalid', 'Write your review (up to 2000 characters).'); end if;

  select coalesce(array_agg(e), '{}') into v_images from jsonb_array_elements_text(coalesce(p_images, '[]'::jsonb)) e;
  if cardinality(v_images) > 4 then perform public.sl_err('invalid', 'You can attach up to 4 images.'); end if;

  update public.reviews set comment = v_text, images = v_images, commented_at = now() where id = r.id;
  select * into b from public.bookings where id = r.booking_id;
  perform public.sl_notify(b.provider_id, 'New review',
    r.author_name || ' reviewed ' || b.service_name || '.', 'message-circle');
  return jsonb_build_object('id', r.id, 'stars', r.stars, 'comment', v_text, 'images', to_jsonb(v_images),
                            'serviceId', r.service_id, 'bookingId', r.booking_id);
end $$;


create or replace function public.api_report_booking(p_user uuid, p_id uuid, p_reason text,
                                                    p_details text, p_evidence jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare b public.bookings; x public.reports; v_details text := btrim(coalesce(p_details, '')); v_ev text[];
begin
  select * into b from public.bookings where id = p_id and customer_id = p_user for update;
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;
  if b.status <> 'Completed' then perform public.sl_err('conflict', 'You can report a job once it is completed.'); end if;
  if exists (select 1 from public.reports where booking_id = p_id) then
    perform public.sl_err('conflict', 'You already reported this job.');
  end if;
  if coalesce(p_reason, '') not in ('Did not show up','Unsafe behavior','Asked for extra or off-app payment',
       'Poor quality of work','Rude or disrespectful','Damaged or took property','Fake or misleading profile','Other') then
    perform public.sl_err('invalid', 'Choose what went wrong.');
  end if;
  if char_length(v_details) < 20 then perform public.sl_err('invalid', 'Describe what happened in at least 20 characters.'); end if;
  if char_length(v_details) > 500 then perform public.sl_err('invalid', 'The description can be at most 500 characters.'); end if;
  select coalesce(array_agg(e), '{}') into v_ev from jsonb_array_elements_text(coalesce(p_evidence, '[]'::jsonb)) e;
  if cardinality(v_ev) < 1 then perform public.sl_err('invalid', 'Add at least one photo or screenshot as evidence.'); end if;
  if cardinality(v_ev) > 4 then perform public.sl_err('invalid', 'You can add up to 4 images.'); end if;

  insert into public.reports (booking_id, reporter_id, reporter_name, provider_id, provider_name, service_name, reason, details, evidence)
  values (p_id, p_user, b.customer_name, b.provider_id, b.provider_name, b.service_name, p_reason, v_details, v_ev)
  returning * into x;

  perform public.sl_notify(p_user, 'Report received',
    'We will review your report about ' || b.provider_name || ' and update you here.', 'flag');
  return public.sl_booking_json(b);
end $$;







create or replace function public.api_post_location(p_user uuid, p_booking uuid, p_lat double precision,
                                                    p_lng double precision, p_speed real default 0) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare b public.bookings; v_d double precision;
begin
  select * into b from public.bookings where id = p_booking and provider_id = p_user for update;
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;
  if b.status <> 'Ongoing' then perform public.sl_err('conflict', 'This job is not ongoing.'); end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    perform public.sl_err('invalid', 'Location is not valid.');
  end if;

  insert into public.booking_locations (booking_id, lat, lng, speed)
  values (p_booking, p_lat, p_lng, least(greatest(coalesce(p_speed, 0), 0), 250));


  delete from public.booking_locations
   where booking_id = p_booking
     and id not in (select id from public.booking_locations where booking_id = p_booking order by id desc limit 300);

  if b.on_the_way_at is null then
    update public.bookings set on_the_way_at = now() where id = p_booking;
    perform public.sl_notify(b.customer_id, 'Provider on the way', b.provider_name || ' is heading to your location.', 'navigation');
  end if;
  if b.dest_lat is not null and b.arrived_at is null then
    v_d := public.sl_meters(p_lat, p_lng, b.dest_lat, b.dest_lng);
    if v_d < 40 then
      update public.bookings set arrived_at = now() where id = p_booking;
      perform public.sl_notify(b.customer_id, 'Provider arrived', b.provider_name || ' has arrived for ' || b.service_name || '.', 'map-pin');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;


create or replace function public.api_track(p_user uuid, p_booking uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare b public.bookings; l record; v_d double precision; v_done boolean; v_step int; v_age int;
begin
  select * into b from public.bookings
   where id = p_booking and (customer_id = p_user or provider_id = p_user);
  if not found then perform public.sl_err('not_found', 'Booking not found.'); end if;

  select lat, lng, speed, created_at into l from public.booking_locations
   where booking_id = p_booking order by id desc limit 1;

  v_done := b.status = 'Completed';
  if l.lat is not null and b.dest_lat is not null then
    v_d := public.sl_meters(l.lat, l.lng, b.dest_lat, b.dest_lng);
  end if;
  v_step := case when v_done or (v_d is not null and v_d < 40) then 2
                 when l.lat is null then 0 else 1 end;
  v_age := case when l.lat is null then null else floor(extract(epoch from (now() - l.created_at)))::int end;

  return jsonb_build_object(
    'id', b.id, 'ref', b.ref, 'service', b.service_name, 'provider', b.provider_name,
    'status', b.status, 'when', b.when_label, 'location', b.location,
    'destination', case when b.dest_lat is not null then jsonb_build_object('lat', b.dest_lat, 'lng', b.dest_lng) end,
    'step', v_step, 'done', v_done,
    'last', case when l.lat is not null then jsonb_build_object('lat', l.lat, 'lng', l.lng, 'ts', l.created_at, 'speed', l.speed) end,
    'crumbs', (select coalesce(jsonb_agg(jsonb_build_object('lat', c.lat, 'lng', c.lng) order by c.id), '[]'::jsonb)
                 from (select * from public.booking_locations where booking_id = p_booking order by id desc limit 300) c),
    'distanceM', case when v_d is null then null else round(v_d)::int end,
    'etaMin', case when v_d is null or v_step = 2 then null else greatest(1, round(v_d * 1.3 / 417))::int end,
    'speedKmh', case when v_step = 1 then round(coalesce(l.speed, 0))::int else 0 end,
    'ageSeconds', v_age,
    'stale', (not v_done) and v_age is not null and v_age > 15,
    'payment', jsonb_build_object('method', b.pay_method, 'last4', coalesce(b.card_last4, ''),
                                  'subtotal', b.subtotal, 'fee', b.fee, 'total', b.total, 'status', b.pay_status));
end $$;


create or replace function public.api_active_booking(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select public.sl_booking_json(b) from public.bookings b
   where b.customer_id = p_user and b.status = 'Ongoing'
   order by b.created_at desc limit 1
$$;

create or replace function public.api_payment_summary(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'any',      count(*) > 0,
    'held',     coalesce(sum(total) filter (where pay_status = 'held'), 0),
    'released', coalesce(sum(total) filter (where pay_status = 'released'), 0),
    'dueCash',  coalesce(sum(total) filter (where pay_status = 'due-cash'), 0),
    'paidCash', coalesce(sum(total) filter (where pay_status = 'paid-cash'), 0))
  from public.bookings where customer_id = p_user
$$;






create or replace function public.api_notifications(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = p_user and unread),
    'items', coalesce((select jsonb_agg(public.sl_notification_json(n) order by n.created_at desc, n.id desc)
                         from (select * from public.notifications where user_id = p_user
                                order by created_at desc, id desc limit 100) n), '[]'::jsonb))
$$;

create or replace function public.api_notification_update(p_user uuid, p_id bigint, p_unread boolean) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare n public.notifications;
begin
  update public.notifications set unread = coalesce(p_unread, false)
   where id = p_id and user_id = p_user returning * into n;
  if not found then perform public.sl_err('not_found', 'Notification not found.'); end if;
  return public.sl_notification_json(n);
end $$;

create or replace function public.api_notification_delete(p_user uuid, p_id bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from public.notifications where id = p_id and user_id = p_user;
  if not found then perform public.sl_err('not_found', 'Notification not found.'); end if;
  return jsonb_build_object('deleted', true, 'id', p_id);
end $$;

create or replace function public.api_notifications_read_all(p_user uuid) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.notifications set unread = false where user_id = p_user and unread;
  return jsonb_build_object('ok', true);
end $$;






create or replace function public.sl_conversation(p_a uuid, p_b uuid, p_create boolean) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_lo uuid := least(p_a, p_b); v_hi uuid := greatest(p_a, p_b); v_id uuid;
begin
  select id into v_id from public.conversations where user_a = v_lo and user_b = v_hi;
  if v_id is null and p_create then
    insert into public.conversations (user_a, user_b) values (v_lo, v_hi)
    on conflict (user_a, user_b) do nothing;
    select id into v_id from public.conversations where user_a = v_lo and user_b = v_hi;
  end if;
  return v_id;
end $$;

create or replace function public.api_chat_list(p_user uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'userId', o.other_id,
           'name', public.sl_display_name(o.other_id),
           'avatar', (select avatar_url from public.profiles where id = o.other_id),
           'isProvider', exists (select 1 from public.providers where user_id = o.other_id),
           'lastText', lm.body, 'lastMine', lm.sender_id = p_user, 'lastAt', lm.created_at,
           'unread', (select count(*) from public.messages m
                       where m.conversation_id = o.id and m.sender_id <> p_user and m.read_at is null))
           order by lm.created_at desc), '[]'::jsonb)
  from (select c.id, case when c.user_a = p_user then c.user_b else c.user_a end as other_id
          from public.conversations c where p_user in (c.user_a, c.user_b)) o
  join lateral (select m.body, m.sender_id, m.created_at from public.messages m
                 where m.conversation_id = o.id order by m.id desc limit 1) lm on true
$$;


create or replace function public.api_chat_messages(p_user uuid, p_other uuid, p_after bigint default 0) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v_conv uuid;
begin
  if not exists (select 1 from public.profiles where id = p_other) then
    perform public.sl_err('not_found', 'That person does not exist.');
  end if;
  v_conv := public.sl_conversation(p_user, p_other, false);
  if v_conv is not null then
    update public.messages set read_at = now()
     where conversation_id = v_conv and sender_id <> p_user and read_at is null;
  end if;
  return jsonb_build_object(
    'with', jsonb_build_object('userId', p_other, 'name', public.sl_display_name(p_other),
                               'avatar', (select avatar_url from public.profiles where id = p_other),
                               'isProvider', exists (select 1 from public.providers where user_id = p_other)),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.sender_id = p_user,
                                                              'text', m.body, 'createdAt', m.created_at) order by m.id)
                            from (select * from public.messages
                                   where conversation_id = v_conv and id > coalesce(p_after, 0)
                                   order by id desc limit 200) m), '[]'::jsonb));
end $$;

create or replace function public.api_chat_send(p_user uuid, p_other uuid, p_text text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v_conv uuid; v_text text := btrim(coalesce(p_text, '')); m public.messages;
begin
  if p_other = p_user then perform public.sl_err('invalid', 'You cannot message yourself.'); end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    perform public.sl_err('not_found', 'That person does not exist.');
  end if;
  if v_text = '' or char_length(v_text) > 2000 then perform public.sl_err('invalid', 'Write a message (up to 2000 characters).'); end if;

  v_conv := public.sl_conversation(p_user, p_other, true);
  insert into public.messages (conversation_id, sender_id, body) values (v_conv, p_user, v_text) returning * into m;
  update public.conversations set last_message_at = now() where id = v_conv;
  perform public.sl_notify(p_other, 'New message',
    public.sl_display_name(p_user) || ' sent you a message.', 'message-circle', 'chat:' || p_user);
  return jsonb_build_object('id', m.id, 'mine', true, 'text', m.body, 'createdAt', m.created_at);
end $$;









create or replace function public.sl_provider_stats()
returns table (provider_id uuid, name text, services int, reviews int, rating numeric, low int,
               flagged int, open_reports int, warnings int, status_kind text, status_label text)
language sql stable set search_path = public, pg_temp as $$
  with sv as (
    select s.provider_id, s.id, s.rating_avg, s.rating_count,
           (select count(*) from public.reviews r
             where r.service_id = s.id and r.stars <= public.sl_setting('low_rating_max', 2)) as low
      from public.services s where s.status = 'active'
  ), agg as (
    select pr.user_id as uid, pr.full_name as fname,
           count(sv.id)::int as services,
           coalesce(sum(sv.rating_count), 0)::int as reviews,
           case when coalesce(sum(sv.rating_count), 0) > 0
                then round(sum(sv.rating_avg * sv.rating_count) / sum(sv.rating_count), 2) else 0 end as rating,
           coalesce(sum(sv.low), 0)::int as low,
           (count(*) filter (where sv.low >= public.sl_setting('low_rating_remove_at', 5)))::int as flagged
      from public.providers pr left join sv on sv.provider_id = pr.user_id
     group by pr.user_id, pr.full_name
  ), rp as (
    select r.provider_id as pid, count(*)::int as n from public.reports r where r.status = 'open' group by 1
  ), wn as (
    select w.provider_id as pid, count(*)::int as n from public.provider_warnings w group by 1
  )
  select a.uid, a.fname, a.services, a.reviews, a.rating, a.low, a.flagged,
         coalesce(rp.n, 0), coalesce(wn.n, 0),
         case when coalesce(wn.n, 0) >= 3 then 'bad'
              when coalesce(wn.n, 0) > 0 then 'warn'
              when coalesce(rp.n, 0) >= 2 or a.flagged > 0 or (a.reviews > 0 and a.rating < 4.5) then 'warn'
              else 'ok' end,
         case when coalesce(wn.n, 0) >= 3 then 'Review for suspension'
              when coalesce(wn.n, 0) > 0 then 'Warned (' || wn.n || ')'
              when coalesce(rp.n, 0) >= 2 or a.flagged > 0 or (a.reviews > 0 and a.rating < 4.5) then 'Needs attention'
              else 'Good standing' end
    from agg a left join rp on rp.pid = a.uid left join wn on wn.pid = a.uid
$$;

create or replace function public.api_admin_overview(p_admin uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare v_max numeric := public.sl_setting('low_rating_max', 2); v_at numeric := public.sl_setting('low_rating_remove_at', 5);
begin
  perform public.sl_assert_admin(p_admin);
  return jsonb_build_object(
    'thresholds', jsonb_build_object('lowMax', v_max, 'removeAt', v_at),
    'kpis', jsonb_build_object(
      'providers', (select count(*) from public.providers),
      'services',  (select count(*) from public.services where status = 'active'),
      'avgRating', (select coalesce(round(sum(rating_avg * rating_count) / nullif(sum(rating_count), 0), 2), 0)
                      from public.services where status = 'active'),
      'reviews',   (select coalesce(sum(rating_count), 0) from public.services where status = 'active'),
      'lowRatings',(select count(*) from public.reviews r join public.services s on s.id = r.service_id
                     where s.status = 'active' and r.stars <= v_max),
      'openReports', (select count(*) from public.reports where status = 'open'),
      'warnings',  (select count(*) from public.provider_warnings)),
    'lowServices', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', t.id, 'name', t.name, 'provider', t.provider, 'providerId', t.provider_id,
                      'category', t.category, 'lowCount', t.low, 'removable', t.low >= v_at)
                      order by t.low desc, t.name), '[]'::jsonb)
                    from (select s.id, s.name, pr.full_name as provider, s.provider_id, s.category,
                                 (select count(*) from public.reviews r where r.service_id = s.id and r.stars <= v_max) as low
                            from public.services s join public.providers pr on pr.user_id = s.provider_id
                           where s.status = 'active') t
                   where t.low > 0),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', s.id, 'name', s.name, 'provider', pr.full_name, 'providerId', s.provider_id,
                  'category', s.category, 'removedAt', s.removed_at, 'lowCount', s.removed_low_count)
                  order by s.removed_at desc), '[]'::jsonb)
                from public.services s join public.providers pr on pr.user_id = s.provider_id
               where s.status = 'removed'),
    'openReports', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', 'R-' || r.id, 'rawId', r.id, 'provider', r.provider_name, 'providerId', r.provider_id,
                      'reason', r.reason, 'by', r.reporter_name, 'at', r.created_at)
                      order by r.created_at desc), '[]'::jsonb)
                    from public.reports r where r.status = 'open'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', t.category, 'services', t.n, 'rating', t.rating)
                     order by t.category), '[]'::jsonb)
                   from (select s.category, count(*) as n,
                                case when coalesce(sum(s.rating_count), 0) > 0
                                     then round(sum(s.rating_avg * s.rating_count) / sum(s.rating_count), 2) else 0 end as rating
                           from public.services s where s.status = 'active' group by s.category) t),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'text', l.message, 'by', l.admin_email)
                     order by l.created_at desc, l.id desc), '[]'::jsonb)
              from (select * from public.admin_log order by created_at desc, id desc limit 30) l));
end $$;


create or replace function public.api_admin_providers(p_admin uuid, p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_q text := lower(coalesce(btrim(p_filters->>'q'), ''));
  v_f text := coalesce(p_filters->>'status', '');
  v_s text := coalesce(nullif(p_filters->>'sort', ''), 'name');
  v_like text;
begin
  perform public.sl_assert_admin(p_admin);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.provider_id, 'name', t.name, 'services', t.services, 'rating', t.rating,
             'reviews', t.reviews, 'low', t.low, 'flagged', t.flagged, 'openReports', t.open_reports,
             'warnings', t.warnings, 'status', jsonb_build_object('kind', t.status_kind, 'label', t.status_label))
           order by
             case when v_s = 'low'     then t.rating end asc,
             case when v_s = 'lows'    then t.low end desc,
             case when v_s = 'reports' then t.open_reports end desc,
             t.name asc)
      from public.sl_provider_stats() t
     where (v_q = '' or lower(t.name) like v_like)
       and (v_f = '' or (v_f = 'ok' and t.status_kind = 'ok')
                     or (v_f = 'warned' and t.warnings > 0)
                     or (v_f = 'attn' and t.status_label = 'Needs attention'))
  ), '[]'::jsonb);
end $$;


create or replace function public.api_admin_provider_detail(p_admin uuid, p_provider uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare t record; v_max numeric := public.sl_setting('low_rating_max', 2); v_at numeric := public.sl_setting('low_rating_remove_at', 5);
begin
  perform public.sl_assert_admin(p_admin);
  select * into t from public.sl_provider_stats() x where x.provider_id = p_provider;
  if not found then perform public.sl_err('not_found', 'Provider not found.'); end if;

  return jsonb_build_object(
    'id', t.provider_id, 'name', t.name, 'rating', t.rating, 'reviews', t.reviews, 'low', t.low,
    'openReports', t.open_reports, 'warningCount', t.warnings,
    'status', jsonb_build_object('kind', t.status_kind, 'label', t.status_label),
    'thresholds', jsonb_build_object('lowMax', v_max, 'removeAt', v_at),
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'name', s.name, 'category', s.category, 'rating', s.rating_avg,
                   'reviews', s.rating_count, 'status', s.status, 'lowCount', lc.n, 'removable', s.status = 'active' and lc.n >= v_at)
                   order by s.id), '[]'::jsonb)
                 from public.services s
                 cross join lateral (select count(*) as n from public.reviews r where r.service_id = s.id and r.stars <= v_max) lc
                where s.provider_id = p_provider and s.status in ('active', 'removed')),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', s.id, 'name', s.name, 'category', s.category, 'removedAt', s.removed_at, 'lowCount', s.removed_low_count)
                  order by s.removed_at desc), '[]'::jsonb)
                from public.services s where s.provider_id = p_provider and s.status = 'removed'),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', 'R-' || r.id, 'rawId', r.id, 'reason', r.reason, 'details', r.details, 'by', r.reporter_name,
                  'at', r.created_at, 'status', r.status, 'service', r.service_name, 'evidence', to_jsonb(r.evidence))
                  order by r.created_at desc), '[]'::jsonb)
                from public.reports r where r.provider_id = p_provider),
    'reviewsList', (select coalesce(jsonb_agg(jsonb_build_object(
                      'name', x.author_name, 'stars', x.stars, 'text', x.comment, 'service', x.sname,
                      'date', coalesce(x.commented_at, x.created_at))
                      order by coalesce(x.commented_at, x.created_at) desc), '[]'::jsonb)
                    from (select r.*, s.name as sname from public.reviews r
                            join public.services s on s.id = r.service_id
                           where s.provider_id = p_provider and r.comment is not null
                           order by coalesce(r.commented_at, r.created_at) desc limit 50) x),
    'warnings', (select coalesce(jsonb_agg(jsonb_build_object(
                   'reason', w.reason, 'message', w.message, 'at', w.created_at, 'by', w.admin_email)
                   order by w.created_at desc), '[]'::jsonb)
                 from public.provider_warnings w where w.provider_id = p_provider));
end $$;

create or replace function public.api_admin_warn(p_admin uuid, p_provider uuid, p_reason text, p_message text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare pr public.providers; v_msg text := btrim(coalesce(p_message, '')); v_email text;
begin
  perform public.sl_assert_admin(p_admin);
  select * into pr from public.providers where user_id = p_provider;
  if not found then perform public.sl_err('not_found', 'Provider not found.'); end if;
  if coalesce(p_reason, '') not in ('Repeated client complaints','No-show or late arrivals','Off-app payment requests',
       'Unsafe or rude behavior','Misleading profile or listing','Other') then
    perform public.sl_err('invalid', 'Choose a reason.');
  end if;
  if char_length(v_msg) > 300 then perform public.sl_err('invalid', 'The message can be at most 300 characters.'); end if;

  select email into v_email from public.profiles where id = p_admin;
  insert into public.provider_warnings (provider_id, reason, message, admin_id, admin_email)
  values (p_provider, p_reason, v_msg, p_admin, coalesce(v_email, ''));

  perform public.sl_log(p_admin, 'Warning sent to ' || pr.full_name || ': ' || p_reason);
  perform public.sl_notify(p_provider, 'Warning from SkillLink',
    p_reason || case when v_msg <> '' then ': ' || v_msg else '' end || ' Please review our provider guidelines.', 'flag');
  return jsonb_build_object('ok', true, 'warnings', (select count(*) from public.provider_warnings where provider_id = p_provider));
end $$;


create or replace function public.api_admin_remove_service(p_admin uuid, p_service bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare s public.services; pr public.providers; v_n int; v_at numeric := public.sl_setting('low_rating_remove_at', 5);
begin
  perform public.sl_assert_admin(p_admin);
  select * into s from public.services where id = p_service for update;
  if not found or s.status = 'deleted' then perform public.sl_err('not_found', 'Service not found.'); end if;
  if s.status <> 'active' then perform public.sl_err('conflict', 'This service is not listed.'); end if;
  select count(*) into v_n from public.reviews r
   where r.service_id = p_service and r.stars <= public.sl_setting('low_rating_max', 2);
  if v_n < v_at then
    perform public.sl_err('conflict', 'A service can be removed once it has ' || v_at::int || ' valid low ratings. This one has ' || v_n || '.');
  end if;

  update public.services
     set status = 'removed', removed_at = now(), removed_by = p_admin, removed_low_count = v_n
   where id = p_service;
  delete from public.cart_items where service_id = p_service;
  select * into pr from public.providers where user_id = s.provider_id;
  perform public.sl_log(p_admin, 'Service removed: ' || s.name || ' (' || pr.full_name || '), ' || v_n || ' valid low ratings');
  perform public.sl_notify(s.provider_id, 'Service removed',
    s.name || ' was removed from the directory after ' || v_n || ' customers gave it a low rating.', 'flag');
  return jsonb_build_object('ok', true, 'id', p_service, 'lowCount', v_n);
end $$;

create or replace function public.api_admin_restore_service(p_admin uuid, p_service bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare s public.services; pr public.providers;
begin
  perform public.sl_assert_admin(p_admin);
  select * into s from public.services where id = p_service for update;
  if not found or s.status <> 'removed' then perform public.sl_err('not_found', 'Removed service not found.'); end if;
  update public.services
     set status = 'active', removed_at = null, removed_by = null, removed_low_count = null
   where id = p_service;
  select * into pr from public.providers where user_id = s.provider_id;
  perform public.sl_log(p_admin, 'Service restored: ' || s.name || ' (' || pr.full_name || ')');
  perform public.sl_notify(s.provider_id, 'Service restored', s.name || ' is listed in the directory again.', 'check-circle-2');
  return jsonb_build_object('ok', true, 'id', p_service);
end $$;

create or replace function public.api_admin_resolve_report(p_admin uuid, p_report bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r public.reports;
begin
  perform public.sl_assert_admin(p_admin);
  select * into r from public.reports where id = p_report for update;
  if not found then perform public.sl_err('not_found', 'Report not found.'); end if;
  if r.status = 'resolved' then perform public.sl_err('conflict', 'This report is already resolved.'); end if;
  update public.reports set status = 'resolved', resolved_at = now(), resolved_by = p_admin where id = p_report;
  perform public.sl_log(p_admin, 'Report R-' || p_report || ' marked resolved');
  perform public.sl_notify(r.reporter_id, 'Report update',
    'We reviewed your report about ' || r.provider_name || ' and marked it as resolved.', 'flag');
  return jsonb_build_object('ok', true, 'id', 'R-' || p_report);
end $$;

create or replace function public.api_admin_log_event(p_admin uuid, p_text text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.sl_assert_admin(p_admin);
  perform public.sl_log(p_admin, left(p_text, 300));
end $$;








create or replace function public.api_market_snapshot(p_user uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare pr public.providers; pf public.profiles;
begin
  select * into pf from public.profiles where id = p_user;
  select * into pr from public.providers where user_id = p_user;
  return jsonb_build_object(
    'location', coalesce(nullif(concat_ws(', ', nullif(pr.city, ''), nullif(pr.province, '')), ''), nullif(pf.location, '')),
    'own', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'category', s.category, 'unit', s.unit)), '[]'::jsonb)
              from public.services s where s.provider_id = p_user and s.status in ('active', 'removed')),
    'demand', (select coalesce(jsonb_agg(jsonb_build_object(
                        'name', t.nm, 'category', t.cat, 'count30', t.c30, 'countAll', t.cnt, 'avgBudget', coalesce(round(t.ab), 0))
                        order by t.c30 desc, t.cnt desc, t.first_id), '[]'::jsonb)
                 from (select count(*) as cnt, count(*) filter (where r.created_at > now() - interval '30 days') as c30,
                              min(r.id) as first_id, (array_agg(btrim(r.name) order by r.id))[1] as nm,
                              (array_agg(r.category order by r.id))[1] as cat, avg(nullif(r.budget, 0)) as ab
                         from public.service_requests r
                        where public.sl_norm(r.name) <> '' and r.created_at > now() - interval '90 days'
                        group by public.sl_norm(r.name)
                        order by count(*) desc, min(r.id) limit 40) t),
    'ranges', (select coalesce(jsonb_agg(jsonb_build_object(
                         'category', g.category, 'unit', g.unit, 'min', g.mn, 'max', g.mx, 'n', g.n)), '[]'::jsonb)
                 from (select s.category, s.unit, min(s.price) as mn, max(s.price) as mx, count(*) as n
                         from public.services s
                        where s.status = 'active' and s.provider_id <> p_user
                        group by s.category, s.unit) g));
end $$;






create or replace function public.api_config() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'platformFee', public.sl_setting('platform_fee', 0.05),
    'lowRatingMax', public.sl_setting('low_rating_max', 2),
    'lowRatingRemoveAt', public.sl_setting('low_rating_remove_at', 5))
$$;

create or replace function public.api_is_provider(p_user uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.providers where user_id = p_user)
$$;


create or replace function public.api_find_user_id(p_email text) returns uuid
language sql stable as $$
  select id from public.profiles where lower(email) = lower(btrim(p_email)) limit 1
$$;








alter table public.app_settings       enable row level security;
alter table public.categories         enable row level security;
alter table public.profiles           enable row level security;
alter table public.providers          enable row level security;
alter table public.services           enable row level security;
alter table public.service_requests   enable row level security;
alter table public.cart_items         enable row level security;
alter table public.bookings           enable row level security;
alter table public.booking_locations  enable row level security;
alter table public.reviews            enable row level security;
alter table public.reports            enable row level security;
alter table public.notifications      enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.provider_warnings  enable row level security;
alter table public.admin_log          enable row level security;


revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;




grant select on public.notifications, public.conversations, public.messages,
                public.bookings, public.booking_locations to authenticated;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists conversations_participant_read on public.conversations;
create policy conversations_participant_read on public.conversations
  for select to authenticated using (auth.uid() in (user_a, user_b));

drop policy if exists messages_participant_read on public.messages;
create policy messages_participant_read on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c
                  where c.id = messages.conversation_id and auth.uid() in (c.user_a, c.user_b)));

drop policy if exists bookings_participant_read on public.bookings;
create policy bookings_participant_read on public.bookings
  for select to authenticated using (auth.uid() in (customer_id, provider_id));

drop policy if exists booking_locations_participant_read on public.booking_locations;
create policy booking_locations_participant_read on public.booking_locations
  for select to authenticated
  using (exists (select 1 from public.bookings b
                  where b.id = booking_locations.booking_id and auth.uid() in (b.customer_id, b.provider_id)));


grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;


do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'messages', 'booking_locations'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
                when others then raise notice 'Realtime: skipped % (%)', t, sqlerrm;
      end;
    end loop;
  end if;
end $$;




do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('skilllink-public',   'skilllink-public',   true,  5242880, array['image/jpeg','image/png','image/webp','image/gif']),
      ('skilllink-evidence', 'skilllink-evidence', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;


notify pgrst, 'reload schema';





