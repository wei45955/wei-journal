import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, uploadFilesWithProgress } from '../../lib/api'
import { useToast } from '../../state/toast'
import { formatBytes } from '../../lib/format'
import type { Media } from '../../lib/types'
import { Button } from '../ui'
import { UploadIcon } from '../icons'

const LIVE_STILL_EXTENSIONS = ['.heic', '.heif', '.jpg', '.jpeg', '.png']

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index).toLowerCase()
}

function baseNameOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? name : name.slice(0, index)
}

interface MediaUploaderProps {
  onUploaded: (media: Media[]) => void
  disabled?: boolean
}

/**
 * Picks files and uploads them.
 *
 * A still image and a motion clip that share a base name are treated as one
 * Live Photo and sent to the dedicated endpoint, so the pair keeps its
 * relationship on the server.
 */
export function MediaUploader({ onUploaded, disabled }: MediaUploaderProps) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Array<{ name: string; size: number }>>([])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setBusy(true)
    setProgress(0)
    setPending(list.map((file) => ({ name: file.name, size: file.size })))

    try {
      const uploaded: Media[] = []
      const consumed = new Set<File>()

      // Live Photo pairs: a still image and a .mov that share a base name.
      for (const file of list) {
        if (consumed.has(file)) continue
        if (!LIVE_STILL_EXTENSIONS.includes(extensionOf(file.name))) continue
        const motion = list.find(
          (candidate) =>
            !consumed.has(candidate) &&
            candidate !== file &&
            extensionOf(candidate.name) === '.mov' &&
            baseNameOf(candidate.name) === baseNameOf(file.name),
        )
        if (!motion) continue
        consumed.add(file)
        consumed.add(motion)
        const result = await api.uploadLivePhoto(file, motion)
        uploaded.push(result.still, result.motion)
        setProgress(Math.round((consumed.size / list.length) * 100))
      }

      const rest = list.filter((file) => !consumed.has(file))
      if (rest.length > 0) {
        const { promise } = uploadFilesWithProgress(rest, setProgress)
        const media = await promise
        uploaded.push(...media)
      }

      onUploaded(uploaded)
    } catch (err) {
      setProgress(0)
      notify(describe(err, t('media.uploadFailed')), 'error')
    } finally {
      setBusy(false)
      setPending([])
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.doc,.docx"
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <Button
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        icon={<UploadIcon size={16} />}
      >
        {busy ? t('media.uploading') : t('entries.addMedia')}
      </Button>

      {busy ? (
        <div className="mt-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${progress}%` }} />
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-faint">
            {pending.slice(0, 4).map((file) => (
              <li key={file.name} className="truncate">
                {file.name} · {formatBytes(file.size)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
