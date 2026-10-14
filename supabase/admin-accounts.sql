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

begin;

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

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from auth.users) as auth_accounts,
  (select count(*) from public.profiles) as profiles,
  'admin_users lists every account; admin_create_user is live' as result;
