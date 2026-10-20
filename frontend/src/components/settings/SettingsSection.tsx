import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
}

/**
 * One titled block of the settings page.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="rounded-lg border border-line bg-paper-raised p-4 sm:p-5">
      <h2 className="font-[--font-sans] text-sm font-medium tracking-wide text-ink-muted uppercase">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}
