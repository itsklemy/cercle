-- Run in Supabase SQL editor
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text,
  phone text,
  bio text,
  photo text,
  created_at timestamp with time zone default now()
);

create table if not exists public.circles (
  id bigint generated always as identity primary key,
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

create table if not exists public.circle_members (
  id bigint generated always as identity primary key,
  circle_id bigint references public.circles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member',
  created_at timestamp with time zone default now()
);

create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  created_at timestamp with time zone default now()
);

create table if not exists public.items (
  id bigint generated always as identity primary key,
  circle_id bigint references public.circles(id) on delete set null,
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  subcategory text,
  price_per_day numeric,
  value numeric,
  created_at timestamp with time zone default now()
);

create table if not exists public.reservations (
  id bigint generated always as identity primary key,
  circle_id bigint references public.circles(id) on delete set null,
  item_id bigint references public.items(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  borrower_id uuid references auth.users(id) on delete cascade,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status text check (status in ('pending','accepted','refused','returned')) default 'pending',
  note text,
  price_per_day numeric,
  created_at timestamp with time zone default now()
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  body text,
  data jsonb,
  created_at timestamp with time zone default now()
);

-- Convenience views
create or replace view reservations_view as
select r.*, i.title as item_title, p.name as owner_name
from reservations r
left join items i on r.item_id = i.id
left join profiles p on r.owner_id = p.id;

create or replace view circle_members_view as
select cm.id as member_id, c.owner_id, cm.*, p.name, p.email
from circle_members cm
left join circles c on cm.circle_id = c.id
left join profiles p on cm.user_id = p.id;

-- RLS
alter table profiles enable row level security;
alter table circles enable row level security;
alter table circle_members enable row level security;
alter table items enable row level security;
alter table reservations enable row level security;
alter table notifications enable row level security;
alter table contacts enable row level security;

-- Policies (basic, adjust as needed)
create policy "Profiles are readable by owner" on profiles for select using ( auth.uid() = id );
create policy "Profiles upsert by owner" on profiles for insert with check ( auth.uid() = id );
create policy "Profiles update by owner" on profiles for update using ( auth.uid() = id );

create policy "Circles owner can manage" on circles for all using ( auth.uid() = owner_id );

create policy "Circle members visible to circle owner" on circle_members for select using (
  exists(select 1 from circles c where c.id = circle_members.circle_id and c.owner_id = auth.uid())
);
create policy "Circle owner can manage members" on circle_members for all using (
  exists(select 1 from circles c where c.id = circle_members.circle_id and c.owner_id = auth.uid())
);

create policy "Items readable by owner or circle members" on items for select using (
  owner_id = auth.uid() or circle_id is null
);
create policy "Items crud by owner" on items for all using ( owner_id = auth.uid() );

create policy "Reservations visible to parties" on reservations for select using (
  owner_id = auth.uid() or borrower_id = auth.uid()
);
create policy "Reservations insert by borrower" on reservations for insert with check ( borrower_id = auth.uid() );
create policy "Reservations update by parties" on reservations for update using ( owner_id = auth.uid() or borrower_id = auth.uid() );

create policy "Notify read by user" on notifications for select using ( user_id = auth.uid() );
create policy "Notify insert by any" on notifications for insert with check ( true );

create policy "Contacts by owner" on contacts for all using ( owner_id = auth.uid() );
