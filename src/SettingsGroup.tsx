import type { ReactNode } from 'react'
export function SettingsGroup({ title, subtitle, icon, children, personal = false }: { title: string; subtitle: string; icon: string; children: ReactNode; personal?: boolean }) {
  return <details className={'settings-group' + (personal ? ' settings-personal-group' : '')}><summary><span className="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg></span><span className="settings-label"><strong>{title}</strong><small>{subtitle}</small></span><span className="settings-chevron" aria-hidden="true">›</span></summary><div className="settings-content">{children}</div></details>
}
