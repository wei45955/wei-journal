import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPRESSION, isHeicFile, isImageFile, prepareImage, replaceExtension } from './image'

/** A file of the given name and type. */
function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('the pictures that are uploaded', () => {
  it('knows a picture from a file', () => {
    expect(isImageFile(file('photo.jpg', 'image/jpeg'))).toBe(true)
    expect(isImageFile(file('photo.HEIC', 'image/heic'))).toBe(true)
    expect(isImageFile(file('notes.pdf', 'application/pdf'))).toBe(false)
  })

  it('knows the format of the iPhone', () => {
    expect(isHeicFile(file('IMG_0001.HEIC', 'image/heic'))).toBe(true)
    expect(isHeicFile(file('IMG_0001.HEIC', ''))).toBe(true)
    expect(isHeicFile(file('photo.jpg', 'image/jpeg'))).toBe(false)
  })

  it('keeps a file that is not a picture', async () => {
    const original = file('notes.pdf', 'application/pdf')
    const result = await prepareImage(original, DEFAULT_COMPRESSION)
    expect(result.file).toBe(original)
    expect(result.converted).toBe(false)
  })

  it('keeps a picture the browser cannot read', async () => {
    // The test browser draws no images, so the picture cannot be read and
    // the original has to be the one that is sent.
    const original = file('IMG_0001.HEIC', 'image/heic')
    const result = await prepareImage(original, DEFAULT_COMPRESSION)
    expect(result.file).toBe(original)
    expect(result.converted).toBe(false)
    expect(result.originalSize).toBe(original.size)
  }, 20000)

  it('keeps the name of the picture', () => {
    expect(replaceExtension('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg')
    expect(replaceExtension('photo', 'jpg')).toBe('photo.jpg')
  })
})
