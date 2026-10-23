import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** A titled group of rows on one leaf, the grammar of every settings section. */
export function Group({ id, title, footer, children }: { id?: string; title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-2 px-1 text-[0.8125rem] font-medium text-ink-2">{title}</h2>
      <div className="divide-y divide-rule overflow-hidden rounded-[18px] bg-leaf">{children}</div>
      {footer ? <div className="mt-2 px-1 text-[0.8125rem] leading-relaxed text-ink-3">{footer}</div> : null}
    </section>
  )
}

/** One row: what it is on the left, how it is set on the right. */
export function Row({
  label,
  hint,
  children,
  stacked,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
  stacked?: boolean
  htmlFor?: string
}) {
  return (
    <div className={cn('px-4 py-3', stacked ? 'flex flex-col gap-2.5' : 'flex min-h-[52px] items-center gap-4')}>
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[1rem] text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

export const selectClass =
  'h-10 max-w-[13rem] min-w-0 cursor-pointer appearance-none truncate rounded-[10px] bg-well bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8 pl-3 text-[0.9375rem] text-ink outline-none focus:shadow-[0_0_0_2px_var(--wj-accent)] ' +
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a93a3' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9.5l6 6 6-6'/%3E%3C/svg%3E\")]"
