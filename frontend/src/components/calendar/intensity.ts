/**
 * How busy a day was, turned into a shade.
 *
 * The scale has five steps on top of the empty day, and the number of entries
 * is always shown as text so the colour is never the only signal.
 */

export const INTENSITY_STEPS = 5

export const INTENSITY_CLASSES = [
  'bg-paper-sunken text-ink-faint',
  'bg-accent/15 text-ink-strong',
  'bg-accent/35 text-ink-strong',
  'bg-accent/55 text-ink-strong',
  'bg-accent/75 text-ink-strong',
  'bg-accent text-accent-contrast',
] as const

/** The shade for a number of entries, given the busiest day in view. */
export function intensityOf(count: number, max: number): number {
  if (count <= 0) return 0
  if (max <= 1) return INTENSITY_STEPS
  const ratio = count / max
  return Math.min(INTENSITY_STEPS, Math.max(1, Math.ceil(ratio * INTENSITY_STEPS)))
}

export function intensityClass(level: number): string {
  return INTENSITY_CLASSES[Math.max(0, Math.min(INTENSITY_CLASSES.length - 1, level))]
}
