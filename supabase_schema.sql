-- ==========================================================
-- CERCLE — SCHEMA COMPLET (UUID, RLS strictes, helpers anti-récursion)
-- Idempotent & aligné avec l’app
-- ==========================================================

-- Extensions
create extension if not exists "pgcrypto";   -- gen_random_uuid(), gen_random_bytes()
create extension if not exists "pg_cron";    -- purge programmée (si supportée)

-- ==========================================================
-- Helpers utilitaires
-- ==========================================================
create or replace function public._drop_all_policies(p_table regclass)
returns void
language plpgsql
as $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = (select relname from pg_class where oid = p_table)
  loop
    execute format('drop policy if exists %I on %s', r.policyname, p_table);
  end loop;
end;
$$;

create or replace function public.get_app_base_url()
returns text
language sql stable
as $$
  select coalesce(current_setting('app.cercle_base_url', true), 'https://cercle.app');
$$;

create or replace function public.build_invite_url(p_token text)
returns text
language sql stable
as $$
  select public.get_app_base_url() || '/invite/' || p_token;
$$;

-- Helpers anti-récursion (security definer)
create or replace function public.is_owner_of_circle(p_circle uuid, p_user uuid)
returns boolean
language sql security definer
set search_path = public, auth
set row_security = off
stable
as $$
  select exists (select 1 from public.circles c where c.id=p_circle and c.owner_id=p_user);
$$;

create or replace function public.is_member_of_circle(p_circle uuid, p_user uuid)
returns boolean
language sql security definer
set search_path = public, auth
set row_security = off
stable
as $$
  select exists (select 1 from public.circle_members cm where cm.circle_id=p_circle and cm.user_id=p_user);
$$;

create or replace function public.is_admin_or_owner(p_circle uuid, p_user uuid)
returns boolean
language sql security definer
set search_path = public, auth
set row_security = off
stable
as $$
  select public.is_owner_of_circle(p_circle, p_user)
     or exists (
       select 1 from public.circle_members cm
       where cm.circle_id=p_circle and cm.user_id=p_user and cm.role in ('owner','admin')
     );
$$;

-- ==========================================================
-- 1) CIRCLES
-- ==========================================================
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists circles_owner_idx on public.circles(owner_id);
alter table public.circles enable row level security;

do $$ begin
  if to_regclass('public.circles') is not null then
    perform public._drop_all_policies('public.circles'::regclass);
  end if;
end $$;

create policy circles_select_owner_or_member on public.circles
for select using (
  owner_id = (select auth.uid())
  or public.is_member_of_circle(id, (select auth.uid()))
);

create policy circles_insert_owner on public.circles
for insert with check (owner_id = (select auth.uid()));

create policy circles_update_owner on public.circles
for update using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy circles_delete_owner on public.circles
for delete using (owner_id = (select auth.uid()));

-- ==========================================================
-- 2) PROFILES (SANS PII — nullifiées par trigger)
-- ==========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name  text,
  email text,
  phone text unique,
  bio   text,
  photo text,
  default_circle_id uuid references public.circles(id) on delete set null,
  notify_push boolean default false,
  expo_push_token text,
  created_at timestamptz default now()
);
create index if not exists profiles_default_circle_idx on public.profiles(default_circle_id);
alter table public.profiles enable row level security;

do $$ begin
  if to_regclass('public.profiles') is not null then
    perform public._drop_all_policies('public.profiles'::regclass);
  end if;
end $$;

create policy profiles_select_self on public.profiles
for select using ((select auth.uid()) = id);

create policy profiles_insert_self on public.profiles
for insert with check ((select auth.uid()) = id);

create policy profiles_update_self on public.profiles
for update using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_delete_self on public.profiles
for delete using ((select auth.uid()) = id);

create or replace function public.nullify_pii_profiles()
returns trigger language plpgsql as $$
begin
  new.name := null;
  new.email := null;
  new.phone := null;
  new.bio := null;
  new.photo := null;
  new.expo_push_token := null;
  new.notify_push := false;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_profiles_no_pii') then
    create trigger trg_profiles_no_pii
    before insert or update on public.profiles
    for each row execute function public.nullify_pii_profiles();
  end if;
end $$;

-- ==========================================================
-- 3) CIRCLE_MEMBERS
-- ==========================================================
create table if not exists public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  unique(circle_id, user_id)
);
create index if not exists circle_members_circle_idx on public.circle_members(circle_id);
create index if not exists circle_members_user_idx   on public.circle_members(user_id);
alter table public.circle_members enable row level security;

do $$ begin
  if to_regclass('public.circle_members') is not null then
    perform public._drop_all_policies('public.circle_members'::regclass);
  end if;
end $$;

create policy cm_select_ok on public.circle_members
for select using (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy cm_insert_admin_owner on public.circle_members
for insert with check ( public.is_admin_or_owner(circle_id, (select auth.uid())) );

create policy cm_update_admin_owner on public.circle_members
for update using ( public.is_admin_or_owner(circle_id, (select auth.uid())) )
with check ( public.is_admin_or_owner(circle_id, (select auth.uid())) );

create policy cm_delete_admin_owner on public.circle_members
for delete using ( public.is_admin_or_owner(circle_id, (select auth.uid())) );

create or replace function public.circle_owner_automember()
returns trigger language plpgsql as $$
begin
  insert into public.circle_members (circle_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (circle_id, user_id) do nothing;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_circle_owner_automember') then
    create trigger trg_circle_owner_automember
    after insert on public.circles
    for each row execute function public.circle_owner_automember();
  end if;
end $$;

-- ==========================================================
-- 4) ITEMS (colonnes UI)
-- ==========================================================
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  photo text,
  created_at timestamptz default now(),
  -- UI
  category text,
  owner_name text,
  price_cents integer,
  price_unit text check (price_unit in ('day','week','month')),
  price_per_day_cents integer,
  max_days integer
);
create index if not exists items_owner_idx  on public.items(owner_id);
create index if not exists items_circle_idx on public.items(circle_id);
alter table public.items enable row level security;

do $$ begin
  if to_regclass('public.items') is not null then
    perform public._drop_all_policies('public.items'::regclass);
  end if;
end $$;

create policy items_select_circle_members on public.items
for select using (
  owner_id = (select auth.uid())
  or public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy items_insert_member_owner on public.items
for insert with check (
  owner_id = (select auth.uid())
  and (
    public.is_member_of_circle(circle_id, (select auth.uid()))
    or public.is_owner_of_circle(circle_id, (select auth.uid()))
  )
);

create policy items_update_owner_only on public.items
for update using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy items_delete_owner_only on public.items
for delete using (owner_id = (select auth.uid()));

-- ==========================================================
-- 5) RESERVATIONS (avec cohérence cercle/item)
-- ==========================================================
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  item_title text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  borrower_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at   timestamptz not null,
  status text not null check (status in ('pending','accepted','refused','returned')) default 'pending',
  created_at timestamptz default now()
);
create index if not exists reservations_owner_idx     on public.reservations(owner_id);
create index if not exists reservations_borrower_idx  on public.reservations(borrower_id);
create index if not exists reservations_circle_idx    on public.reservations(circle_id);
create index if not exists reservations_time_idx      on public.reservations(start_at, end_at);
alter table public.reservations enable row level security;

do $$ begin
  if to_regclass('public.reservations') is not null then
    perform public._drop_all_policies('public.reservations'::regclass);
  end if;
end $$;

create policy res_select_in_my_circles on public.reservations
for select using (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy res_insert_parties_members on public.reservations
for insert with check (
  (owner_id = (select auth.uid()) or borrower_id = (select auth.uid()))
  and public.is_member_of_circle(circle_id, (select auth.uid()))
);

create policy res_update_parties_members on public.reservations
for update using (
  (owner_id = (select auth.uid()) or borrower_id = (select auth.uid()))
  and public.is_member_of_circle(circle_id, (select auth.uid()))
)
with check (
  (owner_id = (select auth.uid()) or borrower_id = (select auth.uid()))
  and public.is_member_of_circle(circle_id, (select auth.uid()))
);

create policy res_delete_owner on public.reservations
for delete using (owner_id = (select auth.uid()));

create or replace function public.reservations_check_circle_consistency()
returns trigger language plpgsql as $$
declare v_item_circle uuid;
begin
  if new.item_id is null then return new; end if;

  select circle_id into v_item_circle from public.items where id=new.item_id;
  if v_item_circle is null then
    raise exception 'Item not found for reservation';
  end if;
  if new.circle_id is distinct from v_item_circle then
    raise exception 'Reservation circle_id (%) does not match item circle_id (%)',
      new.circle_id, v_item_circle;
  end if;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_reservations_circle_consistency') then
    create trigger trg_reservations_circle_consistency
    before insert or update on public.reservations
    for each row execute function public.reservations_check_circle_consistency();
  end if;
end $$;

-- ==========================================================
-- 6) INVITES (token + PII nullifiées)
-- ==========================================================
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  phone text,
  name  text,
  token text unique,
  expires_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);
create index if not exists invites_circle_id_idx on public.invites(circle_id);
alter table public.invites enable row level security;

do $$ begin
  if to_regclass('public.invites') is not null then
    perform public._drop_all_policies('public.invites'::regclass);
  end if;
end $$;

create policy invites_select_members on public.invites
for select using (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy invites_insert_members on public.invites
for insert with check (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy invites_update_admin_owner on public.invites
for update using ( public.is_admin_or_owner(circle_id, (select auth.uid())) )
with check ( public.is_admin_or_owner(circle_id, (select auth.uid())) );

create or replace function public.invites_generate_token()
returns trigger language plpgsql as $$
declare v_raw bytea; v_b64 text;
begin
  if new.token is null then
    v_raw := gen_random_bytes(32); -- 256 bits
    v_b64 := replace(replace(encode(v_raw,'base64'),'+','-'),'/','_');
    v_b64 := replace(v_b64,'=','');
    new.token := v_b64;
  end if;
  if new.expires_at is null then
    new.expires_at := now() + interval '14 days';
  end if;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_invites_token') then
    create trigger trg_invites_token before insert on public.invites
    for each row execute function public.invites_generate_token();
  end if;
end $$;

create or replace function public.nullify_pii_invites()
returns trigger language plpgsql as $$
begin
  new.phone := null;
  new.name := null;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_invites_no_pii') then
    create trigger trg_invites_no_pii
    before insert or update on public.invites
    for each row execute function public.nullify_pii_invites();
  end if;
end $$;

create or replace function public.accept_invite(p_token text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare v_inv invites%rowtype;
begin
  select * into v_inv
  from public.invites
  where token=p_token
    and status='pending'
    and (expires_at is null or expires_at>now())
  for update;

  if not found then raise exception 'Invitation invalide ou expirée'; end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_inv.circle_id, (select auth.uid()), 'member')
  on conflict (circle_id,user_id) do nothing;

  update public.invites
     set status='accepted', accepted_by=(select auth.uid())
   where id=v_inv.id;
end$$;

-- ==========================================================
-- 7) CALLS + RESPONSES
-- ==========================================================
create table if not exists public.calls (
  id bigserial primary key,
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  needed_at timestamptz null,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.call_responses (
  id bigserial primary key,
  call_id bigint not null references public.calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('offer','decline','fulfilled')),
  note text null,
  created_at timestamptz not null default now(),
  unique (call_id, user_id)
);

alter table public.calls          enable row level security;
alter table public.call_responses enable row level security;

do $$ begin
  if to_regclass('public.calls') is not null then
    perform public._drop_all_policies('public.calls'::regclass);
  end if;
  if to_regclass('public.call_responses') is not null then
    perform public._drop_all_policies('public.call_responses'::regclass);
  end if;
end $$;

create policy calls_read_circle_members on public.calls
for select using (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy calls_insert_circle_members on public.calls
for insert with check (
  (public.is_member_of_circle(circle_id, (select auth.uid()))
   or public.is_owner_of_circle(circle_id, (select auth.uid())))
  and author_id = (select auth.uid())
);

create policy call_responses_read_circle_members on public.call_responses
for select using (
  call_id in (
    select id from public.calls
    where public.is_member_of_circle(circle_id, (select auth.uid()))
       or public.is_owner_of_circle(circle_id, (select auth.uid()))
  )
);

create policy call_responses_insert_circle_members on public.call_responses
for insert with check (
  call_id in (
    select id from public.calls
    where public.is_member_of_circle(circle_id, (select auth.uid()))
       or public.is_owner_of_circle(circle_id, (select auth.uid()))
  )
  and user_id = (select auth.uid())
);

create policy call_responses_update_self on public.call_responses
for update using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ==========================================================
-- 8) NOTIFICATIONS (in-app)
-- ==========================================================
create table if not exists public.notifications (
  id bigserial primary key,
  circle_id uuid not null references public.circles(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists notifications_circle_idx on public.notifications(circle_id);
alter table public.notifications enable row level security;

do $$ begin
  if to_regclass('public.notifications') is not null then
    perform public._drop_all_policies('public.notifications'::regclass);
  end if;
end $$;

create policy notif_read_members on public.notifications
for select using (
  public.is_member_of_circle(circle_id, (select auth.uid()))
  or public.is_owner_of_circle(circle_id, (select auth.uid()))
);

create policy notif_insert_members on public.notifications
for insert with check (
  (public.is_member_of_circle(circle_id, (select auth.uid()))
   or public.is_owner_of_circle(circle_id, (select auth.uid())))
  and actor_id = (select auth.uid())
);

create or replace function public.enqueue_notification_on_call()
returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(circle_id, actor_id, type, payload)
    values (new.circle_id, new.author_id, 'call_created', jsonb_build_object('call_id', new.id));
  end if;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_calls_notify') then
    create trigger trg_calls_notify
    after insert on public.calls
    for each row execute function public.enqueue_notification_on_call();
  end if;
end $$;

create or replace function public.enqueue_notification_on_reservation()
returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(circle_id, actor_id, type, payload)
    values (new.circle_id, new.borrower_id, 'reservation_pending',
            jsonb_build_object('reservation_id', new.id, 'item_title', coalesce(new.item_title,'Objet')));
  end if;
  return new;
end$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_reservations_notify') then
    create trigger trg_reservations_notify
    after insert on public.reservations
    for each row execute function public.enqueue_notification_on_reservation();
  end if;
end $$;

-- ==========================================================
-- 9) CONTACTS (conservé pour l’app)
-- ==========================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  created_at timestamptz default now()
);
alter table public.contacts enable row level security;

do $$ begin
  if to_regclass('public.contacts') is not null then
    perform public._drop_all_policies('public.contacts'::regclass);
  end if;
end $$;

create policy "Contacts by owner" on public.contacts
for all using ( owner_id = (select auth.uid()) )
with check ( owner_id = (select auth.uid()) );

-- ==========================================================
-- 10) RPC côté app
-- ==========================================================
create or replace function public.create_invite(p_circle_id uuid, p_phone text default null, p_name text default null)
returns text
language plpgsql security definer
set search_path = public, auth
as $$
declare v_inv public.invites%rowtype;
begin
  if not (
    public.is_owner_of_circle(p_circle_id, (select auth.uid()))
    or public.is_member_of_circle(p_circle_id, (select auth.uid()))
  ) then
    raise exception 'Accès refusé';
  end if;

  insert into public.invites (circle_id, phone, name)
  values (p_circle_id, nullif(trim(p_phone),''), nullif(trim(p_name),''))
  returning * into v_inv;

  return public.build_invite_url(v_inv.token);
end$$;

create or replace function public.create_circle(p_name text)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Name required'; end if;

  insert into public.circles (name, owner_id)
  values (trim(p_name), (select auth.uid()))
  returning id into v_id;

  return v_id;
end$$;

create or replace function public.circle_members_list(p_circle_id uuid)
returns table(member_id uuid, user_id uuid, role text, public_name text)
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_owner_of_circle(p_circle_id, (select auth.uid()))
    or public.is_member_of_circle(p_circle_id, (select auth.uid()))
  ) then
    raise exception 'Accès refusé';
  end if;

  return query
  select cm.id, cm.user_id, cm.role, 'Membre'::text
  from public.circle_members cm
  where cm.circle_id = p_circle_id
  order by cm.created_at asc;
end$$;

-- ==========================================================
-- 11) VUES pratiques (compat avec ton ancien starter)
-- ==========================================================
create or replace view public.reservations_view as
select r.*, i.title as item_title, p.name as owner_name
from public.reservations r
left join public.items i on r.item_id = i.id
left join public.profiles p on r.owner_id = p.id;

create or replace view public.circle_members_view as
select cm.id as member_id, c.owner_id, cm.*, p.name, p.email
from public.circle_members cm
left join public.circles c on cm.circle_id = c.id
left join public.profiles p on cm.user_id = p.id;

-- Index utiles pour les vues
create index if not exists calls_circle_idx           on public.calls(circle_id);
create index if not exists call_responses_call_idx    on public.call_responses(call_id);

-- ==========================================================
-- 12) Realtime (publication) — idempotent
-- ==========================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente. Activez Realtime dans le dashboard.';
  else
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='calls'
    ) then
      execute 'alter publication supabase_realtime add table public.calls';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='call_responses'
    ) then
      execute 'alter publication supabase_realtime add table public.call_responses';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end$$;

alter table public.calls          replica identity full;
alter table public.call_responses replica identity full;
alter table public.notifications  replica identity full;

-- ==========================================================
-- 13) GRANTS — RPC accessibles côté client authentifié
-- ==========================================================
grant usage on schema public to authenticated, anon;

grant execute on function public.create_circle(text)             to authenticated;
grant execute on function public.create_invite(uuid, text, text) to authenticated;
grant execute on function public.circle_members_list(uuid)       to authenticated;
grant execute on function public.get_app_base_url()              to authenticated, anon;
grant execute on function public.build_invite_url(text)          to authenticated, anon;
