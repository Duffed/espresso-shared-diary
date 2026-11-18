begin;
create table public.bean_packages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null,
 bean_id uuid not null,
 quantity numeric not null check (quantity > 0 and quantity <= 100000 and quantity = round(quantity, 3)),
 carried_in numeric not null default 0 check (carried_in >= 0),
 closed_remaining numeric check (closed_remaining >= 0),
 transferred_out numeric not null default 0 check (transferred_out >= 0),
 opened_at timestamptz not null,
 closed_at timestamptz,
 close_reason text check (close_reason in ('finished', 'carried', 'discarded')),
 created_by uuid not null default auth.uid() references auth.users,
 foreign key (room_id, bean_id) references public.beans(room_id, id),
 unique (room_id, bean_id, id),
 check ((closed_at is null) = (close_reason is null)),
 check (closed_at is null or closed_at >= opened_at)
);
create unique index one_active_bean_package on public.bean_packages(room_id, bean_id) where closed_at is null;
create table public.package_adjustments (
 id uuid primary key,
 room_id uuid not null,
 bean_id uuid not null,
 package_id uuid not null,
 amount numeric not null,
 reason text not null check (length(trim(reason)) between 1 and 200),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users,
 foreign key (room_id, bean_id, package_id) references public.bean_packages(room_id, bean_id, id)
);
alter table public.bean_packages enable row level security;
alter table public.package_adjustments enable row level security;
revoke all on public.bean_packages, public.package_adjustments from anon, authenticated;
grant select on public.bean_packages, public.package_adjustments to authenticated;
create policy packages_read on public.bean_packages for select to authenticated using (public.in_room(room_id));
create policy adjustments_read on public.package_adjustments for select to authenticated using (public.in_room(room_id));
alter table public.shots add column package_id uuid;
alter table public.shots add constraint shot_package_bean_room foreign key (room_id, bean_id, package_id) references public.bean_packages(room_id, bean_id, id);
alter table public.shots add constraint shot_package_needs_bean check (package_id is null or bean_id is not null);
grant insert(package_id), update(package_id) on public.shots to authenticated;
create index shot_package on public.shots(package_id) where deleted_at is null;

create function public.package_balance(target uuid) returns numeric language sql stable security definer set search_path = '' as $$
 select p.quantity + p.carried_in
   + coalesce((select sum(a.amount) from public.package_adjustments a where a.package_id = p.id), 0)
   - coalesce((select sum(s.dose) from public.shots s where s.package_id = p.id and s.deleted_at is null), 0)
 from public.bean_packages p where p.id = target;
$$;
revoke all on function public.package_balance(uuid) from public, anon, authenticated;

create function public.open_bean_package(target_bean uuid, new_id uuid, grams numeric, opened timestamptz, expected_active uuid, remainder text default 'finished')
returns public.bean_packages language plpgsql security definer set search_path = '' as $$
declare b public.beans; previous public.bean_packages; result public.bean_packages; carry numeric := 0;
begin
 select * into b from public.beans where id = target_bean for update;
 if not found or not public.in_room(b.room_id) then raise exception 'Nur Raummitglieder können Packungen öffnen.'; end if;
 select * into result from public.bean_packages where id = new_id and bean_id = b.id;
 if found then return result; end if;
 if b.archived then raise exception 'Bitte die Bohne zuerst aktivieren.'; end if;
 if grams is null or grams <= 0 or grams > 100000 or grams <> round(grams, 3) or opened is null or opened > clock_timestamp() + interval '1 minute' then raise exception 'Prüfe Packungsmenge und Öffnungszeitpunkt.'; end if;
 if remainder is null or remainder not in ('finished', 'carried', 'discarded') then raise exception 'Wähle den Umgang mit dem Rest.'; end if;
 select * into previous from public.bean_packages where bean_id = b.id and closed_at is null;
 if previous.id is distinct from expected_active then raise exception 'Die aktive Packung wurde inzwischen geändert. Bitte neu laden.'; end if;
 if previous.id is not null then
   if opened <= previous.opened_at or exists(select 1 from public.shots where package_id = previous.id and deleted_at is null and brewed_at >= opened) then
     raise exception 'Die neue Packung muss nach den Bezügen der bisherigen Packung beginnen.';
   end if;
   if remainder = 'carried' then carry := greatest(0, public.package_balance(previous.id)); end if;
   update public.bean_packages set closed_at = opened, close_reason = remainder, closed_remaining = greatest(0, public.package_balance(previous.id)), transferred_out = carry where id = previous.id;
 end if;
 insert into public.bean_packages(id, room_id, bean_id, quantity, carried_in, opened_at)
 values(new_id, b.room_id, b.id, grams, carry, opened) returning * into result;
 return result;
end;
$$;

create function public.correct_package_stock(target_package uuid, correction_id uuid, remaining numeric, note text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.bean_packages;
begin
 select * into p from public.bean_packages where id = target_package;
 if not found or not public.in_room(p.room_id) then raise exception 'Nur Raummitglieder können Bestände korrigieren.'; end if;
 perform id from public.beans where id = p.bean_id for update;
 if exists(select 1 from public.package_adjustments where id = correction_id and package_id = p.id) then return; end if;
 select * into p from public.bean_packages where id = target_package;
 if p.closed_at is not null then raise exception 'Diese Packung ist bereits abgeschlossen.'; end if;
 if remaining is null or remaining < 0 or remaining > 100000 or remaining <> round(remaining, 3) then raise exception 'Prüfe den gemessenen Restbestand.'; end if;
 insert into public.package_adjustments(id, room_id, bean_id, package_id, amount, reason)
 values(correction_id, p.room_id, p.bean_id, p.id, remaining - public.package_balance(p.id), trim(note));
end;
$$;

create function public.create_bean_with_package(bean_key uuid, target_room uuid, bean_name text, bean_roaster text, bean_photo text, package_key uuid, grams numeric, opened timestamptz)
returns public.beans language plpgsql security definer set search_path = '' as $$
declare b public.beans;
begin
 if not public.in_room(target_room) then raise exception 'Nur Raummitglieder können Bohnen anlegen.'; end if;
 perform id from public.rooms where id = target_room for update;
 select * into b from public.beans where id = bean_key;
 if found then
   if b.room_id <> target_room then raise exception 'Ungültige Bohne.'; end if;
   return b;
 end if;
 insert into public.beans(id, room_id, name, roaster, photo_path) values(bean_key, target_room, trim(bean_name), trim(bean_roaster), bean_photo) returning * into b;
 perform public.open_bean_package(b.id, package_key, grams, opened, null, 'finished');
 return b;
end;
$$;

create function public.assign_shot_package() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.bean_packages;
begin
 -- Serialize consumption changes and transfers on the bean, including deletions.
 if tg_op = 'UPDATE' then
   perform id from public.beans where id in (old.bean_id, new.bean_id) order by id for update;
   if new.bean_id is not distinct from old.bean_id then
     if new.package_id is distinct from old.package_id then raise exception 'Die Packungszuordnung eines Bezugs bleibt erhalten.' using errcode = '23514'; end if;
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
create trigger assign_shot_package before insert or update on public.shots for each row execute function public.assign_shot_package();
revoke all on function public.assign_shot_package() from public, anon, authenticated;
revoke all on function public.open_bean_package(uuid, uuid, numeric, timestamptz, uuid, text), public.correct_package_stock(uuid, uuid, numeric, text), public.create_bean_with_package(uuid, uuid, text, text, text, uuid, numeric, timestamptz) from public, anon;
grant execute on function public.open_bean_package(uuid, uuid, numeric, timestamptz, uuid, text), public.correct_package_stock(uuid, uuid, numeric, text), public.create_bean_with_package(uuid, uuid, text, text, text, uuid, numeric, timestamptz) to authenticated;
alter publication supabase_realtime add table public.bean_packages, public.package_adjustments;
commit;
