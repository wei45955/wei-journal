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
    <section className="rounded-2xl bg-paper-raised p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-5">
      <h2 className="text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">{title}</h2>
      {description ? <p className="mt-1.5 text-sm text-ink-muted">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}
