import type { BeanPackage, PackageAdjustment, Shot } from './model.ts'

export function packageForShot(packages: BeanPackage[], bean: string | null | undefined, time: string) {
  const at = Date.parse(time)
  return packages.find(p => p.bean_id === bean && Date.parse(p.opened_at) <= at && (!p.closed_at || at < Date.parse(p.closed_at)))
}

export function packageStock(pack: BeanPackage, shots: Shot[], adjustments: PackageAdjustment[] = []) {
  const used = shots.filter(shot => shot.package_id === pack.id)
  const consumed = used.reduce((sum, shot) => sum + Math.round((shot.dose ?? 0) * 1e6), 0) / 1e6
  const correction = adjustments.filter(a => a.package_id === pack.id).reduce((sum, a) => sum + Math.round(a.amount * 1e6), 0) / 1e6
  const total = pack.quantity + pack.carried_in
  const rawRemaining = Math.round((total + correction - consumed) * 1e6) / 1e6
  const remaining = Math.max(0, rawRemaining)
  const doses = used.filter(s => s.dose != null && s.dose > 0)
  return { consumed, total, correction, remaining, rawRemaining, count: used.length,
    shotsLeft: doses.length ? Math.floor(remaining / (consumed / doses.length)) : null }
}
