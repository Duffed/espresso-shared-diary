begin;

alter table public.beans add column photo_path text;
alter table public.beans add constraint bean_photo_room check (
  photo_path is null or (
    split_part(photo_path, '/', 1) = room_id::text
    and split_part(photo_path, '/', 2) = id::text
    and photo_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'
  )
);
grant insert (photo_path), update (photo_path) on public.beans to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bean-photos', 'bean-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy bean_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'bean-photos' and public.in_room(((storage.foldername(name))[1])::uuid));
create policy bean_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bean-photos' and public.in_room(((storage.foldername(name))[1])::uuid));
create policy bean_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'bean-photos' and public.in_room(((storage.foldername(name))[1])::uuid));

commit;
