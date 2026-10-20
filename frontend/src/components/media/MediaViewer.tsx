import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import type { Media } from '../../lib/types'
import { Button } from '../ui'
import { CloseIcon, DownloadIcon, FileIcon, VideoIcon } from '../icons'

interface MediaViewerProps {
  media: Media | null
  onClose: () => void
  /** The motion component of a Live Photo, when one exists. */
  motion?: Media | null
}

/** A full screen preview of one attachment. */
export function MediaViewer({ media, onClose, motion }: MediaViewerProps) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!media) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [media, onClose])

  useEffect(() => {
    setPlaying(false)
  }, [media?.id])

  if (!media) return null

  const isImage = media.kind === 'image' || media.kind === 'live-still'
  const isVideo = media.kind === 'video' || media.kind === 'live-motion'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/92 animate-fade-in">
      <header className="flex items-center gap-3 px-4 py-3 text-paper">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{media.originalName}</p>
          <p className="truncate text-xs text-paper/60">
            {formatBytes(media.size)}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
          </p>
        </div>
        <a
          href={media.url}
          download={media.originalName}
          className="rounded-md p-2 text-paper/80 transition-colors hover:bg-paper/10"
          aria-label={t('media.download')}
        >
          <DownloadIcon size={20} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('media.close')}
          className="rounded-md p-2 text-paper/80 transition-colors hover:bg-paper/10"
        >
          <CloseIcon size={20} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {isImage ? (
          <div className="relative flex max-h-full max-w-full items-center justify-center">
            {playing && motion ? (
              <video
                src={motion.url}
                autoPlay
                loop
                muted
                playsInline
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <img
                src={media.url}
                alt={media.originalName}
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            )}
            {motion ? (
              <div className="absolute bottom-3 left-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPlaying((value) => !value)}
                >
                  {playing ? t('media.stopMotion') : t('media.showMotion')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {isVideo ? (
          <video
            src={media.url}
            controls
            playsInline
            className="max-h-[70vh] max-w-full rounded-lg bg-black"
          />
        ) : null}

        {!isImage && !isVideo ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-paper/10 px-8 py-10 text-paper">
            <FileIcon size={40} />
            <p className="text-sm">{media.mimeType || t('media.file')}</p>
            <a
              href={media.url}
              download={media.originalName}
              className="rounded-md bg-paper px-4 py-2 text-sm font-medium text-ink"
            >
              {t('media.download')}
            </a>
          </div>
        ) : null}
      </div>

      {media.locationName || media.latitude ? (
        <footer className="px-4 py-3 text-center text-xs text-paper/70">
          {media.locationName || `${media.latitude?.toFixed(4)}, ${media.longitude?.toFixed(4)}`}
        </footer>
      ) : null}
    </div>
  )
}

/** A small grid of attachments with a tap-to-open viewer. */
export function MediaStrip({
  media,
  className,
}: {
  media: Media[]
  className?: string
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<Media | null>(null)

  if (media.length === 0) return null

  const motionFor = (item: Media) =>
    item.livePhotoId
      ? (media.find((candidate) => candidate.livePhotoId === item.livePhotoId && candidate.id !== item.id) ?? null)
      : null

  return (
    <>
      <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
        {media.map((item) => {
          const isImage = item.kind === 'image' || item.kind === 'live-still'
          const isVideo = item.kind === 'video' || item.kind === 'live-motion'
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-sunken"
              aria-label={item.originalName}
            >
              {isImage ? (
                <img
                  src={item.hasThumb ? item.thumbUrl : item.url}
                  alt={item.originalName}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
              ) : isVideo ? (
                <span className="flex size-full items-center justify-center text-ink-faint">
                  <VideoIcon size={28} />
                </span>
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 text-ink-faint">
                  <FileIcon size={24} />
                  <span className="px-2 text-[0.6875rem] break-all">{item.originalName}</span>
                </span>
              )}
              {item.kind === 'live-still' ? (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-ink/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-paper">
                  {t('media.livePhoto')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <MediaViewer
        media={active}
        motion={active ? motionFor(active) : null}
        onClose={() => setActive(null)}
      />
    </>
  )
}
