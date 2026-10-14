-- Fix: deleting an account failed with
--   insert or update on table "user_save_revisions" violates foreign key
--   constraint "user_save_revisions_user_id_fkey"
-- A trigger copies a save into user_save_revisions when it is deleted. When the
-- account itself is being deleted, that copy points at a user who is already
-- gone, so Postgres refused and undid the whole delete (nothing was lost).
--
-- purge_account deletes in an order that works: first the rows that belong to
-- the account (while it still exists, so the trigger can do its thing), then
-- the save history, then the login, which takes the profile with it. Only
-- rows that would have been deleted anyway (ON DELETE CASCADE links) are
-- touched; rows that keep a blank user instead (audit log etc.) are left alone.
-- Run once in the Supabase SQL editor. Running it deletes nothing.

create or replace function public.purge_account(uid uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  fk record;
begin
  if uid is null then return; end if;

  for fk in
    select n.nspname as sch, c.relname as tbl, a.attname as col
      from pg_constraint k
      join pg_class c      on c.oid = k.conrelid
      join pg_namespace n  on n.oid = c.relnamespace
      join pg_attribute a  on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confdeltype = 'c'
       and array_length(k.conkey, 1) = 1
       and k.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and n.nspname = 'public'
       and c.relname not in ('profiles', 'user_save_revisions')
  loop
    execute format('delete from %I.%I where %I = $1', fk.sch, fk.tbl, fk.col) using uid;
  end loop;

  if to_regclass('public.user_save_revisions') is not null then
    execute 'delete from public.user_save_revisions where user_id = $1' using uid;
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.purge_account(uuid) from public, anon, authenticated;

-- The three ways an account gets deleted now all go through purge_account.

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  perform public.purge_account(uid);
  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.replace_account_with_code(p_email text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target text := lower(trim(coalesce(p_email, '')));
  rec public.account_replacements%rowtype;
  uid uuid;
begin
  select * into rec from public.account_replacements where email = target;
  if rec.email is null or rec.expires_at < now() then
    raise exception 'That code expired. Ask for a new one.';
  end if;
  if rec.attempts >= 5 then
    raise exception 'Too many wrong codes. Ask for a new one.';
  end if;
  if rec.code_hash <> extensions.crypt(trim(coalesce(p_code, '')), rec.code_hash) then
    update public.account_replacements set attempts = attempts + 1 where email = target;
    raise exception 'That code is wrong.';
  end if;

  delete from public.account_replacements where email = target;
  for uid in select id from auth.users where lower(email) = target loop
    perform public.purge_account(uid);
  end loop;
  return true;
end;
$$;

revoke all on function public.replace_account_with_code(text, text) from public;
grant execute on function public.replace_account_with_code(text, text) to anon, authenticated;

create or replace function public.admin_replace_email_account(p_email text, p_confirm boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.profiles%rowtype;
  who public.profiles%rowtype;
  target text := lower(trim(coalesce(p_email, '')));
  uid uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or public.rank_of(me.role) < 2 then
    raise exception 'Only administrators can do that.';
  end if;

  select id into uid from auth.users where lower(email) = target limit 1;
  if uid is null then
    return jsonb_build_object('found', false);
  end if;

  select * into who from public.profiles where id = uid;
  if who.id is not null then
    who := public.staff_target(uid, 2, 'replace');
  end if;

  if not coalesce(p_confirm, false) then
    return jsonb_build_object('found', true, 'username', who.username, 'role', who.role,
                              'leftover', who.id is null);
  end if;

  perform public.log_audit('account-replace',
    coalesce('@' || who.username, 'leftover login') || ' (' || target || ') deleted to reuse the email');
  perform public.purge_account(uid);
  return jsonb_build_object('found', true, 'deleted', true, 'username', who.username);
end;
$$;

revoke all on function public.admin_replace_email_account(text, boolean) from public, anon;
grant execute on function public.admin_replace_email_account(text, boolean) to authenticated;
