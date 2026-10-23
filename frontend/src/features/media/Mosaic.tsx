import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { LiveIcon, VideoIcon } from '../../ui/icons'
import { isFilm, Thumb } from './Thumb'

/**
 * The pictures of an entry, laid out by how many there are. One runs wide,
 * two sit side by side, three put one large beside two small, and more show
 * the first four with the rest counted on the last tile.
 */
export function Mosaic({
  items,
  onOpen,
  className,
  rounded = false,
}: {
  items: Media[]
  onOpen?: (index: number) => void
  className?: string
  rounded?: boolean
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length
  const tile = rounded ? 'rounded-[10px]' : ''

  const cell = (media: Media, index: number, extra?: string) => (
    <button
      key={media.id}
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpen?.(index)
      }}
      aria-label={media.originalName || t('media.open')}
      className={cn('relative block size-full overflow-hidden bg-well', tile, extra)}
    >
      <Thumb media={media} large={items.length === 1} />
      {isFilm(media) ? (
        <span className="absolute bottom-2 left-2 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <VideoIcon size={15} />
        </span>
      ) : media.kind === 'live-still' ? (
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm">
          <LiveIcon size={13} />
          {t('media.live')}
        </span>
      ) : null}
      {index === shown.length - 1 && rest > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 font-serif text-[1.5rem] text-white">
          +{rest}
        </span>
      ) : null}
    </button>
  )

  const gap = rounded ? 'gap-1.5' : 'gap-[2px]'

  if (shown.length === 1) {
    const media = shown[0]
    const ratio = media.width && media.height ? media.width / media.height : 4 / 3
    // Portraits are shown a little shorter than they are, so one picture
    // never takes the whole screen; landscapes keep their own shape.
    const aspect = Math.min(Math.max(ratio, 0.8), 1.9)
    return (
      <div className={cn('w-full', className)} style={{ aspectRatio: String(aspect) }}>
        {cell(media, 0)}
      </div>
    )
  }
  if (shown.length === 2) {
    return <div className={cn('grid aspect-[2/1.15] grid-cols-2', gap, className)}>{shown.map((m, i) => cell(m, i))}</div>
  }
  if (shown.length === 3) {
    return (
      <div className={cn('grid aspect-[3/2] grid-cols-[2fr_1fr] grid-rows-2', gap, className)}>
        {cell(shown[0], 0, 'row-span-2')}
        {cell(shown[1], 1)}
        {cell(shown[2], 2)}
      </div>
    )
  }
  return (
    <div className={cn('grid aspect-[3/2] grid-cols-[2fr_1fr] grid-rows-3', gap, className)}>
      {cell(shown[0], 0, 'row-span-3')}
      {cell(shown[1], 1)}
      {cell(shown[2], 2)}
      {cell(shown[3], 3)}
    </div>
  )
}
