import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, api, uploadFilesWithProgress } from '../../lib/api'
import { DEFAULT_COMPRESSION, prepareImage } from '../../lib/image'
import type { Media } from '../../lib/types'
import { useAuth } from '../../state/auth'
import { useToast } from '../../state/toast'

const STILL_EXTENSIONS = ['.heic', '.heif', '.jpg', '.jpeg', '.png']

function extension(name: string) {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index).toLowerCase()
}
function base(name: string) {
  const index = name.lastIndexOf('.')
  return index === -1 ? name : name.slice(0, index)
}

export type UploadPhase = { state: 'idle' } | { state: 'preparing' } | { state: 'uploading'; percent: number }

/**
 * Sends picked files to the server.
 *
 * A still and a .mov that share a name are one Live Photo and travel
 * together. Pictures are redrawn in the browser first, so an iPhone photo
 * arrives as a JPEG any device can show, and smaller.
 */
export function useUploader(onUploaded: (media: Media[]) => void) {
  const { t } = useTranslation()
  const { notify } = useToast()
  const { user } = useAuth()
  const [phase, setPhase] = useState<UploadPhase>({ state: 'idle' })
  const doneRef = useRef(onUploaded)
  doneRef.current = onUploaded

  const upload = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = Array.from(fileList ?? [])
      if (files.length === 0) return
      const settings = {
        enabled: user?.settings.compressImages ?? DEFAULT_COMPRESSION.enabled,
        quality: user?.settings.imageQuality ?? DEFAULT_COMPRESSION.quality,
        maxDimension: user?.settings.imageMaxDimension ?? DEFAULT_COMPRESSION.maxDimension,
      }
      setPhase({ state: 'preparing' })
      try {
        const uploaded: Media[] = []
        const used = new Set<File>()
        for (const file of files) {
          if (used.has(file) || !STILL_EXTENSIONS.includes(extension(file.name))) continue
          const motion = files.find(
            (other) => other !== file && !used.has(other) && extension(other.name) === '.mov' && base(other.name) === base(file.name),
          )
          if (!motion) continue
          used.add(file)
          used.add(motion)
          const pair = await api.uploadLivePhoto(file, motion)
          uploaded.push(pair.still, pair.motion)
        }
        const rest = files.filter((file) => !used.has(file))
        if (rest.length > 0) {
          const prepared = await Promise.all(rest.map(async (file) => (await prepareImage(file, settings)).file))
          setPhase({ state: 'uploading', percent: 0 })
          const { promise } = uploadFilesWithProgress(prepared, (percent) => setPhase({ state: 'uploading', percent }))
          uploaded.push(...(await promise))
        }
        doneRef.current(uploaded)
      } catch (error) {
        notify(describeUpload(error, t), 'error')
      } finally {
        setPhase({ state: 'idle' })
      }
    },
    [notify, t, user?.settings.compressImages, user?.settings.imageQuality, user?.settings.imageMaxDimension],
  )

  return { upload, phase, busy: phase.state !== 'idle' }
}

function describeUpload(error: unknown, t: (key: string, options?: Record<string, unknown>) => string) {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return error.details?.limitMB ? t('media.tooLargeLimit', { limit: error.details.limitMB }) : t('media.tooLarge')
    }
    if (error.status === 0) return t('errors.network')
    if (error.isUnauthorized) return t('errors.unauthorized')
    return error.message || t('media.failed')
  }
  return t('media.failed')
}
