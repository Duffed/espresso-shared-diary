import { createClient } from '@supabase/supabase-js'
import { openDB, type DBSchema } from 'idb'
import type { Bean, Basket, Grinder, Invite, Member, Pending, Profile, Room, RoomData, Shot } from './model'
import { DiaryError } from './model'

export const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export const api = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://example.invalid',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'unconfigured',
  { auth: { flowType: 'pkce' } },
)

interface DiaryCache extends DBSchema {
  rooms: { key: string; value: Room[] }
  details: { key: [string, string]; value: RoomData }
  pending: { key: [string, string]; value: Pending }
}

const database = () => openDB<DiaryCache>('espresso-diary', 1, {
  upgrade(db) {
    db.createObjectStore('rooms')
    db.createObjectStore('details')
    db.createObjectStore('pending')
  },
})

export async function cachedRooms(user: string) {
  return (await database()).get('rooms', user)
}

export async function cachedRoom(user: string, room: string) {
  return (await database()).get('details', [user, room])
}

export async function loadRooms(user: string) {
  const { data, error } = await api.from('rooms').select('*').order('name').returns<Room[]>()
  if (error) throw error
  const db = await database()
  await db.put('rooms', data, user)
  const keys = await db.getAllKeys('details')
  await Promise.all(keys.filter(([owner, room]) => owner === user && !data.some(item => item.id === room))
    .map(key => db.delete('details', key)))
  return data
}

async function attachPhotos<T extends Grinder | Basket | Bean>(items: T[], previous: T[], bucket = 'equipment') {
  return Promise.all(items.map(async item => {
    if (!item.photo_path) return item
    const old = previous.find(photo => photo.photo_path === item.photo_path)?.photo
    if (old) return { ...item, photo: old }
    const { data } = await api.storage.from(bucket).download(item.photo_path)
    return data ? { ...item, photo: data } : item
  }))
}

export async function loadRoom(user: string, roomId: string): Promise<RoomData> {
  const db = await database()
  const room = await api.from('rooms').select('*').eq('id', roomId).maybeSingle<Room>()
  if (room.error) throw room.error
  if (!room.data) {
    await db.delete('details', [user, roomId])
    throw new DiaryError('Du hast keinen Zugriff mehr auf diesen Raum.')
  }
  const [members, invites, grinders, baskets, profiles, beans] = await Promise.all([
    api.from('members').select('*').eq('room_id', roomId).order('name').returns<Member[]>(),
    api.from('invites').select('*').eq('room_id', roomId).order('expires_at', { ascending: false }).returns<Invite[]>(),
    api.from('grinders').select('*').eq('room_id', roomId).order('brand').returns<Grinder[]>(),
    api.from('baskets').select('*').eq('room_id', roomId).order('name').returns<Basket[]>(),
    api.from('profiles').select('*').eq('room_id', roomId).order('name').returns<Profile[]>(),
    api.from('beans').select('*').eq('room_id', roomId).order('name').returns<Bean[]>(),
  ])
  for (const result of [members, invites, grinders, baskets, profiles]) {
    if (result.error) throw result.error
  }
  if (beans.error && !['42P01', 'PGRST205'].includes(beans.error.code)) throw beans.error
  if (!members.data?.some(member => member.user_id === user)) {
    await db.delete('details', [user, roomId])
    throw new DiaryError('Du hast keinen Zugriff mehr auf diesen Raum.')
  }
  const shots: Shot[] = []
  const pageSize = 200
  for (let start = 0; ; start += pageSize) {
    const page = await api.from('shots').select('*').eq('room_id', roomId).is('deleted_at', null)
      .order('brewed_at', { ascending: false }).order('id').range(start, start + pageSize - 1).returns<Shot[]>()
    if (page.error) throw page.error
    shots.push(...page.data)
    if (page.data.length < pageSize) break
  }
  const previous = await db.get('details', [user, roomId])
  const [grindersWithPhotos, basketsWithPhotos, beansWithPhotos] = await Promise.all([
    attachPhotos(grinders.data ?? [], previous?.grinders ?? []),
    attachPhotos(baskets.data ?? [], previous?.baskets ?? []),
    attachPhotos(beans.data ?? [], previous?.beans ?? [], 'bean-photos'),
  ])
  const data: RoomData = {
    room: room.data, members: members.data, invites: invites.data ?? [],
    grinders: grindersWithPhotos, baskets: basketsWithPhotos, profiles: profiles.data ?? [], shots, beans: beansWithPhotos,
  }
  await db.put('details', data, [user, roomId])
  return data
}

export async function pendingShots(user: string) {
  const items = await (await database()).getAll('pending')
  return items.filter(item => item.user === user)
}

export async function savePending(item: Pending) {
  await (await database()).put('pending', item, [item.user, item.shot.id])
}

export async function removePending(user: string, shot: string) {
  await (await database()).delete('pending', [user, shot])
}

export async function syncPending(user: string) {
  const items = await pendingShots(user)
  for (const item of items.filter(item => !item.error)) {
    const session = await api.auth.getSession()
    if (session.data.session?.user.id !== user || !navigator.onLine) break
    const result = await api.from('shots').insert(item.shot)
    if (!result.error) {
      await removePending(user, item.shot.id)
      continue
    }
    const { code, message } = result.error
    if (/^(22|23|P0001|42501)/.test(code)) {
      const existing = await api.from('shots').select('id,author_id').eq('id', item.shot.id).maybeSingle()
      if (existing.error) continue
      if (existing.data?.author_id === user) {
        await removePending(user, item.shot.id)
        continue
      }
      await savePending({
        ...item,
        error: code === '23505' ? 'Dieser GaggiMate-Bezug wurde bereits importiert.'
          : code === '42501' || message.includes('author_name') ? 'Der Raum ist für dich nicht mehr verfügbar.'
          : code === '23514' && !message.includes('constraint') ? message
          : 'Die Angaben passen nicht mehr zu den Einstellungen im Raum.',
      })
    }
  }
}
