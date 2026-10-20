/** The app mark: a small open book rendered as vector strokes. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
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
      <rect x="3" y="5" width="42" height="38" rx="6" className="fill-accent-soft" />
      <path
        d="M24 13c-3.6-2.4-7.6-3.4-12-3v24c4.4-.4 8.4.6 12 3 3.6-2.4 7.6-3.4 12-3V10c-4.4-.4-8.4.6-12 3Z"
        className="stroke-accent"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M24 13v24" className="stroke-accent" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
