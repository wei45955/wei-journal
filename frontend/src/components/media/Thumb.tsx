import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { FileIcon, ImageIcon, VideoIcon } from '../icons'

/**
 * The picture of an attachment.
 *
 * A file the browser cannot draw, such as a photograph in the HEIC format
 * on a desktop, is shown as a quiet card with its name instead of a broken
 * picture.
 */
export function Thumb({ media, className }: { media: Media; className?: string }) {
  const [failed, setFailed] = useState(false)
  const picture = media.kind === 'image' || media.kind === 'live-still'
  const film = media.kind === 'video' || media.kind === 'live-motion'

  if (!picture && !film) {
    return (
      <span
        className={cn(
          'flex size-full flex-col items-center justify-center gap-1 bg-paper-sunken text-ink-faint',
          className,
        )}
      >
        <FileIcon size={24} />
        <span className="px-2 text-[0.6875rem] break-all">{media.originalName}</span>
      </span>
    )
  }

  if (failed) {
    return (
      <span
        className={cn(
          'flex size-full flex-col items-center justify-center gap-1 bg-paper-sunken text-ink-faint',
          className,
        )}
      >
        {film ? <VideoIcon size={24} /> : <ImageIcon size={24} />}
        <span className="px-2 text-[0.6875rem] break-all">{media.originalName}</span>
      </span>
    )
  }

  // The larger derivative is used when there is one, so the picture
  // stays sharp on a screen with many dots per inch.
  const source =
    media.hasPreview && media.previewUrl
      ? media.previewUrl
      : media.hasThumb && media.thumbUrl
        ? media.thumbUrl
        : media.url
  return (
    <img
      src={source}
      alt={media.originalName}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('size-full object-cover', className)}
    />
  )
}
