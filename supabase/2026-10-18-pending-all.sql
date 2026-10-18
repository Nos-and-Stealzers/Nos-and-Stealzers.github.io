-- =====================================================================
-- 2026-10-18-pending-all.sql  -  every Arcade Campus SQL update that the
-- live database is still missing, in the order they have to run.
--
-- Checked against production on 2026-10-18: the 2026-10-14 updates
-- (replace account, admin replace email, account delete fix, bigger game
-- saves) are already installed. Still missing:
--   1. dev-role-and-perms.sql  (dev rank, rank fixes, warn/kick/mute,
--      site switches: maintenance, close sign-ups, force reload;
--      site_flags table; my_rank/is_dev/staff_target)
--   2. admin-accounts.sql      (admin Users tab lists every account,
--      admin "Create an account", backfills missing profiles)
--
-- Safe: installs/replaces functions, policies and one new table
-- (site_flags). It deletes no account, save, message or row. The only
-- row writes are the profile backfill for logins that have no profile.
-- Safe to run more than once. Runs as one transaction: if anything fails,
-- nothing changes.
-- =====================================================================

begin;

-- #################### 1. dev-role-and-perms.sql ####################
-- #####################################################################
-- ## dev-role-and-perms.sql  -  Dev rank, permission fixes, new staff tools
-- #####################################################################
--
-- Ranks, highest first:   owner (4) > dev (3) > admin (2) > mod (1) > user
--
--   mod    reports, support, feedback, live, audit, staff notes,
--          warn, mute (up to 1 day), sign someone out, reset an
--          inappropriate profile, hide someone's last 24h of messages
--   admin  everything a mod has, plus suspend, ban, passwords, Campus+,
--          ranks up to mod, deletions, announcements, sign-in log,
--          mutes of any length, message purges of any length
--   dev    everything an admin has, plus ranks up to admin (so devs manage
--          admins), the game catalogue and workbench, and site switches
--          (maintenance mode, closing sign-ups, forcing every open tab to
--          reload)
--   owner  everything; the only rank that can make a dev
--
-- Fixes in here:
--   * An admin could UPDATE profiles.role directly through the REST API
--     (the update policy allows admins, and the guard only checked
--     is_admin), skipping every rank rule in admin_set_user - including
--     setting someone, or themselves, to 'owner'. Rank and state now only
--     change through the staff RPCs.
--   * Editing another person's profile row now requires outranking them.
--   * Mods could ban (the RPC checked rank 1; the console said admin+).
--   * Any mod could grant Campus+ to anyone, including people above them.
--   * Mods could read the sign-in log; it is admin+ now.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- ranks
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user','mod','admin','dev','owner'));

create or replace function public.rank_of(role text)
returns int language sql immutable as $$
  select case role when 'owner' then 4 when 'dev' then 3 when 'admin' then 2 when 'mod' then 1 else 0 end;
$$;

create or replace function public.my_rank()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select public.rank_of(role) from public.profiles where id = auth.uid()), 0);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() >= 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() >= 2;
$$;

create or replace function public.is_dev()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() >= 3;
$$;

-- Marks the current transaction as a staff RPC, so the profile guard lets
-- a rank/state change through. Only the security-definer RPCs below call it.
create or replace function public.staff_action_begin()
returns void language sql security definer set search_path = public as $$
  select set_config('app.staff_action', 'on', true);
$$;
revoke all on function public.staff_action_begin() from public, anon, authenticated;

-- ------------------------------------------------------- profile guards
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  via_rpc boolean := coalesce(current_setting('app.staff_action', true), '') = 'on';
  from_dashboard boolean := auth.uid() is null;
begin
  -- Someone else's row: only staff who outrank them, and never the owner's.
  if not from_dashboard and auth.uid() <> old.id then
    if old.role = 'owner' and not via_rpc then
      raise exception 'The owner''s profile can''t be edited by anyone else.';
    end if;
    if public.my_rank() <= public.rank_of(old.role) then
      raise exception 'You can only edit accounts below your own rank.';
    end if;
  end if;

  if old.role = 'owner' then
    new.role  := old.role;
    new.state := old.state;
  elsif not via_rpc then
    -- Direct UPDATEs never change rank or state, from the API or the
    -- dashboard (as before). The staff RPCs are the only way.
    new.role  := old.role;
    new.state := old.state;
  end if;
  new.id         := old.id;
  new.username   := old.username;
  new.created_at := old.created_at;
  return new;
end;
$$;

create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.rank_of(old.role) >= 2 and public.rank_of(new.role) < 2 then
    if (select count(*) from public.profiles where public.rank_of(role) >= 2) <= 1 then
      raise exception 'That is the last administrator.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.on_profile_moderated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role then
    perform public.notify(new.id, 'role', auth.uid(),
      case new.role when 'user' then 'Your staff access was removed'
                    when 'dev' then 'You were made a developer'
                    when 'admin' then 'You were made an administrator'
                    when 'owner' then 'You are the owner'
                    else 'You were made a moderator' end,
      case when new.role = 'user' then '' else 'admin.html' end);
  end if;
  if new.state <> old.state then
    perform public.notify(new.id, 'state', auth.uid(),
      case when new.state = 'suspended' then 'Your account was suspended'
           else 'Your account was reinstated' end, '');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------- shared rank check
create or replace function public.staff_target(target uuid, need int, verb text default 'manage')
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  me public.profiles%rowtype;
  who public.profiles%rowtype;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.rank_of(me.role) < need then
    raise exception 'You do not have access to that.';
  end if;
  select * into who from public.profiles where id = target;
  if who.id is null then raise exception 'No such user.'; end if;
  if who.id = me.id then raise exception 'You can''t % your own account here.', verb; end if;
  if who.role = 'owner' then raise exception 'The owner can''t be changed by anyone.'; end if;
  if public.rank_of(me.role) <= public.rank_of(who.role) then
    raise exception 'You can only manage accounts below your own rank.';
  end if;
  return who;
end;
$$;
revoke all on function public.staff_target(uuid, int, text) from public, anon, authenticated;

-- ------------------------------------------------------- rank and state
create or replace function public.admin_set_user(
  target uuid, next_role text default null, next_state text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles%rowtype;
  who public.profiles%rowtype;
  changes text[] := '{}';
begin
  select * into me from public.profiles where id = auth.uid();
  who := public.staff_target(target, 2, 'change');

  if next_role is not null then
    if next_role not in ('user','mod','admin','dev') then
      raise exception 'Owner is set by the server, not granted here.';
    end if;
    if public.rank_of(next_role) >= public.rank_of(me.role) then
      raise exception 'You can only grant ranks below your own.';
    end if;
    if next_role <> who.role then
      perform public.staff_action_begin();
      update public.profiles set role = next_role where id = target;
      changes := changes || ('role=' || next_role);
    end if;
  end if;

  if next_state is not null then
    if next_state not in ('active','suspended') then raise exception 'Unknown state.'; end if;
    if next_state <> who.state then
      perform public.staff_action_begin();
      update public.profiles set state = next_state where id = target;
      changes := changes || ('state=' || next_state);
    end if;
  end if;

  if array_length(changes, 1) is null then raise exception 'Nothing to change.'; end if;
  perform public.log_audit('user-update', who.username || ': ' || array_to_string(changes, ' '));

  select * into who from public.profiles where id = target;
  return jsonb_build_object(
    'id', who.id, 'username', who.username,
    'displayName', coalesce(nullif(who.display_name,''), who.username::text),
    'role', who.role, 'state', who.state);
end;
$$;

-- Bans are admin+ (the RPC used to let mods in).
create or replace function public.admin_set_banned(target uuid, ban boolean, reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who public.profiles%rowtype;
begin
  who := public.staff_target(target, 2, 'ban');
  perform public.staff_action_begin();
  if ban then
    update public.profiles
       set banned = true, ban_reason = nullif(trim(coalesce(reason, '')), ''),
           banned_at = now(), banned_by = me, state = 'suspended'
     where id = target;
    update auth.users set banned_until = (now() + interval '100 years') where id = target;
    delete from auth.refresh_tokens where user_id = target::text;
    delete from auth.sessions where user_id = target;
    perform public.log_audit('user-ban',
      who.username || coalesce(': ' || nullif(trim(coalesce(reason,'')),''), ''));
  else
    update public.profiles
       set banned = false, ban_reason = null, banned_at = null, banned_by = null, state = 'active'
     where id = target;
    update auth.users set banned_until = null where id = target;
    perform public.log_audit('user-unban', who.username::text);
  end if;
  select * into who from public.profiles where id = target;
  return jsonb_build_object('id', who.id, 'username', who.username, 'banned', who.banned,
    'banReason', who.ban_reason, 'state', who.state);
end;
$$;
alter function public.admin_set_banned(uuid, boolean, text) set search_path = public, auth;

-- Campus+ is admin+, and only for people below you.
create or replace function public.admin_set_plus(target uuid, grant_it boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare who public.profiles%rowtype;
begin
  who := public.staff_target(target, 2, 'change Campus+ on');
  update public.profiles
     set is_plus = coalesce(grant_it, false),
         plus_since = case when grant_it then now() else null end,
         plus_grantedby = case when grant_it then auth.uid() else null end
   where id = target;
  perform public.log_audit(case when grant_it then 'plus-grant' else 'plus-revoke' end, who.username::text);
  return true;
end;
$$;

-- Mutes: mods up to a day, admins any length.
create or replace function public.admin_set_mute(target uuid, minutes numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who public.profiles%rowtype;
  until timestamptz;
begin
  who := public.staff_target(target, 1, 'mute');
  if public.my_rank() < 2 and coalesce(minutes, 0) > 1440 then
    raise exception 'Mods can mute for up to a day. Ask an admin for longer.';
  end if;
  until := case when minutes is null or minutes <= 0 then null
                else now() + (minutes || ' minutes')::interval end;
  update public.profiles set muted_until = until where id = target;
  if until is not null then
    perform public.notify(target, 'warning', auth.uid(),
      'You were muted until ' || to_char(until at time zone 'UTC', 'Mon DD HH24:MI') || ' UTC', 'notifications.html');
  end if;
  perform public.log_audit('mute-set',
    who.username || ': ' || case when until is null then 'cleared' else 'until ' || until::text end);
  return jsonb_build_object('id', who.id, 'username', who.username, 'mutedUntil', until);
end;
$$;

-- Sign-in log shows agents; admin+.
create or replace function public.admin_logins()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'username', coalesce(pr.username::text, '(deleted)'),
      'at', extract(epoch from l.at) * 1000, 'ip', '', 'agent', l.agent, 'outcome', l.outcome
    ) order by l.id desc), '[]'::jsonb)
    from (select * from public.logins order by id desc limit 200) l
    left join public.profiles pr on pr.id = l.user_id
  );
end;
$$;
drop policy if exists logins_staff_read on public.logins;
create policy logins_staff_read on public.logins for select using (public.is_admin());

-- -------------------------------------------------------- new mod tools

-- A formal warning: lands in their notifications, and on their staff notes.
create or replace function public.admin_warn(target uuid, message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who public.profiles%rowtype;
begin
  who := public.staff_target(target, 1, 'warn');
  message := trim(coalesce(message, ''));
  if length(message) < 3 then raise exception 'Say what the warning is for.'; end if;
  perform public.notify(target, 'warning', auth.uid(), 'Warning from staff: ' || left(message, 240), 'notifications.html');
  insert into public.staff_notes (target_id, author_id, body)
  values (target, auth.uid(), 'WARNING: ' || left(message, 1000));
  perform public.log_audit('user-warn', who.username || ': ' || left(message, 120));
  return jsonb_build_object('id', who.id, 'username', who.username);
end;
$$;

-- Ends every session they have, so they have to sign in again.
create or replace function public.admin_kick(target uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare who public.profiles%rowtype; n int;
begin
  who := public.staff_target(target, 1, 'sign out');
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
  get diagnostics n = row_count;
  perform public.log_audit('user-kick', who.username || ' (' || n || ' sessions)');
  return jsonb_build_object('id', who.id, 'username', who.username, 'sessions', n);
end;
$$;

-- Clears an inappropriate display name, bio or picture.
create or replace function public.admin_reset_profile(target uuid, parts text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare who public.profiles%rowtype; done text[] := '{}';
begin
  who := public.staff_target(target, 1, 'reset');
  if 'name' = any(parts) then
    update public.profiles set display_name = username where id = target; done := done || 'name'::text;
  end if;
  if 'bio' = any(parts) then
    update public.profiles set bio = '' where id = target; done := done || 'bio'::text;
  end if;
  if 'avatar' = any(parts) then
    update public.profiles set avatar_url = null where id = target; done := done || 'picture'::text;
  end if;
  if array_length(done, 1) is null then raise exception 'Nothing to reset.'; end if;
  perform public.notify(target, 'warning', auth.uid(),
    'Staff reset your profile ' || array_to_string(done, ', ') || ' for breaking the rules', 'profile.html');
  perform public.log_audit('profile-reset', who.username || ': ' || array_to_string(done, ', '));
  return jsonb_build_object('id', who.id, 'username', who.username, 'reset', done);
end;
$$;

-- Hides everything they sent in the last N hours (mods: up to 24).
create or replace function public.admin_purge_messages(target uuid, hours numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who public.profiles%rowtype; n int;
begin
  who := public.staff_target(target, 1, 'purge');
  if hours is null or hours <= 0 then raise exception 'Pick how far back.'; end if;
  if public.my_rank() < 2 and hours > 24 then
    raise exception 'Mods can clear up to the last 24 hours. Ask an admin for more.';
  end if;
  update public.messages set deleted = true
   where sender = target and not deleted and created_at > now() - make_interval(secs => hours * 3600);
  get diagnostics n = row_count;
  perform public.log_audit('messages-purge', who.username || ': ' || n || ' messages, ' || hours || 'h');
  return jsonb_build_object('id', who.id, 'username', who.username, 'hidden', n);
end;
$$;

-- -------------------------------------------------------- dev: catalogue
create or replace function public.save_custom_game(entry jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare slug text;
begin
  if not public.is_dev() then raise exception 'Only devs and the owner can change the catalogue.'; end if;
  slug := regexp_replace(lower(coalesce(entry->>'id','')), '[^a-z0-9-]+', '-', 'g');
  slug := regexp_replace(slug, '-+', '-', 'g');
  slug := trim(both '-' from slug);
  if slug = '' then raise exception 'That id has no usable characters.'; end if;
  if coalesce(entry->>'title','') = '' then raise exception 'A game needs a title.'; end if;
  if coalesce(entry->>'host','') = '' and coalesce(entry->>'source','') !~* '^https?://' then
    raise exception 'Pick a host, or give a full https:// URL.';
  end if;
  insert into public.custom_games (game_id, payload, removed, added_by, updated_at)
  values (slug, entry - 'id', false, auth.uid(), now())
  on conflict (game_id) do update set payload = excluded.payload, removed = false, updated_at = now();
  perform public.log_audit('game-save', slug);
  return entry || jsonb_build_object('id', slug);
end;
$$;

create or replace function public.remove_custom_game(slug text, hard boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dev() then raise exception 'Only devs and the owner can change the catalogue.'; end if;
  if hard then
    delete from public.custom_games where game_id = slug and removed = false;
  else
    insert into public.custom_games (game_id, payload, removed, added_by, updated_at)
    values (slug, '{}'::jsonb, true, auth.uid(), now())
    on conflict (game_id) do update set removed = true, updated_at = now();
  end if;
  perform public.log_audit(case when hard then 'game-delete' else 'game-hide' end, slug);
end;
$$;

create or replace function public.restore_custom_game(slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dev() then raise exception 'Only devs and the owner can change the catalogue.'; end if;
  delete from public.custom_games where game_id = slug and removed = true;
  perform public.log_audit('game-restore', slug);
end;
$$;

-- ---------------------------------------------------- dev: site switches
create table if not exists public.site_flags (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_flags enable row level security;
drop policy if exists site_flags_read on public.site_flags;
create policy site_flags_read on public.site_flags for select using (true);
-- Writes only through admin_set_flag.

create or replace function public.site_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.site_flags;
$$;

create or replace function public.admin_set_flag(flag text, val jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dev() then raise exception 'Only devs and the owner change site switches.'; end if;
  if flag not in ('maintenance','signups_closed','force_reload_at') then
    raise exception 'Unknown switch.';
  end if;
  if flag = 'force_reload_at' then val := to_jsonb(extract(epoch from now()) * 1000); end if;
  insert into public.site_flags (key, value, updated_by, updated_at)
  values (flag, coalesce(val, 'null'::jsonb), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public.log_audit('flag-set', flag || ' = ' || left(coalesce(val, 'null'::jsonb)::text, 120));
  return public.site_flags();
end;
$$;

-- Closing sign-ups is enforced here, at account creation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  is_first boolean;
  rank text;
begin
  wanted := coalesce(new.raw_user_meta_data->>'username', 'user' || left(new.id::text, 8));
  select count(*) = 0 into is_first from public.profiles;
  if not is_first and lower(wanted) <> lower(public.owner_username())
     and coalesce((select value from public.site_flags where key = 'signups_closed'), 'false'::jsonb) = 'true'::jsonb then
    raise exception 'Sign-ups are closed right now. Try again later.';
  end if;
  if lower(wanted) = lower(public.owner_username()) then rank := 'owner';
  elsif is_first then rank := 'admin';
  else rank := 'user';
  end if;
  insert into public.profiles (id, username, display_name, role, friend_code)
  values (new.id, wanted, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), wanted),
          rank, public.make_friend_code());
  return new;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.admin_warn(uuid, text)                from public, anon;
revoke all on function public.admin_kick(uuid)                      from public, anon;
revoke all on function public.admin_reset_profile(uuid, text[])     from public, anon;
revoke all on function public.admin_purge_messages(uuid, numeric)   from public, anon;
revoke all on function public.admin_set_flag(text, jsonb)           from public, anon;
grant execute on function public.my_rank()                          to authenticated;
grant execute on function public.is_dev()                           to authenticated;
grant execute on function public.admin_warn(uuid, text)             to authenticated;
grant execute on function public.admin_kick(uuid)                   to authenticated;
grant execute on function public.admin_reset_profile(uuid, text[])  to authenticated;
grant execute on function public.admin_purge_messages(uuid, numeric) to authenticated;
grant execute on function public.admin_set_flag(text, jsonb)        to authenticated;
grant execute on function public.site_flags()                       to anon, authenticated;
grant execute on function public.admin_set_user(uuid, text, text)   to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_plus(uuid, boolean)      to authenticated;
grant execute on function public.admin_set_mute(uuid, numeric)      to authenticated;
grant execute on function public.admin_logins()                     to authenticated;

notify pgrst, 'reload schema';

select username, role from public.profiles where role <> 'user'
order by public.rank_of(role) desc, username;

-- #################### 2. admin-accounts.sql ####################
-- =====================================================================
-- admin-accounts.sql  -  staff can create accounts, and see every account
--
-- 1. Backfill: any auth.users row with no profiles row gets one, so old
--    accounts made before the profile trigger existed (or whose trigger
--    failed) show up in the admin Users tab and can be managed.
-- 2. admin_users(q): lists EVERY account. Starts from auth.users, not
--    profiles, and the old 200-row cap is gone. Also returns ban state and
--    avatar, which the console already reads.
-- 3. admin_create_user(...): admin+ create an account with a username,
--    password, optional email and a rank below their own. Works even while
--    sign-ups are closed. Written to the audit log.
--
-- Idempotent: safe to run more than once.
-- =====================================================================


-- ---- 1. backfill missing profiles ------------------------------------
do $$
declare
  au record;
  wanted text;
begin
  for au in
    select u.id, u.email, u.raw_user_meta_data as meta, u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     where p.id is null
  loop
    wanted := au.meta->>'username';
    if wanted is null
       or wanted !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'
       or exists (select 1 from public.profiles where username = wanted::citext)
       or lower(wanted) = lower(public.owner_username()) then
      wanted := 'user' || left(replace(au.id::text, '-', ''), 8);
    end if;
    insert into public.profiles (id, username, display_name, role, friend_code, created_at)
    values (au.id, wanted,
            coalesce(nullif(au.meta->>'display_name', ''), wanted),
            'user', public.make_friend_code(), au.created_at)
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ---- 2. admin_users: every account, no cap ----------------------------
create or replace function public.admin_users(q text default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
begin
  if not public.is_staff() then raise exception 'You do not have access to that.'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(u)) from (
      select au.id,
             coalesce(p.username::text, au.raw_user_meta_data->>'username',
                      split_part(coalesce(au.email, ''), '@', 1)) as username,
             coalesce(p.display_name, au.raw_user_meta_data->>'display_name', '') as display_name,
             coalesce(p.bio, '') as bio,
             coalesce(p.role, 'user') as role,
             coalesce(p.state, 'active') as state,
             p.accepts_dms, p.show_activity,
             coalesce(p.created_at, au.created_at) as created_at,
             p.last_seen, p.current_game, p.muted_until, p.is_plus,
             p.avatar_url, p.banned, p.ban_reason,
             (p.id is null) as no_profile,
             lower(coalesce(au.email, '')) as email,
             au.last_sign_in_at,
             (select count(*) from public.friendships f
               where f.state = 'accepted'
                 and (f.requester = au.id or f.addressee = au.id)) as friends,
             (select count(*) from public.messages m
               where m.sender = au.id and not m.deleted)          as messages,
             (select count(*) from public.reports r
               where r.kind = 'user' and p.username is not null
                 and lower(r.target) = lower(p.username::text)) as reports,
             greatest((select max(l.at) from public.logins l where l.user_id = au.id),
                      au.last_sign_in_at) as last_login
        from auth.users au
        left join public.profiles p on p.id = au.id
       where q is null or q = ''
          or p.username ilike '%' || q || '%'
          or p.display_name ilike '%' || q || '%'
          or au.email ilike '%' || q || '%'
          or au.raw_user_meta_data->>'username' ilike '%' || q || '%'
       order by coalesce(p.created_at, au.created_at) desc
    ) u
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_users(text) from public, anon;
grant execute on function public.admin_users(text) to authenticated;

-- ---- 3. staff-created accounts skip the "sign-ups closed" switch --------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  is_first boolean;
  rank text;
  by_staff boolean := coalesce(current_setting('app.staff_create', true), '') = 'on';
begin
  wanted := coalesce(new.raw_user_meta_data->>'username', 'user' || left(new.id::text, 8));
  select count(*) = 0 into is_first from public.profiles;
  if not by_staff and not is_first and lower(wanted) <> lower(public.owner_username())
     and coalesce((select value from public.site_flags where key = 'signups_closed'), 'false'::jsonb) = 'true'::jsonb then
    raise exception 'Sign-ups are closed right now. Try again later.';
  end if;
  if lower(wanted) = lower(public.owner_username()) and not by_staff then rank := 'owner';
  elsif is_first then rank := 'admin';
  else rank := 'user';
  end if;
  insert into public.profiles (id, username, display_name, role, friend_code)
  values (new.id, wanted, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), wanted),
          rank, public.make_friend_code());
  return new;
end;
$$;

-- ---- 4. admin_create_user ---------------------------------------------
-- Admin+ only. The new rank must be below the caller's own, same rule as
-- admin_set_user. With no email, a placeholder address is stored so the
-- person signs in with their username; it never receives mail.
create or replace function public.admin_create_user(
  new_username text,
  new_password text,
  new_email    text default null,
  new_display  text default null,
  new_role     text default 'user'
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  me public.profiles%rowtype;
  uname text := trim(coalesce(new_username, ''));
  mail  text := lower(trim(coalesce(new_email, '')));
  shown text := nullif(trim(coalesce(new_display, '')), '');
  want_role text := coalesce(nullif(trim(new_role), ''), 'user');
  uid uuid := gen_random_uuid();
  placeholder boolean := false;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.rank_of(me.role) < 2 then
    raise exception 'Only administrators create accounts.';
  end if;

  if uname !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then
    raise exception 'Username must be 3-20 characters: letters, numbers or _, starting with a letter.';
  end if;
  if lower(uname) = lower(public.owner_username()) then
    raise exception 'That username is reserved.';
  end if;
  if exists (select 1 from public.profiles where username = uname::citext)
     or exists (select 1 from auth.users where lower(raw_user_meta_data->>'username') = lower(uname)) then
    raise exception 'That username is already taken.';
  end if;

  if new_password is null or length(new_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  if want_role not in ('user', 'mod', 'admin', 'dev') then
    raise exception 'Unknown rank.';
  end if;
  if public.rank_of(want_role) >= public.rank_of(me.role) then
    raise exception 'You can only give a rank below your own.';
  end if;

  if mail = '' then
    mail := lower(uname) || '@accounts.arcadecampus.invalid';
    placeholder := true;
  elsif mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right.';
  end if;
  if exists (select 1 from auth.users where lower(email) = mail) then
    raise exception 'An account already uses that email.';
  end if;

  perform set_config('app.staff_create', 'on', true);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    mail, extensions.crypt(new_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                       'created_by_staff', me.username::text),
    jsonb_build_object('username', uname, 'display_name', coalesce(shown, uname)),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text, 'email',
    jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
    null, now(), now()
  );

  perform set_config('app.staff_create', 'off', true);

  -- Staff vouch for the account, so it does not have to verify an email
  -- before it can use chat and friends. Rank goes through the staff path.
  perform public.staff_action_begin();
  update public.profiles
     set email_verified = true,
         role = want_role
   where id = uid;

  perform public.log_audit('user-create',
    uname || ' as ' || want_role || case when placeholder then ' (no email)' else ' (' || mail || ')' end);

  return jsonb_build_object(
    'id', uid, 'username', uname, 'role', want_role,
    'email', case when placeholder then null else mail end
  );
end;
$$;

revoke all on function public.admin_create_user(text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text) to authenticated;


notify pgrst, 'reload schema';

select
  (select count(*) from auth.users) as auth_accounts,
  (select count(*) from public.profiles) as profiles,
  'admin_users lists every account; admin_create_user is live' as result;

grant select on public.site_flags to anon, authenticated;

commit;

notify pgrst, 'reload schema';
