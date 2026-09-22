-- Avatar / profile picture support.
-- Run once in the Supabase SQL editor (dash → SQL → New query → paste → Run).
-- Everything on the site is already wired for this; it activates the moment
-- these run. Safe to run more than once.

-- 1) Add the avatar column the client writes/reads.
alter table public.profiles
  add column if not exists avatar_url text;

-- 2) Let updateProfile (a PATCH as the signed-in user) write it. The existing
--    profiles update policy already covers "id = auth.uid()"; this only adds the
--    column, so no new policy is needed. Verify with:
--      select column_name from information_schema.columns
--      where table_name='profiles' and column_name='avatar_url';

-- 3) Storage: allow each signed-in user to upload/replace their OWN avatar in
--    the public "avatars" bucket under a folder named by their user id
--    (avatars/<uid>/pfp.jpg). Public read so <img> works everywhere.
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
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
