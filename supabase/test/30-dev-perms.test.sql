-- Dev rank and the permission fixes (dev-role-and-perms.sql).
\set ON_ERROR_STOP off
\pset pager off

create or replace function test_ok(label text, cond boolean, detail text default '')
returns void language plpgsql as $$
begin
  raise notice '%  %  %', case when cond then 'ok  ' else 'FAIL' end, rpad(label, 58), detail;
end;
$$;
create or replace function as_user(name text) returns void language sql as $$
  select set_config('test.uid', (select id::text from public.profiles where username = name), false);
$$;
create or replace function uid_of(name text) returns uuid language sql as $$
  select id from public.profiles where username = name;
$$;
create or replace function role_of(name text) returns text language sql as $$
  select role from public.profiles where username = name;
$$;
create or replace function tries(label text, stmt text, should_work boolean) returns void language plpgsql as $$
begin
  execute stmt;
  perform test_ok(label, should_work, case when should_work then '' else 'it was allowed' end);
exception when others then
  perform test_ok(label, not should_work, SQLERRM);
end;
$$;

insert into auth.users (raw_user_meta_data) values
  ('{"username":"Stealzers"}'), ('{"username":"devy"}'), ('{"username":"addy"}'),
  ('{"username":"moddy"}'), ('{"username":"plain"}'), ('{"username":"plain2"}');

select as_user('Stealzers');
select tries('owner can make a dev', $q$select public.admin_set_user(uid_of('devy'), 'dev', null)$q$, true);
select test_ok('devy is a dev', role_of('devy') = 'dev', role_of('devy'));

select as_user('devy');
select tries('dev can make an admin', $q$select public.admin_set_user(uid_of('addy'), 'admin', null)$q$, true);
select tries('dev cannot make another dev', $q$select public.admin_set_user(uid_of('plain'), 'dev', null)$q$, false);
select tries('nobody grants owner', $q$select public.admin_set_user(uid_of('plain'), 'owner', null)$q$, false);
select test_ok('rank order owner>dev>admin>mod',
  public.rank_of('owner') > public.rank_of('dev') and public.rank_of('dev') > public.rank_of('admin')
  and public.rank_of('admin') > public.rank_of('mod'));
select test_ok('dev counts as admin and staff', public.is_admin() and public.is_staff() and public.is_dev());
select tries('dev can edit the catalogue',
  $q$select public.save_custom_game('{"id":"devgame","title":"Dev Game","host":"games-huge","source":"a.html"}'::jsonb)$q$, true);
select tries('dev can flip a site switch', $q$select public.admin_set_flag('maintenance', '{"on":false}'::jsonb)$q$, true);

select as_user('addy');
select tries('admin can make a mod', $q$select public.admin_set_user(uid_of('moddy'), 'mod', null)$q$, true);
select tries('admin cannot make an admin', $q$select public.admin_set_user(uid_of('plain'), 'admin', null)$q$, false);
select tries('admin cannot touch a dev', $q$select public.admin_set_user(uid_of('devy'), 'user', null)$q$, false);
select tries('admin cannot edit the catalogue',
  $q$select public.save_custom_game('{"id":"x","title":"X","host":"games-huge","source":"a.html"}'::jsonb)$q$, false);
select tries('admin cannot flip site switches', $q$select public.admin_set_flag('signups_closed', 'true'::jsonb)$q$, false);

-- The hole: admins used to be able to PATCH profiles.role directly.
update public.profiles set role = 'owner' where username = 'addy';
select test_ok('admin cannot make themselves owner by UPDATE', role_of('addy') = 'admin', role_of('addy'));
update public.profiles set role = 'admin' where username = 'plain';
select test_ok('admin cannot promote by UPDATE', role_of('plain') = 'user', role_of('plain'));
select tries('admin cannot edit a dev profile row',
  $q$update public.profiles set bio = 'hacked' where username = 'devy'$q$, false);
select tries('admin can edit a plain user profile row',
  $q$update public.profiles set bio = 'ok' where username = 'plain'$q$, true);
select tries('admin can ban', $q$select public.admin_set_banned(uid_of('plain2'), true, 'test')$q$, true);
select test_ok('ban suspended them', (select state from public.profiles where username = 'plain2') = 'suspended');
select tries('admin can unban', $q$select public.admin_set_banned(uid_of('plain2'), false, null)$q$, true);
select tries('admin can grant Campus+', $q$select public.admin_set_plus(uid_of('plain'), true)$q$, true);
select tries('admin can read sign-ins', $q$select public.admin_logins()$q$, true);
select tries('admin can mute for a week', $q$select public.admin_set_mute(uid_of('plain'), 10080)$q$, true);

select as_user('moddy');
select tries('mod cannot ban', $q$select public.admin_set_banned(uid_of('plain'), true, 'x')$q$, false);
select tries('mod cannot grant Campus+', $q$select public.admin_set_plus(uid_of('plain2'), true)$q$, false);
select tries('mod cannot read sign-ins', $q$select public.admin_logins()$q$, false);
select tries('mod cannot suspend', $q$select public.admin_set_user(uid_of('plain'), null, 'suspended')$q$, false);
select tries('mod can mute for an hour', $q$select public.admin_set_mute(uid_of('plain'), 60)$q$, true);
select tries('mod cannot mute for a week', $q$select public.admin_set_mute(uid_of('plain'), 10080)$q$, false);
select tries('mod can warn', $q$select public.admin_warn(uid_of('plain'), 'be nice')$q$, true);
select test_ok('warning landed in notifications and notes',
  exists (select 1 from public.notifications where user_id = uid_of('plain') and kind = 'warning')
  and exists (select 1 from public.staff_notes where target_id = uid_of('plain') and body like 'WARNING:%'));
select tries('mod can sign someone out', $q$select public.admin_kick(uid_of('plain'))$q$, true);
select tries('mod can reset a profile', $q$select public.admin_reset_profile(uid_of('plain'), array['bio','name'])$q$, true);
select test_ok('bio was cleared', (select bio from public.profiles where username = 'plain') = '');
select tries('mod can purge 24h of messages', $q$select public.admin_purge_messages(uid_of('plain'), 24)$q$, true);
select tries('mod cannot purge a week', $q$select public.admin_purge_messages(uid_of('plain'), 168)$q$, false);
select tries('mod cannot warn an admin', $q$select public.admin_warn(uid_of('addy'), 'hey')$q$, false);
select tries('mod cannot warn the owner', $q$select public.admin_warn(uid_of('Stealzers'), 'hey')$q$, false);

select as_user('plain');
select tries('plain user cannot warn', $q$select public.admin_warn(uid_of('plain2'), 'hey')$q$, false);
select tries('anyone can read site flags', $q$select public.site_flags()$q$, true);
select tries('plain user can still edit their own bio',
  $q$update public.profiles set bio = 'mine' where username = 'plain'$q$, true);

select as_user('devy');
select public.admin_set_flag('signups_closed', 'true'::jsonb);
select tries('sign-up refused while closed',
  $q$insert into auth.users (raw_user_meta_data) values ('{"username":"latecomer"}')$q$, false);
select public.admin_set_flag('signups_closed', 'false'::jsonb);
select tries('sign-up works once reopened',
  $q$insert into auth.users (raw_user_meta_data) values ('{"username":"latecomer"}')$q$, true);

reset all;
