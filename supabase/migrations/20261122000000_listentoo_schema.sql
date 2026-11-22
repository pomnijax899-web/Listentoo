-- Listentoo schema: profiles, library, playlists, play history, shared YouTube match cache,
-- public app config, server-only secrets and admin helpers. Every table has RLS enabled.

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  avatar_hue int not null default 275 check (avatar_hue between 0 and 360),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_hue)
  values (new.id,
          left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)), 60),
          floor(random() * 360)::int);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- admins (only writable with the service role / SQL) ----------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy admins_select_self on public.admins for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- ---------- library (likes, saved albums / playlists, followed artists) ----------
create table public.library_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('liked', 'album', 'artist', 'dzplaylist')),
  item_id text not null check (char_length(item_id) between 1 and 100),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 6000),
  added_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);
alter table public.library_items enable row level security;
create policy library_select_own on public.library_items for select to authenticated using ((select auth.uid()) = user_id);
create policy library_insert_own on public.library_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy library_update_own on public.library_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy library_delete_own on public.library_items for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- playlists ----------
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  tracks jsonb not null default '[]'::jsonb check (jsonb_typeof(tracks) = 'array' and jsonb_array_length(tracks) <= 2000),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_user_idx on public.playlists (user_id);
alter table public.playlists enable row level security;
create policy playlists_select on public.playlists for select to anon, authenticated using (is_public or (select auth.uid()) = user_id);
create policy playlists_insert_own on public.playlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy playlists_update_own on public.playlists for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy playlists_delete_own on public.playlists for delete to authenticated using ((select auth.uid()) = user_id);
create trigger playlists_touch before update on public.playlists for each row execute function public.touch_updated_at();

-- ---------- play history ----------
create table public.plays (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id text not null check (char_length(track_id) <= 100),
  title text check (char_length(title) <= 300),
  artist text check (char_length(artist) <= 300),
  cover text check (char_length(cover) <= 500),
  played_at timestamptz not null default now()
);
create index plays_user_time_idx on public.plays (user_id, played_at desc);
create index plays_time_idx on public.plays (played_at desc);
alter table public.plays enable row level security;
create policy plays_insert_own on public.plays for insert to authenticated with check ((select auth.uid()) = user_id);
create policy plays_select_own on public.plays for select to authenticated using ((select auth.uid()) = user_id);
create policy plays_delete_own on public.plays for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- shared track -> YouTube video cache (written only by the edge function) ----------
create table public.yt_matches (
  track_id text primary key check (char_length(track_id) <= 100),
  video_id text not null check (char_length(video_id) <= 20),
  query text,
  created_at timestamptz not null default now()
);
alter table public.yt_matches enable row level security;
create policy yt_matches_read on public.yt_matches for select to anon, authenticated using (true);

-- per-user daily lookup counter for quota protection (service role only)
create table public.resolve_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.resolve_usage enable row level security;

-- ---------- public app config (announcement, featured) ----------
create table public.app_config (
  key text primary key check (char_length(key) <= 50),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
create policy app_config_admin_insert on public.app_config for insert to authenticated with check ((select public.is_admin()));
create policy app_config_admin_update on public.app_config for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy app_config_admin_delete on public.app_config for delete to authenticated using ((select public.is_admin()));
create trigger app_config_touch before update on public.app_config for each row execute function public.touch_updated_at();

-- ---------- server-only secrets: RLS on, no policies => invisible to every client ----------
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- ---------- admin RPCs ----------
create or replace function public.admin_set_secret(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key not in ('youtube_api_key') then raise exception 'invalid key'; end if;
  if coalesce(trim(p_value), '') = '' then
    delete from public.app_secrets where key = p_key;
  else
    insert into public.app_secrets (key, value, updated_at) values (p_key, trim(p_value), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'plays', (select count(*) from public.plays),
    'plays_24h', (select count(*) from public.plays where played_at > now() - interval '24 hours'),
    'active_24h', (select count(distinct user_id) from public.plays where played_at > now() - interval '24 hours'),
    'playlists', (select count(*) from public.playlists),
    'matches', (select count(*) from public.yt_matches),
    'lookups_today', (select coalesce(sum(n), 0) from public.resolve_usage where day = current_date),
    'youtube_configured', exists (select 1 from public.app_secrets where key = 'youtube_api_key'),
    'top_tracks', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select track_id, title, artist, cover, count(*) as n from public.plays
        where played_at > now() - interval '30 days' group by 1, 2, 3, 4 order by n desc limit 10) t),
    'daily', (select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) from (
        select date_trunc('day', played_at)::date as day, count(*) as n from public.plays
        where played_at > now() - interval '14 days' group by 1) d)
  );
end $$;

create or replace function public.admin_list_users(p_limit int default 200, p_offset int default 0)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, plays bigint, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           (select count(*) from public.plays pl where pl.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc limit least(p_limit, 500) offset greatest(p_offset, 0);
end $$;

-- users can delete their own account (cascades to all their data)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = (select auth.uid());
end $$;

revoke execute on function public.admin_set_secret(text, text) from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_list_users(int, int) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.admin_set_secret(text, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_users(int, int) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- realtime for cross-device sync ----------
alter publication supabase_realtime add table public.library_items, public.playlists, public.app_config;
