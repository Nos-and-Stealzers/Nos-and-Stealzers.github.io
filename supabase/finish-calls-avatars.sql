-- Finish shared avatars. (The call/block/thread-list functions this file
-- used to also carry are now merged into schema.sql — re-running schema.sql
-- keeps those current. This file's only remaining job is the avatars bucket,
-- which is NOT yet in schema.sql and was verified 2026-09-24 as still missing
-- in production: GET /storage/v1/bucket/avatars -> 404 Bucket not found.
--
-- Symptom while this is unapplied: avatar upload silently falls back to
-- storing a small (~100KB) copy of the image as base64 in the user's own
-- auth metadata (see uploadAvatarMeta() in js/core/api-supabase.js). That
-- lets YOU see your own avatar everywhere, but it is never written to
-- public.profiles.avatar_url, so FRIENDS calling thread_list()/pending_calls()/
-- take_signals() see an empty avatarUrl for you — broken shared avatars in
-- chat/call UI is the direct, live consequence of skipping this file.
--
-- Run once in the Supabase dashboard -> SQL Editor -> New query -> paste all
-- of this -> Run. Idempotent; safe to run again.

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
