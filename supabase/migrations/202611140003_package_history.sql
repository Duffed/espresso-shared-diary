begin;
-- Private, transaction-scoped authorization for the explicit room-wide reassignment.
create table public.package_shot_moves (
 shot_id uuid primary key, target_package uuid not null, transaction_id bigint not null
);
alter table public.package_shot_moves enable row level security;
revoke all on public.package_shot_moves from public, anon, authenticated;

create function public.open_bean_package_with_history(target_bean uuid, new_id uuid, grams numeric, opened timestamptz, expected_active uuid, remainder text, include_existing boolean)
returns public.bean_packages language plpgsql security definer set search_path = '' as $$
declare b public.beans; previous public.bean_packages; result public.bean_packages; carry numeric := 0; balance numeric := 0; selected uuid[];
begin
 if include_existing is null then raise exception 'Bitte wähle, ob bisherige Bezüge einbezogen werden sollen.'; end if;
 select * into b from public.beans where id = target_bean for update;
 if not found or not public.in_room(b.room_id) then raise exception 'Nur Raummitglieder können Packungen öffnen.'; end if;
 select * into result from public.bean_packages where id = new_id and bean_id = b.id;
 if found then return result; end if;
 if b.archived then raise exception 'Bitte die Bohne zuerst aktivieren.'; end if;
 if grams is null or grams <= 0 or grams > 100000 or grams <> round(grams, 3) or opened is null or opened > clock_timestamp() + interval '1 minute' then raise exception 'Prüfe Packungsmenge und Öffnungszeitpunkt.'; end if;
 if remainder is null or remainder not in ('finished','carried','discarded') then raise exception 'Wähle den Umgang mit dem Rest.'; end if;
 select * into previous from public.bean_packages where bean_id = b.id and closed_at is null;
 if previous.id is distinct from expected_active then raise exception 'Die aktive Packung wurde inzwischen geändert. Bitte neu laden.'; end if;
 if previous.id is not null then
   if opened <= previous.opened_at then raise exception 'Die neue Packung muss nach dem Öffnungsdatum der bisherigen Packung beginnen.'; end if;
   if include_existing and exists(select 1 from public.package_adjustments where package_id = previous.id and created_at >= opened) then
     raise exception 'Die neue Packung kann nicht vor einer Bestandskorrektur der bisherigen Packung beginnen. Bitte den Bestand zuerst prüfen.';
   end if;
   if include_existing and exists(select 1 from public.shots where package_id = previous.id and deleted_at is null and brewed_at > clock_timestamp()) then
     raise exception 'Die neue Packung kann wegen zukünftiger Bezüge der bisherigen Packung noch nicht geöffnet werden.';
   end if;
 end if;
 select coalesce(array_agg(id), '{}'::uuid[]) into selected from public.shots
 where include_existing and room_id = b.room_id and bean_id = b.id and deleted_at is null and brewed_at >= opened and brewed_at <= clock_timestamp()
 and (package_id is null or package_id = previous.id);
 if previous.id is not null then
   balance := greatest(0, public.package_balance(previous.id) + coalesce((select sum(dose) from public.shots where id = any(selected) and package_id = previous.id),0));
   if remainder = 'carried' then carry := balance; end if;
   update public.bean_packages set closed_at = opened, close_reason = remainder, closed_remaining = balance, transferred_out = carry where id = previous.id;
 end if;
 insert into public.bean_packages(id,room_id,bean_id,quantity,carried_in,opened_at) values(new_id,b.room_id,b.id,grams,carry,opened) returning * into result;
 insert into public.package_shot_moves(shot_id,target_package,transaction_id) select unnest(selected), new_id, txid_current();
 update public.shots set package_id = new_id where id = any(selected);
 delete from public.package_shot_moves where transaction_id = txid_current();
 return result;
end;
$$;
revoke all on function public.open_bean_package_with_history(uuid,uuid,numeric,timestamptz,uuid,text,boolean) from public, anon;
grant execute on function public.open_bean_package_with_history(uuid,uuid,numeric,timestamptz,uuid,text,boolean) to authenticated;
create or replace function public.assign_shot_package() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.bean_packages;
begin
 -- Serialize consumption changes and transfers on the bean, including deletions.
 if tg_op = 'UPDATE' then
   perform id from public.beans where id in (old.bean_id, new.bean_id) order by id for update;
   if new.bean_id is not distinct from old.bean_id then
     if new.package_id is distinct from old.package_id and not exists(select 1 from public.package_shot_moves m where m.shot_id = new.id and m.target_package = new.package_id and m.transaction_id = txid_current()) then raise exception 'Die Packungszuordnung eines Bezugs bleibt erhalten.' using errcode = '23514'; end if;
     return new;
   end if;
   new.package_id := null;
 else
   perform id from public.beans where id = new.bean_id for update;
 end if;
 if new.package_id is null then
   select id into new.package_id from public.bean_packages where room_id = new.room_id and bean_id = new.bean_id
     and opened_at <= new.brewed_at and (closed_at is null or new.brewed_at < closed_at) order by opened_at desc limit 1;
 else
   select * into p from public.bean_packages where id = new.package_id;
   if not found or p.room_id <> new.room_id or p.bean_id is distinct from new.bean_id then
     raise exception 'Die Packung passt nicht zu Bohne oder Bezugszeitpunkt.' using errcode = '23514';
   end if;
   if new.brewed_at < p.opened_at or (p.closed_at is not null and new.brewed_at >= p.closed_at) then
     select id into new.package_id from public.bean_packages where room_id = new.room_id and bean_id = new.bean_id
       and opened_at <= new.brewed_at and (closed_at is null or new.brewed_at < closed_at) order by opened_at desc limit 1;
   end if;
 end if;
 return new;
end;
$$;

commit;
