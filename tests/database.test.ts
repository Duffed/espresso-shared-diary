import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '00000000-0000-0000-0000-000000000001'
const guest = '00000000-0000-0000-0000-000000000002'
const stranger = '00000000-0000-0000-0000-000000000003'
const grinder = '00000000-0000-0000-0000-000000000010'
const shot = '00000000-0000-0000-0000-000000000020'
const imported = '00000000-0000-0000-0000-000000000021'
const duplicate = '00000000-0000-0000-0000-000000000022'
const hash = 'a'.repeat(64)

test('migration enforces room isolation, one-time invites, ownership and import settings', async () => {
  const db = new PGlite()
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
    const login = async (user: string) => db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`)
    await login(admin)
    const { rows: [{ room }] } = await db.query<{ room: string }>("select create_room('Küche', 'Alex') as room")
    const createInvite = async () => (await db.query<{ id: string }>(
      'insert into invites (room_id) values ($1) returning id', [room],
    )).rows[0].id
    const invite = await createInvite()
    const revoked = await createInvite()
    await db.query('update invites set revoked_at = now() where id = $1', [revoked])
    await db.query("insert into grinders (id, room_id, brand, model, minimum, maximum, step) values ($1, $2, 'Eureka', 'Mignon', 0, 15, 0.1)", [grinder, room])
    const photo = room + '/muehle/foto.png'
    await db.query("insert into storage.objects values ('equipment', $1)", [photo])
    await db.query("insert into baskets (room_id, name, shape) values ($1, 'Eigenes Sieb', 'Konisch')", [room])

    await login(guest)
    assert.equal((await db.query('select * from rooms')).rows.length, 0)
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
    await assert.rejects(db.query("select accept_invite($1, 'Sam')", [revoked]), /Einladung/)
    await db.query("select accept_invite($1, 'Sam')", [invite])
    assert.equal((await db.query('select * from baskets')).rows.length, 1)
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1)
    assert.equal((await db.query('update rooms set gaggimate = true returning id')).rows.length, 0)
    assert.equal((await db.query('select * from invites')).rows.length, 0)

    const insertShot = (id: string, grind: number, key: string | null = null) =>
      db.query('insert into shots (id, room_id, brewed_at, grinder_id, grind, import_key) values ($1, $2, now(), $3, $4, $5)',
        [id, room, grinder, grind, key])
    await assert.rejects(insertShot(shot, 0.15), /Mahlgrad/)
    await insertShot(shot, 0.1)
    await assert.rejects(insertShot(shot, 0.1), /duplicate key/)
    await assert.rejects(insertShot(imported, 0.2, hash), /ausgeschaltet/)
    const own = await db.query<{ author_name: string; version: number }>('select author_name, version from shots')
    assert.deepEqual(own.rows, [{ author_name: 'Sam', version: 1 }])
    const updated = await db.query('update shots set dose = 18 where id = $1 and version = 1 returning version', [shot])
    assert.equal(updated.rows.length, 1)
    const stale = await db.query('update shots set dose = 19 where id = $1 and version = 1 returning version', [shot])
    assert.equal(stale.rows.length, 0)

    await login(admin)
    assert.equal((await db.query('select id from shots')).rows.length, 1)
    assert.equal((await db.query('update shots set dose = 19 returning id')).rows.length, 0)
    await db.query('update rooms set gaggimate = true where id = $1', [room])
    await login(guest)
    await insertShot(imported, 0.2, hash)
    await assert.rejects(insertShot(duplicate, 0.2, hash), /duplicate key/)
    await db.query('update shots set deleted_at = now() where id = $1 returning id', [shot])

    await login(admin)
    await db.query('update rooms set gaggimate = false where id = $1', [room])
    assert.deepEqual((await db.query('select id from shots')).rows, [{ id: imported }])
    await db.query('delete from members where user_id = $1', [guest])
    await login(guest)
    assert.equal((await db.query('select id from shots')).rows.length, 0)
    await assert.rejects(insertShot(duplicate, 0.3), /nicht mehr verfügbar/)
    await login(stranger)
    await assert.rejects(db.query("select accept_invite($1, 'Lee')", [invite]), /Einladung/)
    assert.equal((await db.query('select id from rooms')).rows.length, 0)
  } finally {
    await db.close()
  }
})
