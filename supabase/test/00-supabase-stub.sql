-- Minimal stand-ins for the Supabase-managed pieces SETUP-ALL-IN-ONE.sql depends on,
-- so the real file can be run against a plain Postgres and its behaviour
-- observed. Only what the setup file actually touches.

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Supabase derives this from the request JWT. Here it reads a session GUC so
-- a test can say "now act as this person", and returns NULL when unset —
-- which is exactly what the SQL editor sees.
create or replace function auth.uid()
returns uuid language plpgsql stable as $$
declare v text;
begin
  v := current_setting('test.uid', true);
  if v is null or v = '' then return null; end if;
  return v::uuid;
end;
$$;

-- PostgREST's roles. RLS policies name them, so they have to exist.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;

-- Pieces the later sections of SETUP-ALL-IN-ONE.sql touch: the extensions
-- schema (pgcrypto), pg_net's http_post, Storage, and two auth.users columns.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists encrypted_password text;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb, body jsonb)
returns bigint language sql as $$ select 1::bigint $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql as $$ select string_to_array(name, '/') $$;

-- For the ban / sign-out RPCs.
alter table auth.users add column if not exists banned_until timestamptz;
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id text);
