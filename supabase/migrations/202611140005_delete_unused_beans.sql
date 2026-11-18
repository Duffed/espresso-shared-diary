-- Existing foreign keys from shots and bean_packages reject deletion of used
-- beans, including concurrent inserts. Room membership is enforced by RLS.
grant delete on public.beans to authenticated;
create policy beans_delete on public.beans for delete to authenticated
  using (public.in_room(room_id));
