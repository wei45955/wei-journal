/**
 * The pictures that are uploaded.
 *
 * A photograph taken on a phone is often stored in HEIC, a format most
 * desktops cannot read. The picture is therefore redrawn in the browser
 * before it is sent: the phone decodes the file it knows, the canvas scales
 * it down and the result leaves as a JPEG every device understands.
 *
 * The same pass does the compression, so the file that travels over a
 * mobile connection is small enough to arrive quickly.
 */

export interface CompressionSettings {
  /** Whether the pictures are compressed. */
  enabled: boolean
  /** The quality of the compressed picture, from 30 to 95. */
  quality: number
  /** The longest side a compressed picture may have. Zero keeps the original. */
  maxDimension: number
}

/**
 * The defaults of the compression.
 *
 * A quality of 80 and a longest side of 2048 pixels keep a photograph sharp
 * on a phone screen, which is where the journal is read, while the file
 * stays small enough to upload over a slow connection. The original file is
 * never larger than about a tenth of a modern phone photograph.
 */
export const DEFAULT_COMPRESSION: CompressionSettings = {
  enabled: true,
  quality: 80,
  maxDimension: 2048,
}

/** The formats that are always redrawn, because few devices read them. */
const CONVERTED_EXTENSIONS = ['heic', 'heif', 'heics', 'heifs']

/** The formats that keep their own kind, so nothing is lost. */
const LOSSLESS_EXTENSIONS = ['png']

/** The formats that are left alone, because they carry something else. */
const UNTOUCHED_EXTENSIONS = ['gif']

/** Below this size a picture is not worth redrawing. */
const SMALL_FILE = 150 * 1024

/** How long the browser is given to decode a picture. */
const DECODE_TIMEOUT = 8000

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1).toLowerCase()
}

/** Whether the file holds a picture. */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp'].includes(
    extensionOf(file.name),
  )
}

/** Whether the file is in a HEIC or HEIF container. */
export function isHeicFile(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true
  if (file.type.startsWith('image/')) return false
  return CONVERTED_EXTENSIONS.includes(extensionOf(file.name))
}

/** The kind the picture is written in after it was redrawn. */
function targetOf(extension: string): { type: string; extension: string } {
  if (LOSSLESS_EXTENSIONS.includes(extension)) return { type: 'image/png', extension: 'png' }
  return { type: 'image/jpeg', extension: 'jpg' }
}

/** A decoded picture that is ready to be drawn. */
interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/**
 * Decodes a picture.
 *
 * The image element is tried first, because every browser that can show a
 * HEIC picture can decode it that way. The bitmap decoder is the second
 * road, for the browsers that refuse the element but know the format.
 */
async function decodeImage(file: File): Promise<DecodedImage | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(url)
    if (image) {
      return {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        release: () => URL.revokeObjectURL(url),
      }
    }
  } catch {
    // The browser could not show the file; the bitmap decoder may still know it.
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  } catch {
    // The format is beyond this browser.
  }

  URL.revokeObjectURL(url)
  return null
}

function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    // A browser that neither draws nor refuses the file would leave the
    // upload waiting for ever, so the wait has an end.
    const timer = setTimeout(() => resolve(null), DECODE_TIMEOUT)
    image.onload = () => {
      clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    image.src = url
  })
}

/** The size the picture is drawn at, so the longest side fits the limit. */
function scaledSize(width: number, height: number, maxDimension: number) {
  if (!maxDimension || maxDimension <= 0) return { width, height }
  if (width <= maxDimension && height <= maxDimension) return { width, height }
  const ratio = Math.min(maxDimension / width, maxDimension / height)
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Prepares a picture for the upload.
 *
 * The original file is returned when there is nothing to do or when the
 * browser cannot read the format. A picture that has to be redrawn keeps
 * the name of the original, so the reader still recognises it in the
 * journal.
 */
export async function prepareImage(
  file: File,
  settings: CompressionSettings,
): Promise<{ file: File; converted: boolean; originalSize: number }> {
  const originalSize = file.size
  const extension = extensionOf(file.name)
  const unchanged = { file, converted: false, originalSize }

  if (!isImageFile(file) || UNTOUCHED_EXTENSIONS.includes(extension)) return unchanged

  const mustConvert = CONVERTED_EXTENSIONS.includes(extension)
  const decoded = await decodeImage(file)
  if (!decoded || !decoded.width || !decoded.height) return unchanged

  const target = scaledSize(decoded.width, decoded.height, settings.maxDimension)
  const isSmaller = target.width < decoded.width || target.height < decoded.height

  // A picture that is already small and in a format the server reads is
  // left exactly as it is.
  if (!mustConvert && !settings.enabled && !isSmaller) {
    decoded.release()
    return unchanged
  }
  if (!mustConvert && !isSmaller && file.size < SMALL_FILE) {
    decoded.release()
    return unchanged
  }

  const targetFormat = targetOf(extension)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) {
      decoded.release()
      return unchanged
    }
    // A picture that arrives without an alpha channel is painted on white,
    // so a transparent PNG does not turn black.
    if (targetFormat.type === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, target.width, target.height)
    }
    context.drawImage(decoded.source, 0, 0, target.width, target.height)

    const quality = Math.min(0.95, Math.max(0.3, settings.quality / 100))
    const blob = await canvasToBlob(canvas, targetFormat.type, quality)
    canvas.width = 0
    canvas.height = 0
    if (!blob || blob.size === 0) {
      decoded.release()
      return unchanged
    }

    // A conversion that makes the file bigger is not worth it, unless the
    // format is one the server cannot read.
    if (!mustConvert && blob.size >= file.size) {
      decoded.release()
      return unchanged
    }

    const name = replaceExtension(file.name, targetFormat.extension)
    const prepared = new File([blob], name, {
      type: targetFormat.type,
      lastModified: file.lastModified,
    })
    decoded.release()
    return { file: prepared, converted: true, originalSize }
  } catch {
    decoded.release()
    return unchanged
  }
}

/** Replaces the extension of a name, keeping the rest of it. */
export function replaceExtension(name: string, extension: string): string {
  const index = name.lastIndexOf('.')
  const base = index === -1 ? name : name.slice(0, index)
  return `${base}.${extension}`
}
