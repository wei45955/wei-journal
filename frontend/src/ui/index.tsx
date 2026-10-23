/* eslint-disable react-refresh/only-export-components */
import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'

/* ---------------------------------------------------------------- buttons */

type Tone = 'primary' | 'secondary' | 'quiet' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  block?: boolean
}

const tones: Record<Tone, string> = {
  primary: 'bg-accent text-accent-on',
  secondary: 'bg-well text-ink',
  quiet: 'text-accent',
  danger: 'bg-danger-soft text-danger',
}

const sizes = {
  sm: 'h-9 px-3.5 text-[0.875rem] gap-1.5',
  md: 'h-11 px-5 text-[0.9375rem] gap-2',
  lg: 'h-[3.25rem] px-6 text-[1rem] gap-2',
}

/** The look of a button, for a link that acts like one. */
export function buttonClass(tone: Tone = 'secondary', size: keyof typeof sizes = 'md', extra?: string) {
  return cn(
    'press inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap select-none',
    tones[tone],
    sizes[size],
    extra,
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'secondary', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'press inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap select-none',
        'disabled:opacity-45',
        tones[tone],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: 'sm' | 'md'
}

/** A round icon control with a 44pt hit area. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'press relative inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-35',
        size === 'md' ? 'size-11' : 'size-9',
        active ? 'bg-accent-soft text-accent' : 'text-ink active:bg-well',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* ----------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[0.8125rem] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'block h-12 w-full min-w-0 rounded-[14px] bg-well px-4 text-[16px] text-ink placeholder:text-ink-3 ' +
  'outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--wj-accent)] disabled:opacity-50'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, invalid && 'shadow-[0_0_0_1.5px_var(--wj-danger)]', className)}
        {...rest}
      />
    )
  },
)

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-45',
        checked ? 'bg-accent' : 'bg-rule',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-[var(--ease-out-soft)]',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-[12px] bg-well p-[3px]', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 min-w-0 flex-1 truncate rounded-[9px] px-3 text-[0.875rem] font-medium transition-[background-color,color,box-shadow] duration-200',
              active ? 'bg-leaf text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-2',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A selectable pill used for tags and filter choices. */
export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'press inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[0.875rem]',
        selected ? 'bg-accent text-accent-on' : 'bg-well text-ink',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  )
}

/* ----------------------------------------------------------------- states */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[14px] bg-well', className)} />
}

export function EmptyState({
  title,
  body,
  action,
  art,
}: {
  title: string
  body?: string
  action?: ReactNode
  art?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center animate-fade">
      {art ?? <BlankPageArt />}
      <h2 className="mt-6 font-serif text-[1.375rem] leading-tight font-medium text-ink">{title}</h2>
      {body ? <p className="mt-2 max-w-[19rem] text-[0.9375rem] leading-relaxed text-ink-2">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center" role="alert">
      <p className="max-w-[19rem] text-[0.9375rem] leading-relaxed text-ink-2">{message}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}

/** A blank leaf with a single drop of ink, used where nothing is written yet. */
export function BlankPageArt() {
  return (
    <svg width="112" height="96" viewBox="0 0 112 96" fill="none" aria-hidden="true">
      <rect x="30" y="10" width="56" height="76" rx="8" fill="var(--wj-leaf)" stroke="var(--wj-rule)" />
      <rect x="26" y="14" width="56" height="76" rx="8" fill="var(--wj-leaf)" stroke="var(--wj-rule)" />
      <path d="M38 34h26M38 44h18" stroke="var(--wj-rule)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M64 70c0-5 6-11 6-11s6 6 6 11a6 6 0 0 1-12 0z"
        fill="var(--wj-accent)"
        transform="rotate(-8 70 68)"
      />
    </svg>
  )
}
