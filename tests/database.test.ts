import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const admin = '00000000-0000-0000-0000-000000000001'
const guest = '00000000-0000-0000-0000-000000000002'
const stranger = '00000000-0000-0000-0000-000000000003'
const grinder = '00000000-0000-0000-0000-000000000010'
const shot = '00000000-0000-0000-0000-000000000020'
const imported = '00000000-0000-0000-0000-000000000021'
const duplicate = '00000000-0000-0000-0000-000000000022'
const hash = 'a'.repeat(64)

test('migration enforces room isolation, one-time invites, ownership and import settings', async () => {
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

    const bean = (await db.query<{ id: string }>("insert into beans (room_id, name, roaster) values ($1, 'Casa', 'Rösterei') returning id", [room])).rows[0].id
    const beanPhoto = room + '/' + bean + '/00000000-0000-0000-0000-000000000099.png'
    await db.query("insert into storage.objects values ('bean-photos', $1)", [beanPhoto])
    await db.query('update beans set photo_path = $1 where id = $2', [beanPhoto, bean])
    await assert.rejects(db.query('update beans set photo_path = $1 where id = $2', [stranger + '/' + bean + '/00000000-0000-0000-0000-000000000099.png', bean]), /bean_photo_room/)
    await login(stranger)
    assert.equal((await db.query("select * from storage.objects where bucket_id = 'bean-photos'")).rows.length, 0)
    await assert.rejects(db.query("insert into storage.objects values ('bean-photos', $1)", [beanPhoto]), /row-level security/)
    assert.equal((await db.query("delete from storage.objects where bucket_id = 'bean-photos' returning name")).rows.length, 0)
    await login(guest)
    assert.equal((await db.query("select * from storage.objects where bucket_id = 'bean-photos'")).rows.length, 1)
    await db.query("delete from storage.objects where bucket_id = 'bean-photos'")
    await db.query('update beans set photo_path = null where id = $1', [bean])
    await login(stranger)
    assert.equal((await db.query('select * from beans')).rows.length, 0)
    await assert.rejects(db.query("insert into beans (room_id, name) values ($1, 'Fremd')", [room]), /row-level security/)
    await login(guest)
    const insertShot = (id: string, grind: number, key: string | null = null) =>
      db.query('insert into shots (id, room_id, brewed_at, grinder_id, grind, import_key) values ($1, $2, now(), $3, $4, $5)',
        [id, room, grinder, grind, key])
    await assert.rejects(insertShot(shot, 0.15), /Mahlgrad/)
    await insertShot(shot, 0.1)
    await db.query('update shots set bean_id = $1 where id = $2', [bean, shot])
    assert.equal((await db.query<{ bean_id: string }>('select bean_id from shots where id = $1', [shot])).rows[0].bean_id, bean)
    await assert.rejects(insertShot(shot, 0.1), /duplicate key/)
    await assert.rejects(insertShot(imported, 0.2, hash), /ausgeschaltet/)
    const own = await db.query<{ author_name: string; version: number }>('select author_name, version from shots')
    assert.deepEqual(own.rows, [{ author_name: 'Sam', version: 2 }])
    const updated = await db.query('update shots set dose = 18 where id = $1 and version = 2 returning version', [shot])
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
    assert.equal((await db.query('update shots set rating = 5 where id = $1 returning id', [imported])).rows.length, 0)
    await login(guest)
    for (const rating of [1, 5, null]) {
      const result = await db.query<{ rating: number | null }>('update shots set rating = $1 where id = $2 returning rating', [rating, imported])
      assert.equal(result.rows[0].rating, rating)
    }
    await assert.rejects(db.query('update shots set rating = 6 where id = $1', [imported]), /check constraint/)
    await assert.rejects(db.query('update shots set rating = 0 where id = $1', [imported]), /check constraint/)
    await login(admin)
    await db.query('delete from members where user_id = $1', [guest])
    await login(guest)
    assert.equal((await db.query('select id from shots')).rows.length, 0)
    await assert.rejects(insertShot(duplicate, 0.3), /nicht mehr verfügbar/)
    await login(stranger)
    await assert.rejects(db.query("select accept_invite($1, 'Lee')", [invite]), /Einladung/)
    assert.equal((await db.query('select id from rooms')).rows.length, 0)

    await db.exec('reset role')
    await db.exec(await readFile(new URL('../supabase/migrations/202611110002_room_passwords.sql', import.meta.url), 'utf8'))
    await login(admin)
    await assert.rejects(db.query("select create_password_room('Kurz', 'Alex', 'kurz')"), /8 Zeichen/)
    const { rows: [{ id: protectedRoom }] } = await db.query<{ id: string }>(
      "select create_password_room('Geteilt', 'Alex', 'Altes-Passwort') as id",
    )
    await assert.rejects(db.query('select password_hash from diary_private.room_passwords'), /permission denied/)
    await db.query("select set_room_password($1, 'Neues-Passwort')", [protectedRoom])
    await login(guest)
    assert.equal((await db.query('select id from rooms')).rows.length, 0)
    const join = async (password: string) => (await db.query(
      "select join_password_room($1, 'Sam', $2) as status", [protectedRoom, password],
    )).rows[0].status
    assert.equal(await join('Altes-Passwort'), 'invalid')
    assert.equal(await join('Neues-Passwort'), 'joined')
    assert.equal((await db.query('select id from rooms')).rows.length, 1)
    await assert.rejects(db.query("select set_room_password($1, 'Anderes-Passwort')", [protectedRoom]), /Raum-Admins/)
    await login(stranger)
    for (let i = 0; i < 5; i++) assert.equal(await join('Falsches-Passwort'), 'invalid')
    assert.equal(await join('Neues-Passwort'), 'limited')
    assert.equal((await db.query('select id from rooms')).rows.length, 0)
  } finally {
    await db.close()
  }
})
