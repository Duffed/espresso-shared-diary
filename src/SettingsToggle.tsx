import { useId } from 'react'

export function SettingsToggle({ label, description, checked, onChange, disabled, className = '', accessibleLabel }: {
  label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string; accessibleLabel?: string
}) {
  const descriptionId = useId()
  return <button type="button" className={`personal-option ${className}`} role="switch" aria-checked={checked}
    aria-label={accessibleLabel || label} aria-describedby={description ? descriptionId : undefined} disabled={disabled} onClick={() => onChange(!checked)}>
    <span><strong>{label}</strong>{description && <small id={descriptionId}>{description}</small>}</span><span className="personal-switch" aria-hidden="true" />
  </button>
}
