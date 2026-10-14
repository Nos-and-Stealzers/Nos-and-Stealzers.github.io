-- Replace an old account that already uses an email (run once in the Supabase SQL editor).
--
-- Adds functions and one small table. It does not change or delete any
-- existing account by itself: an account is only removed when someone proves
-- it is theirs, by signing in to it (its password) or with a code sent to its
-- email. Without that proof, anyone could type someone else's email and wipe
-- their account and cloud saves.
--
-- Also fixes Settings > Delete account: it used to remove only the profile,
-- leaving the login behind, so the email stayed "already in use" forever.

-- ---- 1. delete_my_account: the signed-in account, login included ----------
-- Deleting the auth.users row cascades to profiles and from there to
-- everything the account owns (saves, friends, messages...), which frees the
-- email for a new signup.
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
  delete from auth.users where id = uid;
  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---- 2. one-time codes for "this email is mine, replace that account" -----
create table if not exists public.account_replacements (
  email      text primary key,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  last_sent  timestamptz not null default now()
);
alter table public.account_replacements enable row level security;
-- No policies: only the functions below can read or write it.
revoke all on public.account_replacements from anon, authenticated;

create or replace function public.request_account_replace_code(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target text := lower(trim(coalesce(p_email, '')));
  code text;
  existing timestamptz;
  api_key text;
  from_addr text;
begin
  if target !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Enter a valid email address.'; end if;

  select last_sent into existing from public.account_replacements where email = target;
  if existing is not null and existing > now() - interval '60 seconds' then
    raise exception 'A code was just sent. Wait a minute before asking for another.';
  end if;

  -- Same answer whether or not an account uses the email.
  if not exists (select 1 from auth.users where lower(email) = target) then
    return jsonb_build_object('ok', true);
  end if;

  select value into api_key   from public.app_secrets where key = 'resend_api_key';
  select value into from_addr from public.app_secrets where key = 'resend_from';
  if api_key is null or api_key = '' or api_key like 'REPLACE%' then
    raise exception 'Email codes are not set up on this site. Use the old account''s password instead.';
  end if;

  code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  insert into public.account_replacements (email, code_hash, expires_at, attempts, last_sent)
  values (target, extensions.crypt(code, extensions.gen_salt('bf')), now() + interval '15 minutes', 0, now())
  on conflict (email) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
        attempts = 0, last_sent = now();

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'from', from_addr,
      'to', target,
      'subject', 'Code to replace your Arcade Campus Hub account: ' || code,
      'html',
        '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:440px;margin:auto">' ||
        '<h2 style="margin:0 0 8px">Replace your old account?</h2>' ||
        '<p style="color:#555;margin:0 0 16px">Someone is making a new Arcade Campus Hub account with this email. ' ||
        'Entering this code <b>permanently deletes the old account</b> on this email, with its friends, messages and cloud saves:</p>' ||
        '<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2f3f5;border-radius:10px;padding:16px;text-align:center">' ||
        code || '</div>' ||
        '<p style="color:#888;font-size:13px;margin:16px 0 0">The code expires in 15 minutes. ' ||
        'If this wasn''t you, ignore this email and nothing happens.</p></div>')
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_account_replace_code(text) from public;
grant execute on function public.request_account_replace_code(text) to anon, authenticated;

create or replace function public.replace_account_with_code(p_email text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target text := lower(trim(coalesce(p_email, '')));
  rec public.account_replacements%rowtype;
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
  delete from auth.users where lower(email) = target;
  return true;
end;
$$;

revoke all on function public.replace_account_with_code(text, text) from public;
grant execute on function public.replace_account_with_code(text, text) to anon, authenticated;
