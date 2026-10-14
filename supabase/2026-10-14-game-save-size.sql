-- Bigger per-game cloud saves (run once in the Supabase SQL editor).
--
-- Only replaces the put_game_save function. No table is altered, and no
-- existing row is read, changed or deleted by running this.
--
-- Why: the Save button stores each game in its own row ("game.<id>").
-- Unity games and Eaglercraft worlds can be bigger than the old 4 MB cap,
-- so they failed with "too large for a cloud save". Supabase's gateway
-- accepts at least 20 MB per request (tested), so the cap was the only limit.
--
--   game.<id> rows (one game):      up to 16 MB each
--   other rows (whole-site backup): up to 4 MB, unchanged
--   all of one account's saves:     64 MB in total, so the database can't
--                                   be filled by one person. A save that is
--                                   not bigger than the one it replaces is
--                                   always allowed, so nobody already over
--                                   the total gets stuck.

create or replace function public.put_game_save(p_host text, payload jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  n        int;
  new_size bigint := pg_column_size(coalesce(payload, '{}'::jsonb));
  old_size bigint;
  others   bigint;
  row_cap  bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_host !~ '^[A-Za-z0-9._-]{1,64}$' then raise exception 'Unknown game host.'; end if;

  row_cap := case when p_host like 'game.%' then 16777216 else 4194304 end;
  if new_size > row_cap then raise exception 'That host''s saves are too large.'; end if;

  select pg_column_size(g.payload) into old_size
    from public.game_saves g where g.user_id = auth.uid() and g.host = p_host;

  if old_size is null or new_size > old_size then
    select coalesce(sum(pg_column_size(g.payload)), 0) into others
      from public.game_saves g where g.user_id = auth.uid() and g.host <> p_host;
    if others + new_size > 67108864 then
      raise exception 'Your cloud saves are full (64 MB in total), so this game was not saved to your account.';
    end if;
  end if;

  n := (select count(*) from jsonb_object_keys(coalesce(payload, '{}'::jsonb)));

  insert into public.game_saves (user_id, host, payload, keys, updated_at)
  values (auth.uid(), p_host, coalesce(payload, '{}'::jsonb), n, now())
  on conflict (user_id, host) do update
    set payload = excluded.payload, keys = excluded.keys, updated_at = now();

  return n;
end;
$$;

revoke all on function public.put_game_save(text, jsonb) from public, anon;
grant execute on function public.put_game_save(text, jsonb) to authenticated;
