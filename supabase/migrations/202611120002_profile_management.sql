begin;

alter table public.profiles
  add column if not exists sort_order integer not null default 2147483647,
  add column if not exists ever_used boolean not null default false;

-- Include soft-deleted shots: their profiles have still been used.
update public.profiles p set ever_used = true
where exists (select 1 from public.shots s where s.room_id = p.room_id and s.profile = p.name);

create or replace function public.remember_profile_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set ever_used = true
  where room_id = new.room_id and name = new.profile and not ever_used;
  if tg_op = 'UPDATE' then
    update public.profiles set ever_used = true
    where room_id = old.room_id and name = old.profile and not ever_used;
  end if;
  return new;
end;
$$;

drop trigger if exists remember_profile_usage on public.shots;
create trigger remember_profile_usage
after insert or update of profile on public.shots
for each row execute function public.remember_profile_usage();

create or replace function public.set_profile_order(target_room uuid, profile_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare active_count integer;
begin
  if not public.in_room(target_room, true) then
    raise exception 'Nur Raum-Admins können Profile sortieren.';
  end if;
  perform id from public.rooms where id = target_room for update;
  perform id from public.profiles where room_id = target_room order by id for update;
  select count(*) into active_count from public.profiles where room_id = target_room and not archived;
  if profile_ids is null or cardinality(profile_ids) <> active_count
     or (select count(distinct id) from unnest(profile_ids) as ids(id)) <> active_count
     or exists (
       select 1 from unnest(profile_ids) as ids(id)
       where not exists (select 1 from public.profiles p where p.id = ids.id and p.room_id = target_room and not p.archived)
     ) then
    raise exception 'Die Profilliste hat sich geändert. Bitte erneut versuchen.';
  end if;
  update public.profiles p set sort_order = ordered.position::integer
  from unnest(profile_ids) with ordinality as ordered(id, position)
  where p.id = ordered.id and p.room_id = target_room;
end;
$$;

create or replace function public.delete_unused_profile(profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  select * into target from public.profiles where id = profile_id for update;
  if not found then raise exception 'Das Profil wurde nicht gefunden.'; end if;
  if not public.in_room(target.room_id, true) then
    raise exception 'Nur Raum-Admins können Profile löschen.';
  end if;
  if target.ever_used or exists (
    select 1 from public.shots where room_id = target.room_id and profile = target.name
  ) then
    raise exception 'Dieses Profil wurde bereits verwendet und kann nur archiviert werden.';
  end if;
  delete from public.profiles where id = target.id;
end;
$$;

revoke all on function public.remember_profile_usage() from public, anon, authenticated;
revoke all on function public.set_profile_order(uuid, uuid[]) from public, anon;
revoke all on function public.delete_unused_profile(uuid) from public, anon;
grant execute on function public.set_profile_order(uuid, uuid[]) to authenticated;
grant execute on function public.delete_unused_profile(uuid) to authenticated;

commit;
