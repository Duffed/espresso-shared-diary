import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const admin = '00000000-0000-0000-0000-000000000001'
const guest = '00000000-0000-0000-0000-000000000002'
const stranger = '00000000-0000-0000-0000-000000000003'
test('package inventory is isolated, atomic and retains historical shot ownership', async () => {
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

 await db.exec(await readFile(new URL('../supabase/migrations/202611130001_shared_profiles_shot_feedback.sql', import.meta.url), 'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/202611140001_bean_packages.sql', import.meta.url), 'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/202611140002_edit_bean_packages.sql', import.meta.url), 'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/202611140003_package_history.sql', import.meta.url), 'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/202611140004_edit_history_delete_packages.sql', import.meta.url), 'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/202611140005_delete_unused_beans.sql', import.meta.url), 'utf8'))
 const login = async (user: string) => db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`)
 const id = () => crypto.randomUUID()
 await login(admin)
 const room = (await db.query<{room:string}>("select create_room('Küche', 'Alex') as room")).rows[0].room
 const invite = (await db.query<{id:string}>('insert into invites(room_id) values($1) returning id', [room])).rows[0].id
 await login(guest)
 await db.query("select accept_invite($1, 'Sam')", [invite])
 const bean = (await db.query<{id:string}>("insert into beans(room_id,name) values($1,'Casa') returning id", [room])).rows[0].id
 const unused = (await db.query<{id:string}>("insert into beans(room_id,name) values($1,'Unused') returning id", [room])).rows[0].id
 await login(stranger)
 assert.equal((await db.query('delete from beans where id=$1 returning id', [unused])).rows.length, 0, 'Other rooms cannot delete beans')
 await login(guest)
 assert.equal((await db.query('delete from beans where id=$1 returning id', [unused])).rows.length, 1, 'Non-admin members can delete unused beans')
 const open = async (pack: string, grams: number, time: string, previous: string | null, mode = 'finished') => db.query('select * from open_bean_package($1,$2,$3,$4,$5,$6)', [bean, pack, grams, time, previous, mode])
 const historical = id()
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,18)', [historical,room,bean,'2025-12-31T12:00:00Z'])
 const p1 = id(), p2 = id(), shot = id()
 await open(p1, 500, '2026-01-01T00:00:00Z', null)
 await open(p1, 500, '2026-01-01T00:00:00Z', null)
 assert.equal((await db.query<{package_id:string|null}>('select package_id from shots where id=$1',[historical])).rows[0].package_id,null)
 assert.equal((await db.query('select * from bean_packages')).rows.length, 1, 'Retry is idempotent')
 await assert.rejects(open(id(),250,'2026-01-02T00:00:00Z',null), /inzwischen geändert/)
 await assert.rejects(db.query('update bean_packages set quantity=1'), /permission denied/)
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,18)', [shot,room,bean,'2026-01-02T12:00:00Z'])
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[shot])).rows[0].package_id,p1)
 await login(admin)
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,20)', [id(),room,bean,'2026-01-02T13:00:00Z'])
 await open(p2, 250, '2026-01-03T00:00:00Z', p1, 'carried')
 const packs = (await db.query<{id:string;carried_in:number;transferred_out:number}>('select * from bean_packages order by opened_at')).rows
 assert.equal(Number(packs[0].transferred_out),462)
 assert.equal(Number(packs[1].carried_in),462)
 assert.equal((await db.query('select * from bean_packages where closed_at is null')).rows.length,1)
 await assert.rejects(open(id(),250,'2026-01-04T00:00:00Z',p1),/inzwischen geändert/)
 // A delayed offline write belongs to its original pack, not the currently active one.
 const offline = id()
 await db.query('insert into shots(id,room_id,bean_id,package_id,brewed_at,dose) values($1,$2,$3,$4,$5,10)',[offline,room,bean,p1,'2026-01-02T14:00:00Z'])
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[offline])).rows[0].package_id,p1)
 await login(guest)
 await db.query('update shots set dose=19 where id=$1',[shot])
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[shot])).rows[0].package_id,p1)
 await assert.rejects(db.query('update shots set package_id=$1 where id=$2',[p2,shot]), /bleibt erhalten/)
 await db.query('update shots set deleted_at=now() where id=$1',[shot])
 const adjustment=id()
 await db.query("select correct_package_stock($1,$2,700,'Nachgewogen')",[p2,adjustment])
 await db.query("select correct_package_stock($1,$2,700,'Nachgewogen')",[p2,adjustment])
 assert.equal((await db.query('select * from package_adjustments')).rows.length,1)
 assert.equal(Number((await db.query<{amount:number}>('select amount from package_adjustments')).rows[0].amount),-12)
 const p3=id()
 await open(p3,1000,'2026-01-04T00:00:00Z',p2)
 assert.equal(Number((await db.query<{carried_in:number}>('select carried_in from bean_packages where id=$1',[p3])).rows[0].carried_in),0)
 await assert.rejects(db.query("select correct_package_stock($1,$2,500,'Alt')",[p2,id()]),/abgeschlossen/)
 await assert.rejects(open(id(),0,'2026-01-05T00:00:00Z',p3),/Packungsmenge/)
 const newBean=id(), newPack=id()
 await db.query("select create_bean_with_package($1,$2,'Neu','Röster',null,$3,250,'2026-01-01')",[newBean,room,newPack])
 await db.query("select create_bean_with_package($1,$2,'Neu','Röster',null,$3,250,'2026-01-01')",[newBean,room,newPack])
 await assert.rejects(db.query("select create_bean_with_package($1,$2,'Ungültig','',null,$3,-1,'2026-01-01')",[id(),room,id()]),/Packungsmenge/)
 await assert.rejects(db.query('delete from beans where id=$1', [bean]), /foreign key/i)
 assert.equal((await db.query("select * from beans where name='Ungültig'")).rows.length,0, 'Bean and first pack are atomic')
 const stale = id()
 await db.query('insert into shots(id,room_id,bean_id,package_id,brewed_at,dose) values($1,$2,$3,$4,$5,5)',[stale,room,bean,p1,'2026-01-05T12:00:00Z'])
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[stale])).rows[0].package_id,p3,'Stale offline pack resolves to the correct opening interval')
 await assert.rejects(db.query('insert into shots(id,room_id,bean_id,package_id,brewed_at,dose) values($1,$2,$3,$4,$5,5)',[id(),room,newBean,p3,'2026-01-05T12:00:00Z']),/passt nicht/)
 const edit = async (pack:string, grams:number, opened:string) => {
   const current = (await db.query<{quantity:number;opened_at:string;closed_at:string|null}>('select * from bean_packages where id=$1',[pack])).rows[0]
   return db.query('select * from edit_bean_package($1,$2,$3,$4,$5,$6)',[pack,grams,opened,current.quantity,current.opened_at,current.closed_at])
 }
 await edit(p1,600,'2025-12-30T00:00:00Z')
 assert.equal(Number((await db.query<{quantity:number}>('select quantity from bean_packages where id=$1',[p1])).rows[0].quantity),600)
 assert.equal(Number((await db.query<{carried_in:number}>('select carried_in from bean_packages where id=$1',[p2])).rows[0].carried_in),462,'Historical transfer stays fixed')
 await edit(p3,1200,'2026-01-04T01:00:00Z')
 assert.equal(new Date((await db.query<{closed_at:string}>('select closed_at from bean_packages where id=$1',[p2])).rows[0].closed_at).toISOString(),'2026-01-04T01:00:00.000Z')
 await assert.rejects(edit(p3,1200,'2026-01-06T00:00:00Z'),/zugeordneten Bezügen/)
 await assert.rejects(edit(p3,1200,'2026-01-02T00:00:00Z'),/vorherigen Packung/)
 await assert.rejects(edit(p1,0,'2025-12-30T00:00:00Z'),/Packungsmenge/)
 await assert.rejects(db.query("select edit_bean_package($1,1300,'2026-01-04',1000,'2026-01-04',null)",[p3]),/inzwischen geändert/)
 const historyBean = (await db.query<{id:string}>("insert into beans(room_id,name) values($1,'Historisch') returning id",[room])).rows[0].id
 const early=id(), firstShot=id(), secondShot=id(), deleted=id(), hp1=id(), hp2=id(), hp3=id()
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,10)',[early,room,historyBean,'2026-01-01'])
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,18)',[firstShot,room,historyBean,'2026-01-03'])
 await login(admin)
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,20)',[secondShot,room,historyBean,'2026-01-04'])
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,20)',[deleted,room,historyBean,'2026-01-04'])
 await db.query('update shots set deleted_at=now() where id=$1',[deleted])
 await login(guest)
 const historyOpen = (pid:string, date:string, previous:string|null, include:boolean, mode='finished') => db.query('select * from open_bean_package_with_history($1,$2,500,$3,$4,$5,$6)',[historyBean,pid,date,previous,mode,include])
 await historyOpen(hp1,'2026-01-02',null,true)
 const rows = (await db.query<{id:string;package_id:string|null;author_id:string;version:number}>('select id,package_id,author_id,version from shots where bean_id=$1',[historyBean])).rows
 assert.equal(rows.find(s=>s.id===early)!.package_id,null)
 assert.equal(rows.find(s=>s.id===deleted),undefined)
 assert.equal(rows.find(s=>s.id===firstShot)!.package_id,hp1)
 assert.equal(rows.find(s=>s.id===secondShot)!.package_id,hp1)
 assert.equal(rows.find(s=>s.id===secondShot)!.author_id,admin,'Author stays unchanged during room-wide reassignment')
 await historyOpen(hp1,'2026-01-02',null,true)
 assert.equal((await db.query<{version:number}>('select version from shots where id=$1',[secondShot])).rows[0].version,rows.find(s=>s.id===secondShot)!.version,'Retry does not reapply history')
 await historyOpen(hp2,'2026-01-04',hp1,true,'carried')
 assert.equal(Number((await db.query<{carried_in:number}>('select carried_in from bean_packages where id=$1',[hp2])).rows[0].carried_in),482,'Rest excludes shots that move into the new pack')
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[secondShot])).rows[0].package_id,hp2)
 const later=id()
 await db.query('insert into shots(id,room_id,bean_id,brewed_at,dose) values($1,$2,$3,$4,19)',[later,room,historyBean,'2026-01-06'])
 await historyOpen(hp3,'2026-01-05',hp2,false)
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[later])).rows[0].package_id,hp2,'No keeps existing assignments')
 await assert.rejects(db.query('update shots set package_id=$1 where id=$2',[hp3,later]),/bleibt erhalten/)
 await assert.rejects(db.query('select * from package_shot_moves'),/permission denied/)
 await assert.rejects(db.query('insert into package_shot_moves values($1,$2,txid_current())',[later,hp3]),/permission denied/)
 const editHistory = async (pack:string, date:string, include:boolean) => {
   const current = (await db.query<{quantity:number;opened_at:string;closed_at:string|null}>('select * from bean_packages where id=$1',[pack])).rows[0]
   return db.query('select * from edit_bean_package_with_history($1,$2,$3,$2,$4,$5,$6)',[pack,current.quantity,date,current.opened_at,current.closed_at,include])
 }
 await editHistory(hp1,'2025-12-31',false)
 assert.equal((await db.query<{package_id:string|null}>('select package_id from shots where id=$1',[early])).rows[0].package_id,null)
 await editHistory(hp1,'2025-12-31',true)
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[early])).rows[0].package_id,hp1,'Existing closed pack can include unassigned history without changing its date')
 assert.equal((await db.query<{package_id:string}>('select package_id from shots where id=$1',[secondShot])).rows[0].package_id,hp2,'Other packs stay untouched')
 const deletePack = async (pack:string) => {
   const current = (await db.query<{quantity:number;opened_at:string;closed_at:string|null}>('select * from bean_packages where id=$1',[pack])).rows[0]
   return db.query('select delete_bean_package($1,$2,$3,$4)',[pack,current.quantity,current.opened_at,current.closed_at])
 }
 const totalBefore = Number((await db.query<{dose:number}>('select sum(dose) dose from shots')).rows[0].dose)
 await assert.rejects(db.query('delete from bean_packages where id=$1',[hp1]),/permission denied/)
 await deletePack(hp1)
 assert.equal((await db.query<{package_id:string|null}>('select package_id from shots where id=$1',[early])).rows[0].package_id,null)
 assert.equal(Number((await db.query<{carried_in:number}>('select carried_in from bean_packages where id=$1',[hp2])).rows[0].carried_in),0,'Outgoing transfer is removed from its successor')
 await deletePack(p2)
 assert.equal(Number((await db.query<{transferred_out:number}>('select transferred_out from bean_packages where id=$1',[p1])).rows[0].transferred_out),0,'Incoming transfer is removed from predecessor')
 assert.equal((await db.query('select * from package_adjustments where package_id=$1',[p2])).rows.length,0)
 await deletePack(hp3)
 await db.query("select delete_bean_package($1,500,'2026-01-05',null)",[hp3])
 assert.equal((await db.query('select * from bean_packages where bean_id=$1 and closed_at is null',[historyBean])).rows.length,0)
 assert.equal(Number((await db.query<{dose:number}>('select sum(dose) dose from shots')).rows[0].dose),totalBefore,'Deletion preserves the room consumption and shots')
 const queuedAfterDeletion=id()
 await db.query('insert into shots(id,room_id,bean_id,package_id,brewed_at,dose) values($1,$2,$3,$4,$5,12)',[queuedAfterDeletion,room,historyBean,hp3,'2026-01-07'])
 assert.equal((await db.query<{package_id:string|null}>('select package_id from shots where id=$1',[queuedAfterDeletion])).rows[0].package_id,null,'Offline shot referencing deleted pack still syncs')
 await assert.rejects(historyOpen(id(),'2026-01-04',null,false),/überschneidet/)
 await login(stranger)
 await assert.rejects(db.query("select delete_bean_package($1,1200,'2026-01-04',null)",[p3]),/Raummitglieder/)
 await assert.rejects(db.query("select edit_bean_package_with_history($1,1200,'2026-01-04',1200,'2026-01-04',null,true)",[p3]),/Raummitglieder/)

 await assert.rejects(db.query("select edit_bean_package($1,1300,'2026-01-04',1200,'2026-01-04T01:00:00Z',null)",[p3]),/Raummitglieder/)

 assert.equal((await db.query('select * from bean_packages')).rows.length,0)
 assert.equal((await db.query('select * from package_adjustments')).rows.length,0)
 await assert.rejects(open(id(),250,'2026-01-05T00:00:00Z',p3),/Raummitglieder/)
 await assert.rejects(db.query("select correct_package_stock($1,$2,0,'Fremd')",[p3,id()]),/Raummitglieder/)
 } finally { await db.close() }
})
