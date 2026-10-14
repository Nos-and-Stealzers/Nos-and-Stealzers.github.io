-- Admin "Create an account": replace the account that already uses an email.
-- Run once in the Supabase SQL editor. Running it changes no account.
--
-- admin_replace_email_account(email, confirm):
--   confirm = false  -> only says which account uses the email (admins already
--                       see emails in the Users list), deletes nothing.
--   confirm = true   -> deletes that account (login, profile and everything it
--                       owns) so the email can be used again.
-- Same rank rule as the rest of the console: admin or above, only accounts
-- below your own rank, never yourself and never the owner. A leftover login
-- with no profile (from the old Delete account) can always be cleared.

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
  delete from auth.users where id = uid;
  return jsonb_build_object('found', true, 'deleted', true, 'username', who.username);
end;
$$;

revoke all on function public.admin_replace_email_account(text, boolean) from public, anon;
grant execute on function public.admin_replace_email_account(text, boolean) to authenticated;
