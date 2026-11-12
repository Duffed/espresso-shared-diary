create table public.beans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  roaster text not null default '' check (length(roaster) <= 100),
  archived boolean not null default false,
  unique (room_id, id)
);
alter table public.beans enable row level security;
grant select on public.beans to authenticated;
grant insert (id, room_id, name, roaster), update (name, roaster, archived) on public.beans to authenticated;
create policy beans_read on public.beans for select to authenticated using (public.in_room(room_id));
create policy beans_create on public.beans for insert to authenticated with check (public.in_room(room_id));
create policy beans_edit on public.beans for update to authenticated using (public.in_room(room_id)) with check (public.in_room(room_id));
alter table public.shots add column bean_id uuid;
alter table public.shots add constraint shot_bean_room foreign key (room_id, bean_id) references public.beans(room_id, id);
grant insert (bean_id), update (bean_id) on public.shots to authenticated;
alter publication supabase_realtime add table public.beans;
