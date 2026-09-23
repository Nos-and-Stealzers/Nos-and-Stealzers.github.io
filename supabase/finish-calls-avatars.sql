-- Finish shared avatars and allow every member of a conversation to join its call.
-- Safe to run repeatedly.

-- Shared profile pictures: public URL on profile + owner-only Storage writes.
alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', true, 2097152,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No separate call-size cap: a group call invites every non-blocked member of
-- the thread. The thread membership limit remains the room-size boundary.
create or replace function public.start_call(
  target uuid default null, t bigint default null, call_kind text default 'audio'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
  invitee uuid;
  invited uuid[];
  me uuid := auth.uid();
begin
  perform public.require_active();
  if call_kind not in ('audio','video','screen') then call_kind := 'audio'; end if;

  if t is not null then
    if not exists (select 1 from public.thread_members where thread_id = t and user_id = me) then
      raise exception 'You are not in that conversation.';
    end if;
    select array_agg(user_id) into invited
      from public.thread_members
     where thread_id = t and user_id <> me
       and not public.blocked_between(me, user_id);
  else
    if target is null then raise exception 'Say who you are calling.'; end if;
    if not public.are_friends(me, target) then
      raise exception 'You can only call friends.';
    end if;
    if public.blocked_between(me, target) then
      raise exception 'You cannot call this person.';
    end if;
    invited := array[target];
  end if;

  if invited is null or array_length(invited, 1) is null then
    raise exception 'There is nobody to call.';
  end if;

  update public.calls set state = 'ended', ended_at = now()
   where state = 'ringing' and started_by = me;

  insert into public.calls (thread_id, started_by, kind)
  values (t, me, call_kind)
  returning id into new_id;

  insert into public.call_peers (call_id, user_id, state, joined_at)
  values (new_id, me, 'joined', now());

  foreach invitee in array invited loop
    insert into public.call_peers (call_id, user_id) values (new_id, invitee)
      on conflict do nothing;
    perform public.notify(invitee, 'call', me,
      coalesce(nullif((select display_name from public.profiles where id = me), ''),
               (select username::text from public.profiles where id = me)) || ' is calling you.',
      case when t is null then 'messages.html' else 'messages.html?thread=' || t end);
  end loop;

  return new_id;
end;
$$;

grant execute on function public.start_call(uuid,bigint,text) to authenticated;
