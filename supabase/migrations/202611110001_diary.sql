create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  gaggimate boolean not null default false
);

create table public.members (
  room_id uuid references public.rooms on delete cascade,
  user_id uuid references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  admin boolean not null default false,
  primary key (room_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  revoked_at timestamptz
);

create table public.grinders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  brand text not null check (length(trim(brand)) between 1 and 100),
  model text not null check (length(trim(model)) between 1 and 100),
  minimum numeric not null,
  maximum numeric not null,
  step numeric not null,
  photo_path text,
  image_url text check (image_url like 'https://imgs.search.brave.com/%'),
  source_url text check (source_url like 'https://%'),
  archived boolean not null default false,
  check (minimum between -100000 and 100000 and maximum between -100000 and 100000
    and maximum > minimum and step between 0.000001 and maximum - minimum),
  check (photo_path is null or split_part(photo_path, '/', 1) = room_id::text),
  unique (room_id, id)
);

create table public.baskets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  capacity numeric check (capacity > 0 and capacity < 1000),
  diameter numeric check (diameter > 0 and diameter < 1000),
  shape text not null default '' check (length(shape) <= 100),
  photo_path text,
  archived boolean not null default false,
  check (photo_path is null or split_part(photo_path, '/', 1) = room_id::text),
  unique (room_id, id)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  archived boolean not null default false
);

create table public.shots (
  id uuid primary key,
  room_id uuid not null references public.rooms on delete cascade,
  author_id uuid not null default auth.uid(),
  author_name text not null,
  brewed_at timestamptz not null,
  grinder_id uuid,
  basket_id uuid,
  grind numeric check (grind between -100000 and 100000),
  dose numeric check (dose > 0 and dose < 1000),
  temperature numeric check (temperature > 0 and temperature <= 150),
  output numeric check (output > 0 and output < 10000),
  duration numeric check (duration > 0 and duration < 86400),
  profile text check (length(profile) <= 150),
  import_key text check (import_key ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz,
  version bigint not null default 1,
  foreign key (room_id, grinder_id) references public.grinders (room_id, id),
  foreign key (room_id, basket_id) references public.baskets (room_id, id),
  unique (room_id, import_key),
  check (grind is null or grinder_id is not null)
);

create index shots_room_time on public.shots (room_id, brewed_at desc);
create index members_by_user on public.members (user_id);
create index invites_by_room on public.invites (room_id);

create function public.in_room(target uuid, admins_only boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where room_id = target and user_id = auth.uid() and (not admins_only or admin)
  );
$$;

create function public.create_room(room_name text, display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  insert into public.rooms (name) values (trim(room_name)) returning id into new_id;
  insert into public.members values (new_id, auth.uid(), trim(display_name), true);
  return new_id;
end;
$$;

create function public.accept_invite(token uuid, display_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invitation public.invites;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  select * into invitation from public.invites where id = token for update;
  if invitation.id is null or invitation.revoked_at is not null
     or invitation.used_at is not null or invitation.expires_at <= now() then
    raise exception 'Diese Einladung ist abgelaufen oder wurde bereits verwendet.';
  end if;
  if public.in_room(invitation.room_id) then return invitation.room_id; end if;
  insert into public.members values (invitation.room_id, auth.uid(), trim(display_name), false)
    on conflict (room_id, user_id) do nothing;
  if not found then return invitation.room_id; end if;
  update public.invites set used_at = now() where id = token;
  return invitation.room_id;
end;
$$;

create function public.prepare_shot()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare scale public.grinders;
declare allow_import boolean;
begin
  if tg_op = 'INSERT' then
    select name into new.author_name from public.members
    where room_id = new.room_id and user_id = auth.uid();
    if not found then raise exception 'Der Raum ist für dich nicht mehr verfügbar.' using errcode = '42501'; end if;
    if new.import_key is not null then
      select gaggimate into allow_import from public.rooms where id = new.room_id for share;
      if allow_import is distinct from true then
        raise exception 'GaggiMate ist in diesem Raum ausgeschaltet.' using errcode = '23514';
      end if;
    end if;
  else
    new.version := old.version + 1;
    if new.grinder_id is not distinct from old.grinder_id and new.grind is not distinct from old.grind then
      return new;
    end if;
  end if;
  if new.grind is not null then
    select * into scale from public.grinders where room_id = new.room_id and id = new.grinder_id;
    if not found or new.grind < scale.minimum or new.grind > scale.maximum
       or mod(new.grind - scale.minimum, scale.step) <> 0 then
      raise exception 'Der Mahlgrad liegt außerhalb der eingestellten Skala.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger prepare_shot before insert or update on public.shots
for each row execute function public.prepare_shot();

alter table public.rooms enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.grinders enable row level security;
alter table public.baskets enable row level security;
alter table public.profiles enable row level security;
alter table public.shots enable row level security;

revoke all on public.rooms, public.members, public.invites, public.grinders, public.baskets,
  public.profiles, public.shots from anon, authenticated;
grant select on public.rooms, public.members, public.invites, public.grinders, public.baskets,
  public.profiles, public.shots to authenticated;
grant update (name, gaggimate) on public.rooms to authenticated;
grant delete on public.members to authenticated;
grant insert (room_id), update (revoked_at) on public.invites to authenticated;
grant insert (id, room_id, brand, model, minimum, maximum, step, photo_path, image_url, source_url),
  update (brand, model, minimum, maximum, step, photo_path, image_url, source_url, archived)
  on public.grinders to authenticated;
grant insert (id, room_id, name, capacity, diameter, shape, photo_path),
  update (name, capacity, diameter, shape, photo_path, archived) on public.baskets to authenticated;
grant insert (room_id, name), update (name, archived) on public.profiles to authenticated;
grant insert (id, room_id, brewed_at, grinder_id, basket_id, grind, dose, temperature, output, duration, profile, import_key),
  update (brewed_at, grinder_id, basket_id, grind, dose, temperature, output, duration, profile, deleted_at)
  on public.shots to authenticated;

revoke execute on function public.in_room(uuid, boolean), public.create_room(text, text),
  public.accept_invite(uuid, text), public.prepare_shot() from public, anon;
grant execute on function public.in_room(uuid, boolean), public.create_room(text, text),
  public.accept_invite(uuid, text) to authenticated;

create policy rooms_read on public.rooms for select to authenticated using (public.in_room(id));
create policy rooms_edit on public.rooms for update to authenticated using (public.in_room(id, true));
create policy members_read on public.members for select to authenticated using (public.in_room(room_id));
create policy members_remove on public.members for delete to authenticated using (public.in_room(room_id, true) and not admin);
create policy invites_read on public.invites for select to authenticated using (public.in_room(room_id, true));
create policy invites_create on public.invites for insert to authenticated with check (public.in_room(room_id, true));
create policy invites_revoke on public.invites for update to authenticated
  using (public.in_room(room_id, true) and revoked_at is null and used_at is null)
  with check (public.in_room(room_id, true) and revoked_at is not null);
create policy grinders_read on public.grinders for select to authenticated using (public.in_room(room_id));
create policy grinders_manage on public.grinders for all to authenticated using (public.in_room(room_id, true));
create policy baskets_read on public.baskets for select to authenticated using (public.in_room(room_id));
create policy baskets_manage on public.baskets for all to authenticated using (public.in_room(room_id, true));
create policy profiles_read on public.profiles for select to authenticated using (public.in_room(room_id));
create policy profiles_manage on public.profiles for all to authenticated using (public.in_room(room_id, true));
create policy shots_read on public.shots for select to authenticated
  using (public.in_room(room_id) and (deleted_at is null or author_id = auth.uid()));
create policy shots_create on public.shots for insert to authenticated
  with check (public.in_room(room_id) and author_id = auth.uid());
create policy shots_edit on public.shots for update to authenticated
  using (public.in_room(room_id) and author_id = auth.uid() and deleted_at is null)
  with check (public.in_room(room_id) and author_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment', 'equipment', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy equipment_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'equipment' and public.in_room(((storage.foldername(name))[1])::uuid));
create policy equipment_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment' and public.in_room(((storage.foldername(name))[1])::uuid, true));
create policy equipment_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'equipment' and public.in_room(((storage.foldername(name))[1])::uuid, true));

alter publication supabase_realtime add table public.rooms, public.grinders, public.baskets, public.profiles, public.shots;
