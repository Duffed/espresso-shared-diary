begin;
create function public.edit_bean_package(target_package uuid, grams numeric, opened timestamptz, expected_quantity numeric, expected_opened timestamptz, expected_closed timestamptz)
returns public.bean_packages language plpgsql security definer set search_path = '' as $$
declare p public.bean_packages; previous public.bean_packages;
begin
 select * into p from public.bean_packages where id = target_package;
 if not found or not public.in_room(p.room_id) then raise exception 'Nur Raummitglieder können Packungen bearbeiten.'; end if;
 perform id from public.beans where id = p.bean_id for update;
 select * into p from public.bean_packages where id = target_package;
 if grams is null or grams <= 0 or grams > 100000 or grams <> round(grams, 3) or opened is null or opened > clock_timestamp() + interval '1 minute' then raise exception 'Prüfe Packungsmenge und Öffnungszeitpunkt.'; end if;
 if p.quantity = grams and p.opened_at = opened then return p; end if;
 if p.quantity is distinct from expected_quantity or p.opened_at is distinct from expected_opened or p.closed_at is distinct from expected_closed then
   raise exception 'Die Packung wurde inzwischen geändert. Bitte neu laden.';
 end if;
 if opened is distinct from p.opened_at then
   if (p.closed_at is not null and opened >= p.closed_at) or exists(select 1 from public.shots where package_id = p.id and brewed_at < opened) then
     raise exception 'Der Öffnungszeitpunkt muss vor den zugeordneten Bezügen und dem Packungsende liegen.';
   end if;
   select * into previous from public.bean_packages where bean_id = p.bean_id and opened_at < p.opened_at order by opened_at desc limit 1;
   if previous.id is not null then
     if opened <= previous.opened_at or exists(select 1 from public.shots where package_id = previous.id and brewed_at >= opened) then
       raise exception 'Der Öffnungszeitpunkt überschneidet sich mit der vorherigen Packung oder ihren Bezügen.';
     end if;
     -- Moving a shared boundary must not create gaps or overlapping pack intervals.
     update public.bean_packages set closed_at = opened where id = previous.id;
   end if;
 end if;
 update public.bean_packages set quantity = grams, opened_at = opened where id = p.id returning * into p;
 return p;
end;
$$;
revoke all on function public.edit_bean_package(uuid, numeric, timestamptz, numeric, timestamptz, timestamptz) from public, anon;
grant execute on function public.edit_bean_package(uuid, numeric, timestamptz, numeric, timestamptz, timestamptz) to authenticated;
commit;
