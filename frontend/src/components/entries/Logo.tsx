import { useId } from 'react'

/** The app mark: a small open book rendered as vector strokes. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      role="img"
      aria-label="Wei Journal"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="6" x2="44" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8f8dee" />
          <stop offset="1" stopColor="#4f4cc4" />
        </linearGradient>
      </defs>
      <rect x="3" y="5" width="42" height="38" rx="12" fill={`url(#${gradientId})`} />
      <path
        d="M24 14.5c-3.2-2.2-6.8-3-10.8-2.7v20.4c4-.3 7.6.5 10.8 2.7 3.2-2.2 6.8-3 10.8-2.7V11.8c-4-.3-7.6.5-10.8 2.7Z"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M24 14.5v20.4"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
