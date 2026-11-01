/* eslint-disable react-refresh/only-export-components */
import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { Seal } from './Seal'

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
  primary: 'bg-accent text-accent-on hover:bg-accent/90',
  secondary: 'bg-leaf text-ink hairline hover:bg-well',
  quiet: 'text-ink-2 hover:bg-well hover:text-ink',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-seal-on',
}

const sizes = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const buttonBase =
  'press inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap select-none disabled:opacity-45'

/** The look of a button, for a link that acts like one. */
export function buttonClass(tone: Tone = 'secondary', size: keyof typeof sizes = 'md', extra?: string) {
  return cn(buttonBase, tones[tone], sizes[size], extra)
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
      className={cn(buttonBase, tones[tone], sizes[size], block && 'w-full', className)}
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
        'press relative inline-flex shrink-0 items-center justify-center rounded-lg disabled:opacity-35',
        size === 'md' ? 'size-11' : 'size-9',
        active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-well hover:text-ink',
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
      <label htmlFor={htmlFor} className="title-3 text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="body-2 text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="caption text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'block h-12 w-full min-w-0 rounded-lg bg-well px-3.5 text-base text-ink placeholder:text-ink-3 ' +
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
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-45',
        checked ? 'bg-accent' : 'bg-rule',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-6 rounded-full bg-leaf shadow-sm transition-transform duration-200 ease-[var(--ease-out-soft)]',
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
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-lg bg-well p-1', className)}>
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
              'h-8 min-w-0 flex-1 truncate rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
              active ? 'bg-leaf text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A selectable tag or filter value. */
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
        'press inline-flex h-9 max-w-full items-center gap-1.5 rounded-md px-3 text-sm',
        selected ? 'bg-accent text-accent-on' : 'bg-well text-ink-2 hover:text-ink',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  )
}

/* ----------------------------------------------------------------- states */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-well', className)} />
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
    <div className="flex flex-col items-center px-6 py-16 text-center animate-fade">
      {art ?? <BlankPageArt />}
      <h2 className="heading-3 mt-6 text-ink">{title}</h2>
      {body ? <p className="body-2 mt-2 max-w-[19rem] text-ink-2">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center" role="alert">
      <Seal size={34} muted>
        误
      </Seal>
      <p className="body-2 mt-4 max-w-[19rem] text-ink-2">{message}</p>
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
      <rect x="29" y="7" width="58" height="78" rx="2" fill="var(--wj-well)" />
      <rect
        x="25"
        y="11"
        width="58"
        height="78"
        rx="2"
        fill="var(--wj-leaf)"
        stroke="var(--wj-rule)"
        strokeWidth="1"
      />
      <path d="M37 32h28M37 42h20M37 52h24" stroke="var(--wj-rule)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M67 70c0-5 5.5-11 5.5-11S78 65 78 70a5.5 5.5 0 0 1-11 0z"
        fill="var(--wj-accent)"
        transform="rotate(-8 72 68)"
      />
    </svg>
  )
}
