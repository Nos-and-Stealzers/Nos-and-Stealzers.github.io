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
