begin;
alter table public.profiles add column flow_based boolean not null default false;
-- Imported historical profile names can contain up to 150 characters.
alter table public.profiles drop constraint profiles_name_check;
alter table public.profiles add constraint profiles_name_check check (length(trim(name)) between 1 and 150);
alter table public.shots
 add column note text check (length(note) <= 2000),
 add column flow_based boolean not null default false,
 add column max_pressure numeric check (max_pressure between 0 and 30),
 add column grind_advice text check (grind_advice in ('coarser', 'finer', 'exact')),
 add column grind_target numeric,
 add constraint shot_pressure_flow check (max_pressure is null or flow_based),
 add constraint shot_advice_equipment check (grind_advice is null or (bean_id is not null and grinder_id is not null)),
 add constraint shot_advice_target check ((grind_advice is not distinct from 'exact') = (grind_target is not null));
grant insert (note, flow_based, max_pressure, grind_advice, grind_target), update (note, flow_based, max_pressure, grind_advice, grind_target) on public.shots to authenticated;
grant update (flow_based) on public.profiles to authenticated;
insert into public.profiles (room_id, name, ever_used)
select distinct s.room_id, trim(s.profile), true from public.shots s
where length(trim(s.profile)) between 1 and 150
and not exists (select 1 from public.profiles p where p.room_id = s.room_id and p.name = trim(s.profile));
drop policy profiles_manage on public.profiles;
create policy profiles_manage on public.profiles for all to authenticated using (public.in_room(room_id)) with check (public.in_room(room_id));
revoke insert (room_id, name), update (name) on public.profiles from authenticated;
create function public.create_room_profile(target_room uuid, profile_name text, is_flow_based boolean default false)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
 if not public.in_room(target_room) then raise exception 'Nur Raummitglieder können Profile anlegen.'; end if;
 perform id from public.rooms where id = target_room for update;
 select * into result from public.profiles where room_id = target_room and name = trim(profile_name) order by archived, id limit 1;
 if found then
  if result.archived then raise exception 'Dieses Profil ist archiviert. Bitte zuerst in den Einstellungen aktivieren.'; end if;
  return result;
 end if;
 insert into public.profiles (room_id, name, flow_based) values (target_room, trim(profile_name), is_flow_based) returning * into result;
 return result;
end;
$$;
create function public.promote_room_member(target_room uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.in_room(target_room, true) then raise exception 'Nur Raum-Admins können Adminrechte vergeben.'; end if;
 update public.members set admin = true where room_id = target_room and user_id = target_user;
 if not found then raise exception 'Das Mitglied wurde nicht gefunden.'; end if;
end;
$$;
create function public.validate_shot_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
declare scale public.grinders;
begin
 if tg_op = 'UPDATE' then
  if new.grind_target is not distinct from old.grind_target and new.grinder_id is not distinct from old.grinder_id then return new; end if;
 end if;
 if new.grind_target is not null then
  select * into scale from public.grinders where id = new.grinder_id and room_id = new.room_id;
  if not found or new.grind_target < scale.minimum or new.grind_target > scale.maximum or mod(new.grind_target - scale.minimum, scale.step) <> 0 then
   raise exception 'Die Empfehlung liegt außerhalb der eingestellten Skala.' using errcode = '23514';
  end if;
 end if;
 return new;
end;
$$;
create trigger validate_shot_feedback before insert or update on public.shots for each row execute function public.validate_shot_feedback();
revoke all on function public.validate_shot_feedback() from public, anon, authenticated;
revoke all on function public.create_room_profile(uuid, text, boolean), public.promote_room_member(uuid, uuid) from public, anon;
grant execute on function public.create_room_profile(uuid, text, boolean), public.promote_room_member(uuid, uuid) to authenticated;
alter publication supabase_realtime add table public.members;
create or replace function public.set_profile_order(target_room uuid, profile_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare active_count integer;
begin
  if not public.in_room(target_room) then
    raise exception 'Nur Raummitglieder können Profile sortieren.';
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
  if not public.in_room(target.room_id) then
    raise exception 'Nur Raummitglieder können Profile löschen.';
  end if;
  if target.ever_used or exists (
    select 1 from public.shots where room_id = target.room_id and profile = target.name
  ) then
    raise exception 'Dieses Profil wurde bereits verwendet und kann nur archiviert werden.';
  end if;
  delete from public.profiles where id = target.id;
end;
$$;


commit;
