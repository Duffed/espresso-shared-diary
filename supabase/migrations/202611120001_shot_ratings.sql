begin;
alter table public.shots add column rating smallint check (rating between 1 and 5);
grant insert (rating), update (rating) on public.shots to authenticated;
commit;
