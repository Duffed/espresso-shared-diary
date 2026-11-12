export type Room = { id: string; name: string; gaggimate: boolean }
export type Member = { room_id: string; user_id: string; name: string; admin: boolean }
export type Invite = { id: string; expires_at: string; used_at: string | null; revoked_at: string | null }
export type ImageResult = { image_url: string; source_url: string; title: string }
type Equipment = { id: string; room_id: string; archived: boolean; photo_path: string | null; photo?: Blob }
export type Grinder = Equipment & {
  brand: string; model: string; minimum: number; maximum: number; step: number
  image_url: string | null; source_url: string | null
}
export type Basket = Equipment & { name: string; capacity: number | null }
export type Profile = { id: string; name: string; archived: boolean }
export type Bean = { id: string; room_id: string; name: string; roaster: string; archived: boolean; photo_path?: string | null; photo?: Blob }
export type ShotFields = {
  rating?: number | null
  bean_id?: string | null
  brewed_at: string; grinder_id: string | null; basket_id: string | null; grind: number | null
  dose: number | null; temperature: number | null; output: number | null; duration: number | null
  profile: string | null
}
export type NewShot = ShotFields & { id: string; room_id: string; import_key: string | null }
export type Shot = NewShot & { author_id: string; author_name: string; version: number }
export type RoomData = {
  room: Room; members: Member[]; invites: Invite[]; grinders: Grinder[]
  baskets: Basket[]; profiles: Profile[]; shots: Shot[]; beans?: Bean[]
}
export type Pending = { user: string; shot: NewShot; author: string; error?: string }

export function decimal(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const value = String(raw).trim().replace(',', '.')
  if (!/^[+-]?(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function scaled(value: number) {
  return Math.round(value * 1_000_000)
}

export function onScale(value: number, minimum: number, maximum: number, step: number) {
  return step > 0 && value >= minimum && value <= maximum
    && (scaled(value) - scaled(minimum)) % scaled(step) === 0
}

export function stepGrind(value: number | null, scale: Pick<Grinder, 'minimum' | 'maximum' | 'step'>, direction: number) {
  if (value === null) return scale.minimum
  const offset = scaled(value) - scaled(scale.minimum)
  const step = scaled(scale.step)
  const index = direction > 0 ? Math.floor(offset / step) + 1 : Math.ceil(offset / step) - 1
  const lastIndex = Math.floor((scaled(scale.maximum) - scaled(scale.minimum)) / step)
  return (scaled(scale.minimum) + Math.min(lastIndex, Math.max(0, index)) * step) / 1_000_000
}

export const formatNumber = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 6, useGrouping: false })
export const grinderName = (item: Grinder) => item.brand + ' ' + item.model

export class DiaryError extends Error {}

export function validateRoomPassword(password: string) {
  if ([...password.trim()].length < 8 || new TextEncoder().encode(password).length > 72) {
    throw new DiaryError('Das Raumpasswort braucht mindestens 8 Zeichen und darf höchstens 72 Bytes lang sein.')
  }
}

export async function parseGaggiMate(raw: string): Promise<{
  fields: Partial<ShotFields>; importKey: string; incomplete: boolean
}> {
  let data
  try { data = JSON.parse(raw) } catch { throw new DiaryError('Die Datei enthält kein gültiges JSON.') }
  const id = data?.id
  const time = data?.timestamp
  if (!/^\d+$/.test(typeof id === 'string' ? id : '') || !Number.isSafeInteger(time) || time <= 0
      || !Number.isInteger(data.version) || typeof data.profile !== 'string'
      || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || !Array.isArray(data.samples)) {
    throw new DiaryError('Bitte wähle einen Bezugsexport aus der GaggiMate-Historie.')
  }
  const date = new Date(time * 1000)
  if (!Number.isFinite(date.getTime())) throw new DiaryError('Der Zeitpunkt in der Datei ist ungültig.')
  const positive = (value: unknown, max: number) => {
    const number = decimal(value)
    return number !== null && number > 0 && number < max ? number : null
  }
  const temperature = data.samples.find((sample: { tt?: number } | null) => positive(sample?.tt, 150.000001) !== null)?.tt
  const key = [id.replace(/^0+(?=\d)/, ''), time, data.profileId ?? data.profile, data.duration]
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(key)))
  return {
    fields: {
      brewed_at: date.toISOString(),
      profile: data.profile.trim().slice(0, 150) || null,
      duration: positive(data.duration / 1000, 86400),
      temperature: positive(temperature, 150.000001),
      output: positive(data.notes?.doseOut, 10000) ?? positive(data.volume, 10000),
      dose: positive(data.notes?.doseIn, 1000),
    },
    importKey: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''),
    incomplete: data.incomplete === true || data.duration <= 0 || data.trailingBytes > 0,
  }
}
