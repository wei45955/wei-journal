/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { AudioIcon, FileIcon, ImageIcon, VideoIcon } from '../../ui/icons'

export function isPicture(media: Media) {
  return media.kind === 'image' || media.kind === 'live-still'
}
export function isFilm(media: Media) {
  return media.kind === 'video'
}
export function isFile(media: Media) {
  return media.kind === 'file' || media.kind === 'audio'
}

/** The parts of an entry's attachments, with the motion half of a Live Photo folded into its still. */
export function splitMedia(media: Media[], coverId?: number | null) {
  const visual = media.filter((item) => isPicture(item) || isFilm(item))
  const files = media.filter(isFile)
  if (coverId) {
    const cover = visual.findIndex((item) => item.id === coverId)
    if (cover > 0) visual.unshift(...visual.splice(cover, 1))
  }
  return { visual, files }
}

export function motionOf(still: Media, all: Media[]): Media | null {
  if (still.kind !== 'live-still' || !still.livePhotoId) return null
  return all.find((item) => item.kind === 'live-motion' && item.livePhotoId === still.livePhotoId) ?? null
}

/** The image of an attachment, sized for where it is shown. */
export function Thumb({
  media,
  large = false,
  className,
}: {
  media: Media
  large?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!failed && isFilm(media) && !media.hasThumb) {
    // No poster is generated for video; the first frame stands in for one.
    return (
      <video
        src={`${media.url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onError={() => setFailed(true)}
        className={cn('pointer-events-none size-full bg-well object-cover', className)}
      />
    )
  }

  if (failed || (!isPicture(media) && !(isFilm(media) && media.hasThumb))) {
    const Icon = isFilm(media) ? VideoIcon : media.kind === 'audio' ? AudioIcon : isPicture(media) ? ImageIcon : FileIcon
    return (
      <span className={cn('flex size-full items-center justify-center bg-well text-ink-3', className)}>
        <Icon size={26} />
      </span>
    )
  }

  const source = large
    ? media.hasPreview
      ? media.previewUrl
      : media.url
    : media.hasThumb
      ? media.thumbUrl
      : media.hasPreview
        ? media.previewUrl
        : media.url

  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={cn(
        'size-full bg-well object-cover transition-opacity duration-300',
        loaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  )
}
