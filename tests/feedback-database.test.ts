import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const admin = '00000000-0000-0000-0000-000000000001'
const guest = '00000000-0000-0000-0000-000000000002'
const stranger = '00000000-0000-0000-0000-000000000003'
test('shared profiles, feedback constraints, migration and promotion permissions', async () => {
 const db = new PGlite({ extensions: { pgcrypto } })
 try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      create table storage.buckets (id text, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
      create table storage.objects (bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as
        $$ select string_to_array($1, '/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
      create publication supabase_realtime;
      insert into auth.users values ('${admin}'), ('${guest}'), ('${stranger}');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611110001_diary.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611110003_beans.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611110004_bean_photos.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611120001_shot_ratings.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611120002_profile_management.sql', import.meta.url), 'utf8'))

 const login = async (user: string) => db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`)
 await login(admin)
 const room = (await db.query<{ room: string }>("select create_room('Küche', 'Alex') as room")).rows[0].room
 const other = (await db.query<{ room: string }>("select create_room('Andere Küche', 'Alex') as room")).rows[0].room
 const invite = (await db.query<{ id: string }>('insert into invites (room_id) values ($1) returning id', [room])).rows[0].id
 await db.query("insert into shots (id, room_id, brewed_at, profile) values (gen_random_uuid(), $1, now(), 'Alt Freitext')", [room])
 await db.query("insert into profiles (room_id, name) values ($1, 'Archiv')", [room])
 await db.query("update profiles set archived = true where name = 'Archiv'")
 await db.query("insert into shots (id, room_id, brewed_at, profile) values (gen_random_uuid(), $1, now(), 'Archiv')", [room])
 await db.exec('reset role')
 await db.exec(await readFile(new URL('../supabase/migrations/202611130001_shared_profiles_shot_feedback.sql', import.meta.url), 'utf8'))
 await login(guest)
 await db.query("select accept_invite($1, 'Sam')", [invite])
 const free = (await db.query<{ ever_used: boolean }>("select ever_used from profiles where name = 'Alt Freitext'")).rows[0]
 assert.equal(free.ever_used, true)
 assert.equal((await db.query<{ archived: boolean }>("select archived from profiles where name = 'Archiv'")).rows[0].archived, true)
 await assert.rejects(db.query('select promote_room_member($1, $2)', [room, guest]), /Raum-Admins/)
 await assert.rejects(db.query("select create_room_profile($1, 'Fremd', false)", [other]), /Raummitglieder/)
 const create = () => db.query<{ id: string }>("select id from create_room_profile($1, 'Flow', true)", [room])
 const results = await Promise.all([create(), create()])
 assert.equal(results[0].rows[0].id, results[1].rows[0].id)
 assert.equal((await db.query("select id from profiles where name = 'Flow'")).rows.length, 1)
 const profile = results[0].rows[0].id
 await db.query('select set_profile_order($1, $2::uuid[])', [room, [profile, (await db.query<{id: string}>("select id from profiles where name = 'Alt Freitext'")).rows[0].id]])
 await db.query('update profiles set flow_based = false, archived = true where id = $1', [profile])
 await assert.rejects(create(), /archiviert/)
 await db.query('update profiles set archived = false, flow_based = true where id = $1', [profile])
 await login(admin)
 const grinder = (await db.query<{id: string}>("insert into grinders (room_id, brand, model, minimum, maximum, step) values ($1, 'Test', 'Mühle', 0, 15, 0.1) returning id", [room])).rows[0].id
 await login(guest)
 const bean = (await db.query<{id: string}>("insert into beans (room_id, name, roaster) values ($1, 'Bohne', '') returning id", [room])).rows[0].id
 const shot = (await db.query<{id: string}>("insert into shots (id, room_id, brewed_at, profile, bean_id, grinder_id, grind, note, flow_based, max_pressure, grind_advice, grind_target) values (gen_random_uuid(), $1, now(), 'Flow', $2, $3, 3, 'Süß', true, 8.5, 'exact', 3.2) returning id", [room, bean, grinder])).rows[0].id
 await db.query('update profiles set flow_based = false where id = $1', [profile])
 assert.equal((await db.query<{flow_based: boolean}>('select flow_based from shots where id = $1', [shot])).rows[0].flow_based, true)
 await assert.rejects(db.query('select delete_unused_profile($1)', [profile]), /bereits verwendet/)
 const unused = (await db.query<{id: string}>("select id from create_room_profile($1, 'Unbenutzt', false)", [room])).rows[0].id
 await db.query('select delete_unused_profile($1)', [unused])
 await assert.rejects(db.query('update shots set max_pressure = 31 where id = $1', [shot]), /check constraint/)
 await assert.rejects(db.query("update shots set note = repeat('x', 2001) where id = $1", [shot]), /check constraint/)
 await assert.rejects(db.query('update shots set grind_target = 3.25 where id = $1', [shot]), /Skala/)
 await assert.rejects(db.query("update shots set grind_advice = 'coarser' where id = $1", [shot]), /check constraint/)
 await assert.rejects(db.query('update shots set bean_id = null where id = $1', [shot]), /check constraint/)
 await login(admin)
 assert.equal((await db.query("update shots set note = 'Fremd' where id = $1 returning id", [shot])).rows.length, 0)
 await assert.rejects(db.query('select promote_room_member($1, $2)', [other, guest]), /nicht gefunden/)
 await db.query('select promote_room_member($1, $2)', [room, guest])
 await db.query('select promote_room_member($1, $2)', [room, guest])
 await login(guest)
 assert.equal((await db.query<{admin: boolean}>('select admin from members where room_id = $1 and user_id = $2', [room, guest])).rows[0].admin, true)
 await assert.rejects(db.query('update members set admin = false where room_id = $1', [room]), /permission denied/)
 await login(stranger)
 assert.equal((await db.query('select * from profiles')).rows.length, 0)
 await assert.rejects(db.query('select promote_room_member($1, $2)', [room, stranger]), /Raum-Admins/)
 } finally { await db.close() }
})
