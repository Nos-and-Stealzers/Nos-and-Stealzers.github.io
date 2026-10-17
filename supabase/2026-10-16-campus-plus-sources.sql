-- Campus+: TikTok and Instagram in playlists (run once in the Supabase SQL editor).
--
-- Campus+ now plays TikTok and Instagram links as well as YouTube. A saved
-- item keeps its source in the id it stores:
--
--   dQw4w9WgXcQ              YouTube (unchanged, the 11-character id)
--   tt:7234567890123456789   TikTok video id
--   ig:Cx1AbCdEfGh           Instagram post/reel shortcode
--
-- This widens the playlist_items.video_id check and add_playlist_item's own
-- validation to accept those. No existing row is changed: every YouTube id
-- already stored still matches.

alter table public.playlist_items drop constraint if exists playlist_items_video_id_check;
alter table public.playlist_items add constraint playlist_items_video_id_check
  check (video_id ~ '^([A-Za-z0-9_-]{11}|tt:[0-9]{8,25}|ig:[A-Za-z0-9_-]{5,40})$');

create or replace function public.add_playlist_item(p_playlist_id bigint, p_video_id text, p_title text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  next_pos integer;
  cur_items int;
  lim int;
  row_out public.playlist_items%rowtype;
begin
  select owner_id into owner from public.playlists where id = p_playlist_id;
  if owner is null then raise exception 'No such playlist.'; end if;
  if owner <> auth.uid() then raise exception 'Not your playlist.'; end if;
  if not public.is_plus_member(auth.uid()) then
    raise exception 'Campus+ is a members-only feature. Ask staff to enable it for your account.';
  end if;

  if p_video_id !~ '^([A-Za-z0-9_-]{11}|tt:[0-9]{8,25}|ig:[A-Za-z0-9_-]{5,40})$' then
    raise exception 'That does not look like a valid YouTube, TikTok or Instagram link.';
  end if;

  select count(*) into cur_items from public.playlist_items where playlist_id = p_playlist_id;
  select max_items into lim from public.plus_limits(owner);
  if cur_items >= lim then
    raise exception 'This playlist is full (% videos).', lim;
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
    from public.playlist_items where playlist_id = p_playlist_id;

  insert into public.playlist_items (playlist_id, video_id, title, added_by, position)
  values (p_playlist_id, p_video_id, coalesce(trim(p_title), ''), auth.uid(), next_pos)
  on conflict (playlist_id, video_id) do nothing
  returning * into row_out;

  if row_out.id is null then
    raise exception 'That video is already in the playlist.';
  end if;

  update public.playlists set updated_at = now() where id = p_playlist_id;

  return jsonb_build_object(
    'id', row_out.id, 'videoId', row_out.video_id, 'title', row_out.title,
    'position', row_out.position, 'addedAt', row_out.added_at
  );
end;
$$;

grant execute on function public.add_playlist_item(bigint, text, text) to authenticated;
