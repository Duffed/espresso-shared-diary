import type { Basket, Shot } from './model'
import { formatNumber } from './model'
import { Photo } from './ui'

export function BasketPicker({ baskets, shots, user, value, onChange }: {
  baskets: Basket[]; shots: Shot[]; user: string; value: string; onChange: (id: string) => void
}) {
  const recent = [...new Set(shots.filter(shot => shot.author_id === user).map(shot => shot.basket_id).filter(Boolean))]
    .map(id => baskets.find(basket => basket.id === id)).filter((basket): basket is Basket => Boolean(basket && !basket.archived)).slice(0, 3)
  const featured = recent.length ? recent : baskets.filter(basket => !basket.archived).slice(0, 3)
  const others = baskets.filter(basket => (!basket.archived || basket.id === value) && !featured.some(item => item.id === basket.id))
  const card = (basket: Basket) => <button type="button" className="bean-picture-card" key={basket.id} aria-pressed={basket.id === value} onClick={() => onChange(basket.id)}>
    <span className="bean-picture">
      {basket.photo ? <Photo photo={basket.photo} /> : <span className="basket-placeholder" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15h34M11 15l4 24h18l4-24M15 22h18M17 28h14M19 34h10"/><ellipse cx="24" cy="12" rx="17" ry="5" /></svg></span>}
      <span className="selection-tick" aria-hidden="true">{basket.id === value ? '✓' : ''}</span>
    </span><strong>{basket.name}</strong><small>{basket.capacity != null ? formatNumber(basket.capacity) + ' g' : 'Sieb'}{basket.archived ? ' · Archiviert' : ''}</small>
  </button>
  return <section className="basket-picker" aria-label="Sieb auswählen">
    <div className="section-heading"><h3>Dein Sieb</h3><small>{baskets.find(basket => basket.id === value)?.name || 'Ohne Sieb'}</small></div>
    {featured.length > 0 && <section aria-label={recent.length ? 'Zuletzt verwendete Siebe' : 'Siebe'}><div className="recent-beans">{featured.map(card)}</div></section>}
    <details className="basket-more"><summary>{others.length ? 'Weitere Siebe' : 'Sieboptionen'}</summary>
      {others.length > 0 && <div className="recent-beans basket-scroll" role="region" aria-label="Siebliste" tabIndex={0}>{others.map(card)}</div>}
      {!featured.length && !others.length && <p className="meta">Füge dein erstes Sieb in den Einstellungen hinzu.</p>}
      <button type="button" className="quiet skip-bean" aria-pressed={!value} onClick={() => onChange('')}>Ohne Sieb</button>
    </details>
  </section>
}
