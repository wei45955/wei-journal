import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

/* eslint-disable react-refresh/only-export-components */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-ink active:bg-accent-ink border border-transparent shadow-sm',
  secondary:
    'bg-paper-sunken text-ink border border-transparent hover:bg-line/60 active:bg-line',
  ghost:
    'bg-transparent text-accent hover:bg-accent-soft border border-transparent font-medium',
  danger: 'bg-danger-soft text-danger border border-transparent hover:bg-danger/15',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'text-sm px-3.5 py-1.5 gap-1.5',
  md: 'text-[0.9375rem] px-4.5 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.97]',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

const controlClasses =
  'w-full rounded-xl border bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-faint ' +
  'transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(controlClasses, invalid ? 'border-danger' : 'border-line', className)}
        {...rest}
      />
    )
  },
)

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function TextArea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlClasses, 'min-h-24 resize-y', invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  )
})

/** A labelled switch used in the settings. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-ink">
          {label}
        </label>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[1.75rem] w-[3.125rem] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-[1.5rem] rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[1.625rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'sage'
  className?: string
}) {
  const tones = {
    neutral: 'bg-paper-sunken text-ink-muted',
    accent: 'bg-accent-soft text-accent-ink',
    sage: 'bg-sage-soft text-sage',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
  illustration,
}: {
  title: string
  body?: string
  action?: ReactNode
  illustration?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      {illustration ?? (
        <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
            <path
              d="M5 4.5h9.5L19 9v10.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M14 4.5V9h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7.5 13.5h8M7.5 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      )}
      <h2 className="text-[1.25rem] font-bold text-ink-strong">{title}</h2>
      {body ? <p className="max-w-sm text-[0.9375rem] text-ink-muted">{body}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
        </svg>
      </span>
      <p className="max-w-sm text-[0.9375rem] text-ink-muted">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="secondary" size="sm">
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-paper-sunken', className)} />
}
