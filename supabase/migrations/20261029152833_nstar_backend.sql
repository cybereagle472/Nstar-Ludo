-- Nstar Ludo: private room state, account profiles, avatar storage and online stats.
-- Browser clients have no direct read/write access to room state or token hashes.
create table public.nstar_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 24),
  avatar_path text check (avatar_path is null or avatar_path like id::text || '/%'),
  updated_at timestamptz not null default now()
);
create table public.nstar_online_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  games_played integer not null default 0 check (games_played >= 0),
  games_won integer not null default 0 check (games_won >= 0 and games_won <= games_played),
  updated_at timestamptz not null default now()
);
create table public.nstar_rooms (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  channel uuid not null unique default gen_random_uuid(),
  capacity smallint not null check (capacity between 2 and 4),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  players jsonb not null default '[]'::jsonb check (jsonb_typeof(players) = 'array'),
  game jsonb,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nstar_rooms_updated_at_idx on public.nstar_rooms(updated_at);
create table public.nstar_rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
create index nstar_rate_limits_window_idx on public.nstar_rate_limits(window_start);

alter table public.nstar_profiles enable row level security;
alter table public.nstar_online_stats enable row level security;
alter table public.nstar_rooms enable row level security;
alter table public.nstar_rate_limits enable row level security;
revoke all on public.nstar_profiles, public.nstar_online_stats, public.nstar_rooms, public.nstar_rate_limits from public, anon, authenticated;
grant select, insert, update on public.nstar_profiles to authenticated;
grant select on public.nstar_online_stats to authenticated;
grant all on public.nstar_profiles, public.nstar_online_stats, public.nstar_rooms, public.nstar_rate_limits to service_role;
create policy nstar_profile_read_own on public.nstar_profiles for select to authenticated using (id = (select auth.uid()));
create policy nstar_profile_insert_own on public.nstar_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy nstar_profile_update_own on public.nstar_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy nstar_stats_read_own on public.nstar_online_stats for select to authenticated using (user_id = (select auth.uid()));

-- A fixed-window limiter is used only by the Edge Function via service_role.
create function public.nstar_take_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if length(p_key) > 160 or p_limit < 1 or p_seconds < 1 then return false; end if;
  insert into public.nstar_rate_limits as limits(bucket, window_start, attempts)
  values (p_key, now(), 1)
  on conflict (bucket) do update set
    attempts = case when limits.window_start < now() - make_interval(secs => p_seconds) then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start < now() - make_interval(secs => p_seconds) then now() else limits.window_start end
  returning attempts <= p_limit into allowed;
  return allowed;
end;
$$;
revoke all on function public.nstar_take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.nstar_take_rate_limit(text, integer, integer) to service_role;

-- Count authenticated online players exactly once as a room starts; count its
-- first-place winner once. Do not trust client-supplied statistics.
create function public.nstar_room_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare participant jsonb; old_winner text; new_winner text; member_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'waiting' and new.status = 'playing' then
      for participant in select distinct value from jsonb_array_elements(new.players) loop
        if participant->>'userId' is not null then
          member_id := (participant->>'userId')::uuid;
          insert into public.nstar_online_stats as stats(user_id, games_played, games_won)
          values (member_id, 1, 0)
          on conflict (user_id) do update set games_played = stats.games_played + 1, updated_at = now();
        end if;
      end loop;
    end if;
    old_winner := coalesce(old.game->'winners'->>0, old.game->>'winner');
    new_winner := coalesce(new.game->'winners'->>0, new.game->>'winner');
    if old_winner is null and new_winner is not null then
      select value into participant from jsonb_array_elements(new.players) where value->>'color' = new_winner limit 1;
      if participant->>'userId' is not null then
        member_id := (participant->>'userId')::uuid;
        insert into public.nstar_online_stats as stats(user_id, games_played, games_won)
        values (member_id, 1, 1)
        on conflict (user_id) do update set games_won = stats.games_won + 1, updated_at = now();
      end if;
    end if;
  end if;
  -- Only an unguessable channel and a revision are sent; clients refetch an
  -- authorized snapshot. A realtime outage never rolls back a valid move.
  begin
    perform realtime.send(jsonb_build_object('revision', new.revision), 'update', 'nstar-room:' || new.channel::text, false);
  exception when others then null;
  end;
  return new;
end;
$$;
revoke all on function public.nstar_room_changed() from public, anon, authenticated;
create trigger nstar_room_changed_trigger after insert or update on public.nstar_rooms for each row execute function public.nstar_room_changed();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nstar-avatars', 'nstar-avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy nstar_avatar_read_own on storage.objects for select to authenticated using (bucket_id = 'nstar-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy nstar_avatar_insert_own on storage.objects for insert to authenticated with check (bucket_id = 'nstar-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy nstar_avatar_update_own on storage.objects for update to authenticated using (bucket_id = 'nstar-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)) with check (bucket_id = 'nstar-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy nstar_avatar_delete_own on storage.objects for delete to authenticated using (bucket_id = 'nstar-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
