-- Atmos X: Supabase schema
-- Run in the Supabase SQL editor, or `npx supabase db push`.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Climate friend',
  avatar_emoji text not null default '🌱',
  home_lat double precision,
  home_lng double precision,
  goal_trees integer not null default 20 check (goal_trees between 1 and 1000000),
  goal_points integer not null default 1000 check (goal_points between 1 and 100000000),
  farmer_mode boolean not null default false,
  crop text,
  crop_stage text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Create a profile automatically on sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- action types
create table if not exists public.action_types (
  id text primary key,
  title text not null,
  unit text not null,
  points integer not null,
  cooling_per_unit numeric not null default 0,
  is_tree boolean not null default false
);

alter table public.action_types enable row level security;
drop policy if exists "action types are public" on public.action_types;
create policy "action types are public" on public.action_types for select using (true);

insert into public.action_types (id, title, unit, points, cooling_per_unit, is_tree) values
  ('plant_tree', 'Plant a tree', 'tree', 50, 0.0006, true),
  ('plant_shrubs', 'Plant shrubs / pots', '10 plants', 12, 0.0001, false),
  ('rooftop_garden', 'Rooftop garden', '10 m²', 40, 0.0003, false),
  ('cool_roof', 'Cool / white roof', '10 m²', 30, 0.0004, false),
  ('green_wall', 'Green wall / creeper', '5 m²', 20, 0.00015, false),
  ('shade_structure', 'Shade canopy', 'structure', 25, 0.0002, false),
  ('water_tree', 'Water & care for trees', 'session', 5, 0, false),
  ('awareness', 'Run an awareness event', 'event', 30, 0, false)
on conflict (id) do update set
  title = excluded.title, unit = excluded.unit, points = excluded.points,
  cooling_per_unit = excluded.cooling_per_unit, is_tree = excluded.is_tree;

-- --------------------------------------------------------------------- clans
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'community' check (kind in ('community', 'organization', 'school', 'farm')),
  emoji text not null default '🌳',
  owner_id uuid not null references public.profiles (id) on delete cascade,
  goal_trees integer not null default 500 check (goal_trees between 1 and 10000000),
  goal_cooling_c numeric not null default 1.0 check (goal_cooling_c between 0.1 and 10),
  zone_label text,
  center_lat double precision,
  center_lng double precision,
  is_public boolean not null default true,
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  clan_id uuid not null references public.clans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);

create index if not exists clan_members_user_idx on public.clan_members (user_id);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

-- membership helper (security definer avoids recursive RLS)
create or replace function public.is_clan_member(p_clan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clan_members m where m.clan_id = p_clan and m.user_id = (select auth.uid())
  );
$$;

drop policy if exists "public clans or my clans are visible" on public.clans;
create policy "public clans or my clans are visible" on public.clans
  for select to authenticated using (is_public or owner_id = (select auth.uid()) or public.is_clan_member(id));

drop policy if exists "signed-in users create clans" on public.clans;
create policy "signed-in users create clans" on public.clans
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "owners update clans" on public.clans;
create policy "owners update clans" on public.clans
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "owners delete clans" on public.clans;
create policy "owners delete clans" on public.clans
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "members visible to clan members or public clans" on public.clan_members;
create policy "members visible to clan members or public clans" on public.clan_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.is_clan_member(clan_id)
    or exists (select 1 from public.clans c where c.id = clan_id and c.is_public)
  );

drop policy if exists "join public clans" on public.clan_members;
create policy "join public clans" on public.clan_members
  for insert to authenticated with check (
    user_id = (select auth.uid()) and role = 'member'
    and exists (select 1 from public.clans c where c.id = clan_id and c.is_public)
  );

drop policy if exists "leave clans" on public.clan_members;
create policy "leave clans" on public.clan_members
  for delete to authenticated using (user_id = (select auth.uid()) and role <> 'owner');

-- Owner becomes a member automatically.
create or replace function public.handle_new_clan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.clan_members (clan_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_clan_created on public.clans;
create trigger on_clan_created after insert on public.clans
  for each row execute function public.handle_new_clan();

-- Join any clan (public or private) with its invite code.
create or replace function public.join_clan_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_clan uuid;
begin
  if (select auth.uid()) is null then raise exception 'Not signed in'; end if;
  select id into v_clan from public.clans where invite_code = upper(trim(p_code));
  if v_clan is null then raise exception 'Invalid invite code'; end if;
  insert into public.clan_members (clan_id, user_id, role) values (v_clan, (select auth.uid()), 'member')
  on conflict do nothing;
  return v_clan;
end;
$$;

-- --------------------------------------------------------------- action logs
create table if not exists public.action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  clan_id uuid references public.clans (id) on delete set null,
  action_type text not null references public.action_types (id),
  quantity integer not null default 1 check (quantity between 1 and 10000),
  points integer not null default 0,
  cooling_c numeric not null default 0,
  trees integer not null default 0,
  lat double precision,
  lng double precision,
  zone_label text,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists action_logs_user_idx on public.action_logs (user_id, created_at desc);
create index if not exists action_logs_clan_idx on public.action_logs (clan_id, created_at desc);
create index if not exists action_logs_created_idx on public.action_logs (created_at desc);

alter table public.action_logs enable row level security;

drop policy if exists "users read own logs and clan logs" on public.action_logs;
create policy "users read own logs and clan logs" on public.action_logs
  for select to authenticated using (
    user_id = (select auth.uid()) or (clan_id is not null and public.is_clan_member(clan_id))
  );

drop policy if exists "users insert own logs" on public.action_logs;
create policy "users insert own logs" on public.action_logs
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (clan_id is null or public.is_clan_member(clan_id))
  );

drop policy if exists "users delete own logs" on public.action_logs;
create policy "users delete own logs" on public.action_logs
  for delete to authenticated using (user_id = (select auth.uid()));

-- Points / cooling are computed on the server so the leaderboard can't be gamed.
create or replace function public.score_action_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.action_types;
begin
  select * into t from public.action_types where id = new.action_type;
  if t.id is null then raise exception 'Unknown action type'; end if;
  new.user_id := (select auth.uid());
  new.points := t.points * new.quantity;
  new.cooling_c := t.cooling_per_unit * new.quantity;
  new.trees := case when t.is_tree then new.quantity else 0 end;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists on_action_log_insert on public.action_logs;
create trigger on_action_log_insert before insert on public.action_logs
  for each row execute function public.score_action_log();

-- -------------------------------------------------------------- leaderboards
create or replace function public.period_start(p_period text)
returns timestamptz language sql stable as $$
  select case p_period
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else '-infinity'::timestamptz end;
$$;

create or replace function public.get_user_leaderboard(p_period text default 'all', p_clan uuid default null)
returns table (user_id uuid, display_name text, avatar_emoji text, points bigint, trees bigint, actions bigint, rank bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_emoji,
         coalesce(sum(l.points), 0)::bigint as points,
         coalesce(sum(l.trees), 0)::bigint as trees,
         count(l.id)::bigint as actions,
         rank() over (order by coalesce(sum(l.points), 0) desc)
  from public.action_logs l
  join public.profiles p on p.id = l.user_id
  where l.created_at >= public.period_start(p_period)
    and (p_clan is null or l.clan_id = p_clan)
  group by p.id
  order by points desc
  limit 100;
$$;

create or replace function public.get_clan_leaderboard(p_period text default 'all')
returns table (clan_id uuid, name text, emoji text, kind text, members bigint, points bigint, trees bigint, cooling_c numeric, goal_trees integer, rank bigint)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select l.clan_id, sum(l.points) as points, sum(l.trees) as trees, sum(l.cooling_c) as cooling
    from public.action_logs l
    where l.clan_id is not null and l.created_at >= public.period_start(p_period)
    group by l.clan_id
  )
  select c.id, c.name, c.emoji, c.kind,
         (select count(*) from public.clan_members m where m.clan_id = c.id)::bigint,
         coalesce(a.points, 0)::bigint, coalesce(a.trees, 0)::bigint, coalesce(a.cooling, 0),
         c.goal_trees,
         rank() over (order by coalesce(a.points, 0) desc)
  from public.clans c
  left join agg a on a.clan_id = c.id
  where c.is_public or public.is_clan_member(c.id)
  order by coalesce(a.points, 0) desc, c.created_at
  limit 100;
$$;

create or replace function public.get_my_stats()
returns table (points bigint, trees bigint, actions bigint, cooling_c numeric, clans bigint, global_rank bigint)
language sql stable security definer set search_path = '' as $$
  with me as (
    select coalesce(sum(points), 0)::bigint points, coalesce(sum(trees), 0)::bigint trees,
           count(*)::bigint actions, coalesce(sum(cooling_c), 0) cooling
    from public.action_logs where user_id = (select auth.uid())
  ), totals as (
    select user_id, sum(points) pts from public.action_logs group by user_id
  )
  select me.points, me.trees, me.actions, me.cooling,
         (select count(*) from public.clan_members where user_id = (select auth.uid()))::bigint,
         (select count(*) + 1 from totals where pts > me.points)::bigint
  from me;
$$;

-- Clan stats (members can always see; public clans visible to all)
create or replace function public.get_clan_stats(p_clan uuid)
returns table (points bigint, trees bigint, actions bigint, cooling_c numeric, members bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.points), 0)::bigint, coalesce(sum(l.trees), 0)::bigint, count(l.id)::bigint,
         coalesce(sum(l.cooling_c), 0),
         (select count(*) from public.clan_members m where m.clan_id = p_clan)::bigint
  from public.action_logs l
  where l.clan_id = p_clan
    and exists (select 1 from public.clans c where c.id = p_clan and (c.is_public or public.is_clan_member(c.id)));
$$;

-- ------------------------------------------------------------------- grants
grant usage on schema public to anon, authenticated;
grant select on public.action_types to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.clans to authenticated;
grant select, insert, delete on public.clan_members to authenticated;
grant select, insert, delete on public.action_logs to authenticated;
grant execute on function public.join_clan_by_code(text) to authenticated;
grant execute on function public.get_user_leaderboard(text, uuid) to authenticated;
grant execute on function public.get_clan_leaderboard(text) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.get_clan_stats(uuid) to authenticated;
grant execute on function public.is_clan_member(uuid) to authenticated;
