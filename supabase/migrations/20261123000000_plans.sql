-- Plans (free / pro / max / ultra), 24 h usage windows, plan requests, profile photos and Ultra uploads.
-- Every rule is enforced in the database: users can never change their own plan.

-- ---------- plan + photo on profiles ----------
alter table public.profiles add column if not exists plan text not null default 'free' check (plan in ('free', 'pro', 'max', 'ultra'));
alter table public.profiles add column if not exists avatar_url text check (char_length(avatar_url) <= 500);

-- users may only edit cosmetic columns; plan changes go through admin_set_plan()
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_hue, settings, avatar_url) on public.profiles to authenticated;

create or replace function public.is_admin_uid(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = uid);
$$;
create or replace function public.can_custom_avatar(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin_uid(uid) or exists (select 1 from public.profiles where id = uid and plan in ('max', 'ultra'));
$$;
create or replace function public.can_upload(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin_uid(uid) or exists (select 1 from public.profiles where id = uid and plan = 'ultra');
$$;

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null and not public.can_custom_avatar(old.id) then
    raise exception 'Tu plan no permite foto de perfil' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- ---------- 24 h usage windows (listening time + skips) ----------
create table if not exists public.usage_window (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  listen_seconds int not null default 0,
  skips int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.usage_window enable row level security;
drop policy if exists usage_select_own on public.usage_window;
create policy usage_select_own on public.usage_window for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.plan_limits(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p
    when 'free' then '{"seconds": 18000, "skips": 5}'::jsonb
    when 'pro'  then '{"seconds": null, "skips": 100}'::jsonb
    else '{"seconds": null, "skips": null}'::jsonb end;
$$;

-- Adds listened seconds (max 120 per call) and/or one skip; resets the window 24 h after it started.
create or replace function public.track_usage(p_seconds int default 0, p_skip boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  pl text; adm boolean; lim jsonb; w public.usage_window; allowed boolean := true; secs int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select plan into pl from public.profiles where id = uid;
  adm := public.is_admin_uid(uid);
  lim := case when adm then '{"seconds": null, "skips": null}'::jsonb else public.plan_limits(coalesce(pl, 'free')) end;
  insert into public.usage_window (user_id) values (uid) on conflict (user_id) do nothing;
  select * into w from public.usage_window where user_id = uid for update;
  if now() - w.window_start >= interval '24 hours' then
    update public.usage_window set window_start = now(), listen_seconds = 0, skips = 0, updated_at = now() where user_id = uid returning * into w;
  end if;
  if p_skip then
    if (lim->>'skips') is not null and w.skips >= (lim->>'skips')::int then allowed := false;
    else update public.usage_window set skips = skips + 1, updated_at = now() where user_id = uid returning * into w; end if;
  end if;
  secs := greatest(0, least(coalesce(p_seconds, 0), 120));
  if secs > 0 then
    update public.usage_window set listen_seconds = listen_seconds + secs, updated_at = now() where user_id = uid returning * into w;
  end if;
  return jsonb_build_object('plan', case when adm then 'admin' else coalesce(pl, 'free') end, 'allowed', allowed,
    'listen_seconds', w.listen_seconds, 'skips', w.skips, 'window_start', w.window_start,
    'resets_at', w.window_start + interval '24 hours', 'limits', lim);
end $$;

-- ---------- plan requests (users ask, admin decides) ----------
create table if not exists public.plan_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro', 'max', 'ultra')),
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create unique index if not exists plan_requests_one_pending on public.plan_requests (user_id) where status = 'pending';
alter table public.plan_requests enable row level security;
drop policy if exists plan_requests_insert_own on public.plan_requests;
drop policy if exists plan_requests_select on public.plan_requests;
drop policy if exists plan_requests_delete_own on public.plan_requests;
create policy plan_requests_insert_own on public.plan_requests for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');
create policy plan_requests_select on public.plan_requests for select to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy plan_requests_delete_own on public.plan_requests for delete to authenticated using ((select auth.uid()) = user_id and status = 'pending');

-- ---------- admin: manage accounts ----------
create or replace function public.admin_set_plan(p_user uuid, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_plan not in ('free', 'pro', 'max', 'ultra') then raise exception 'invalid plan'; end if;
  update public.profiles set plan = p_plan where id = p_user;
  update public.plan_requests set status = case when plan = p_plan then 'approved' else 'rejected' end where user_id = p_user and status = 'pending';
end $$;

create or replace function public.admin_reject_request(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.plan_requests set status = 'rejected' where id = p_id and status = 'pending';
end $$;

drop function if exists public.admin_list_users(int, int);
create function public.admin_list_users(p_limit int default 200, p_offset int default 0)
returns table (id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean,
               plays bigint, is_admin boolean, plan text, avatar_url text, avatar_hue int, listen_seconds int, skips int, window_start timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           (select count(*) from public.plays pl where pl.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id),
           coalesce(p.plan, 'free'), p.avatar_url, coalesce(p.avatar_hue, 275),
           coalesce(w.listen_seconds, 0), coalesce(w.skips, 0), w.window_start
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.usage_window w on w.user_id = u.id
    order by u.created_at desc limit least(p_limit, 500) offset greatest(p_offset, 0);
end $$;

-- ---------- Ultra uploads ----------
create table if not exists public.user_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist text not null default '' check (char_length(artist) <= 120),
  path text not null unique check (char_length(path) <= 300),
  cover_url text check (char_length(cover_url) <= 500),
  duration real not null default 0,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists user_tracks_public_idx on public.user_tracks (is_public, created_at desc);
create index if not exists user_tracks_user_idx on public.user_tracks (user_id);
alter table public.user_tracks enable row level security;
drop policy if exists user_tracks_select on public.user_tracks;
drop policy if exists user_tracks_insert on public.user_tracks;
drop policy if exists user_tracks_update on public.user_tracks;
drop policy if exists user_tracks_delete on public.user_tracks;
create policy user_tracks_select on public.user_tracks for select to anon, authenticated using (is_public or (select auth.uid()) = user_id);
create policy user_tracks_insert on public.user_tracks for insert to authenticated with check ((select auth.uid()) = user_id and public.can_upload((select auth.uid())));
create policy user_tracks_update on public.user_tracks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and public.can_upload((select auth.uid())));
create policy user_tracks_delete on public.user_tracks for delete to authenticated using ((select auth.uid()) = user_id);

-- public uploads with the uploader's public card (name, plan, photo); never emails
create or replace function public.public_uploads(p_limit int default 40, p_query text default null)
returns table (id uuid, title text, artist text, path text, cover_url text, duration real, created_at timestamptz,
               uploader text, uploader_plan text, uploader_avatar text, uploader_hue int, uploader_admin boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.artist, t.path, t.cover_url, t.duration, t.created_at,
         coalesce(p.display_name, 'Artista'), coalesce(p.plan, 'free'), p.avatar_url, coalesce(p.avatar_hue, 275), public.is_admin_uid(t.user_id)
  from public.user_tracks t left join public.profiles p on p.id = t.user_id
  where t.is_public and (p_query is null or t.title ilike '%' || p_query || '%' or t.artist ilike '%' || p_query || '%')
  order by t.created_at desc limit least(greatest(p_limit, 1), 100);
$$;

-- ---------- storage: profile photos (public) and uploaded audio (private, signed URLs) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('user-audio', 'user-audio', false, 52428800, array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac', 'audio/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatars_select_own on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_custom_avatar((select auth.uid())));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_custom_avatar((select auth.uid())));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists audio_select on storage.objects;
drop policy if exists audio_insert on storage.objects;
drop policy if exists audio_delete on storage.objects;
create policy audio_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'user-audio' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or exists (select 1 from public.user_tracks t where t.is_public and (t.path = name or t.cover_url = name))));
create policy audio_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-audio' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_upload((select auth.uid())));
create policy audio_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- grants ----------
revoke execute on function public.track_usage(int, boolean) from public, anon;
revoke execute on function public.admin_set_plan(uuid, text) from public, anon;
revoke execute on function public.admin_reject_request(bigint) from public, anon;
revoke execute on function public.admin_list_users(int, int) from public, anon;
revoke execute on function public.guard_profile() from public, anon, authenticated;
grant execute on function public.track_usage(int, boolean) to authenticated;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;
grant execute on function public.admin_reject_request(bigint) to authenticated;
grant execute on function public.admin_list_users(int, int) to authenticated;
grant execute on function public.public_uploads(int, text) to anon, authenticated;
grant execute on function public.can_custom_avatar(uuid) to authenticated;
grant execute on function public.can_upload(uuid) to authenticated;

-- the administrator gets every feature
update public.profiles set plan = 'ultra' where id in (select user_id from public.admins);
