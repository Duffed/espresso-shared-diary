import type { Bean, Shot } from './model'

export type HistoryFilter = { search: string; bean: string; author: string; profile: string; from: string; to: string }
export const emptyHistoryFilter: HistoryFilter = { search: '', bean: '', author: '', profile: '', from: '', to: '' }
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de')

export function filterHistory(shots: Shot[], beans: Bean[], filter: HistoryFilter): Shot[] {
  const words = normalize(filter.search).trim().split(/\s+/).filter(Boolean)
  function dateBoundary(value: string, nextDay = false) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day + (nextDay ? 1 : 0)).getTime()
  }
  return shots.filter(shot => {
    if (filter.bean && (shot.bean_id || 'none') !== filter.bean) return false
    if (filter.author && shot.author_id !== filter.author) return false
    if (filter.profile && (shot.profile ? 'profile:' + shot.profile : 'none') !== filter.profile) return false
    const time = Date.parse(shot.brewed_at)
    if (filter.from && time < dateBoundary(filter.from)) return false
    if (filter.to && time >= dateBoundary(filter.to, true)) return false
    const bean = beans.find(bean => bean.id === shot.bean_id)
    const text = normalize([bean?.name, bean?.roaster, shot.author_name, shot.profile].filter(Boolean).join(' '))
    return words.every(word => text.includes(word))
  })
}
