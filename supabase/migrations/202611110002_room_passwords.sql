create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists diary_private;
revoke all on schema diary_private from public, anon, authenticated;

create table diary_private.room_passwords (
  room_id uuid primary key references public.rooms on delete cascade,
  password_hash text not null
);

create table diary_private.room_join_attempts (
  room_id uuid references diary_private.room_passwords on delete cascade,
  user_id uuid references auth.users on delete cascade,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (room_id, user_id)
);

alter table diary_private.room_passwords enable row level security;
alter table diary_private.room_join_attempts enable row level security;

create function public.set_room_password(target uuid, room_password text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.in_room(target, true) then
    raise exception 'Nur Raum-Admins können das Raumpasswort ändern.' using errcode = '42501';
  end if;
  if room_password is null or length(trim(room_password)) < 8 or octet_length(room_password) > 72 then
    raise exception 'Das Raumpasswort braucht mindestens 8 Zeichen und darf höchstens 72 Bytes lang sein.';
  end if;
  insert into diary_private.room_passwords (room_id, password_hash)
  values (target, extensions.crypt(room_password, extensions.gen_salt('bf', 10)))
  on conflict (room_id) do update set password_hash = excluded.password_hash;
end;
$$;

create function public.create_password_room(room_name text, display_name text, room_password text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  new_id := public.create_room(room_name, display_name);
  perform public.set_room_password(new_id, room_password);
  return new_id;
end;
$$;

create function public.join_password_room(target uuid, display_name text, room_password text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  stored_hash text;
  attempt_count integer;
  checked_at timestamptz := now();
begin
  if actor is null then raise exception 'Anmeldung erforderlich'; end if;
  if public.in_room(target) then return 'joined'; end if;
  if display_name is null or length(trim(display_name)) not between 1 and 80
     or room_password is null or length(trim(room_password)) < 8 or octet_length(room_password) > 72 then
    return 'invalid';
  end if;
  select password_hash into stored_hash from diary_private.room_passwords where room_id = target for share;
  if not found then return 'invalid'; end if;

  insert into diary_private.room_join_attempts as attempts (room_id, user_id, window_start, attempts)
  values (target, actor, checked_at, 1)
  on conflict (room_id, user_id) do update set
    attempts = case when attempts.window_start <= checked_at - interval '15 minutes'
      then 1 else least(attempts.attempts + 1, 6) end,
    window_start = case when attempts.window_start <= checked_at - interval '15 minutes'
      then checked_at else attempts.window_start end
  returning attempts.attempts into attempt_count;

  if attempt_count > 5 then return 'limited'; end if;
  if extensions.crypt(room_password, stored_hash) is distinct from stored_hash then return 'invalid'; end if;
  insert into public.members values (target, actor, trim(display_name), false)
    on conflict (room_id, user_id) do nothing;
  delete from diary_private.room_join_attempts where room_id = target and user_id = actor;
  return 'joined';
end;
$$;

revoke execute on function public.create_room(text, text), public.set_room_password(uuid, text),
  public.create_password_room(text, text, text), public.join_password_room(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_room_password(uuid, text),
  public.create_password_room(text, text, text), public.join_password_room(uuid, text, text)
  to authenticated;
