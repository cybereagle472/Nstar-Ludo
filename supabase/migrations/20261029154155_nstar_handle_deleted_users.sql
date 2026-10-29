-- Keep a game playable if a participant deletes their account mid-game.
create or replace function public.nstar_room_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare participant jsonb; old_winner text; new_winner text; member_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'waiting' and new.status = 'playing' then
      for participant in select distinct value from jsonb_array_elements(new.players) loop
        if participant->>'userId' is not null then
          member_id := (participant->>'userId')::uuid;
          if exists (select 1 from auth.users where id = member_id) then
            insert into public.nstar_online_stats as stats(user_id, games_played, games_won)
            values (member_id, 1, 0)
            on conflict (user_id) do update set games_played = stats.games_played + 1, updated_at = now();
          end if;
        end if;
      end loop;
    end if;
    old_winner := coalesce(old.game->'winners'->>0, old.game->>'winner');
    new_winner := coalesce(new.game->'winners'->>0, new.game->>'winner');
    if old_winner is null and new_winner is not null then
      select value into participant from jsonb_array_elements(new.players) where value->>'color' = new_winner limit 1;
      if participant->>'userId' is not null then
        member_id := (participant->>'userId')::uuid;
        if exists (select 1 from auth.users where id = member_id) then
          insert into public.nstar_online_stats as stats(user_id, games_played, games_won)
          values (member_id, 1, 1)
          on conflict (user_id) do update set games_won = stats.games_won + 1, updated_at = now();
        end if;
      end if;
    end if;
  end if;
  begin
    perform realtime.send(jsonb_build_object('revision', new.revision), 'update', 'nstar-room:' || new.channel::text, false);
  exception when others then null;
  end;
  return new;
end;
$$;
