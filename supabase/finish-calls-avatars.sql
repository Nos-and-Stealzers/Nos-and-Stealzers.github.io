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


-- Include each peer's avatar so call tiles, ring cards and the chat rail show
-- the real profile picture instead of only an identicon.
create or replace function public.take_signals(c bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  taken jsonb;
begin
  if not public.in_call(c) then raise exception 'You are not in that call.'; end if;

  delete from public.call_signals where created_at < now() - interval '60 seconds';
  update public.calls set state = 'ended', ended_at = now()
   where state = 'ringing' and created_at < now() - interval '45 seconds';

  with mine as (
    delete from public.call_signals
     where id in (
       select id from public.call_signals
        where call_id = c and to_id = auth.uid()
        order by id limit 40
     )
    returning id, from_id, kind, payload
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'from', from_id, 'kind', kind, 'payload', payload
  ) order by id), '[]'::jsonb) into taken from mine;

  return jsonb_build_object(
    'signals', taken,
    'call', (
      select jsonb_build_object(
        'id', k.id, 'state', k.state, 'kind', k.kind, 'startedBy', k.started_by,
        'peers', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.user_id, 'state', p.state,
            'username', pr.username,
            'displayName', coalesce(nullif(pr.display_name,''), pr.username),
            'avatarUrl', coalesce(pr.avatar_url,'')
          )), '[]'::jsonb)
            from public.call_peers p
            join public.profiles pr on pr.id = p.user_id
           where p.call_id = k.id
        )
      ) from public.calls k where k.id = c
    )
  );
end;
$$;

create or replace function public.pending_calls()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.calls set state = 'ended', ended_at = now()
   where state = 'ringing' and created_at < now() - interval '45 seconds';

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'state', k.state, 'kind', k.kind, 'startedBy', k.started_by,
      'peers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p2.user_id, 'state', p2.state,
          'username', pr.username,
          'displayName', coalesce(nullif(pr.display_name,''), pr.username),
          'avatarUrl', coalesce(pr.avatar_url,'')
        )), '[]'::jsonb)
          from public.call_peers p2
          join public.profiles pr on pr.id = p2.user_id
         where p2.call_id = k.id
      )
    ) order by k.id desc), '[]'::jsonb)
    from public.calls k
    join public.call_peers p on p.call_id = k.id and p.user_id = auth.uid()
   where k.state <> 'ended' and p.state <> 'left'
  );
end;
$$;

create or replace function public.thread_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to do that.'; end if;

  return coalesce((
    select jsonb_agg(x order by (x->>'lastAt')::bigint desc nulls last)
      from (
        select jsonb_build_object(
          'id', t.id,
          'isGroup', t.is_group,
          'rawTitle', t.title,
          'owner', t.owner_id = me,
          'lastAt', (coalesce(extract(epoch from t.last_at),
                              extract(epoch from t.created_at)) * 1000)::bigint,
          'unread', (
            select count(*) from public.messages m
             where m.thread_id = t.id and m.sender <> me
               and m.read_at is null and not m.deleted
          ),
          'members', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', p.id, 'username', p.username,
              'displayName', coalesce(nullif(p.display_name,''), p.username::text),
              'role', p.role, 'state', p.state,
              'avatarUrl', coalesce(p.avatar_url,''),
              'lastSeen', (extract(epoch from p.last_seen) * 1000)::bigint
            ) order by p.username)
              from public.thread_members tm2
              join public.profiles p on p.id = tm2.user_id
             where tm2.thread_id = t.id and tm2.user_id <> me
          ), '[]'::jsonb),
          'preview', (
            select jsonb_build_object(
              'body', case when m.deleted then 'message removed'
                           when coalesce(m.body,'') <> '' then m.body
                           when m.attachment_id is not null then 'sent an image'
                           else '' end,
              'mine', m.sender = me,
              'who', coalesce(nullif(p.display_name,''), p.username::text),
              'at', (extract(epoch from m.created_at) * 1000)::bigint
            )
              from public.messages m
              join public.profiles p on p.id = m.sender
             where m.thread_id = t.id
             order by m.id desc limit 1
          )
        ) as x
          from public.threads t
          join public.thread_members tm on tm.thread_id = t.id and tm.user_id = me
      ) s
  ), '[]'::jsonb);
end;
$$;
