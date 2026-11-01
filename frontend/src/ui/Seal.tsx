import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * A personal seal, the one vermilion thing in the journal.
 *
 * The square is slightly irregular, as if cut by hand, and the character is
 * knocked out in paper. It is used for the journal's mark, for today's date,
 * and for the one moment in the app where something is stamped as saved.
 */
export function Seal({
  children = '记',
  size = 48,
  stamp = false,
  muted = false,
  className,
  label,
  textClassName,
}: {
  children?: ReactNode
  size?: number
  stamp?: boolean
  muted?: boolean
  className?: string
  label?: string
  textClassName?: string
}) {
  const raw = useId()
  const grain = `seal-grain-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center align-middle', className)}
      style={{ width: size, height: size }}
      title={label}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className={cn('block', stamp && 'seal-stamp')}
        fill="none"
      >
        <defs>
          <filter id={grain} x="-6%" y="-6%" width="112%" height="112%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#${grain})`}>
          <rect
            x="3.5"
            y="3.5"
            width="57"
            height="57"
            rx="11"
            fill={muted ? 'var(--wj-seal-soft)' : 'var(--wj-seal)'}
          />
          <rect
            x="7.5"
            y="7.5"
            width="49"
            height="49"
            rx="8"
            stroke={muted ? 'var(--wj-seal)' : 'var(--wj-seal-on)'}
            strokeOpacity="0.34"
            strokeWidth="1"
          />
        </g>
        <text
          x="32"
          y="33.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="29"
          fontWeight="600"
          letterSpacing="0"
          fill={muted ? 'var(--wj-seal)' : 'var(--wj-seal-on)'}
          style={{ fontFamily: 'var(--font-serif)' }}
          className={textClassName}
        >
          {children}
        </text>
      </svg>
    </span>
  )
}

/** A mark that says an entry is pinned: a small filled square, like a corner seal. */
export function SealMark({ className, size = 8 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-xs bg-seal', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

/**
 * A hand drawn line of ink. Used once, under the line on the opening page,
 * so the wordmark has one moment of movement that is not a fade.
 */
export function InkUnderline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 12"
      width="100%"
      height="12"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2 8C42 3.4 94 3 134 5.4c26 1.6 56 2.2 84 1.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset="1"
        className="ink-underline"
      />
    </svg>
  )
}
