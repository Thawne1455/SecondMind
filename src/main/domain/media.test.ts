import { describe, expect, it } from 'vitest'
import { dumpKind, isMediaFileName, mediaExtension, mediaFileName } from './media'

const HASH = 'a'.repeat(64)

describe('mediaExtension', () => {
  it('orijinal addaki uzantıyı küçük harfe çevirir', () => {
    expect(mediaExtension('Tahta.PNG', 'image/png')).toBe('png')
  })
  it('jpeg uzantısını jpg yapar', () => {
    expect(mediaExtension('foto.jpeg', 'image/jpeg')).toBe('jpg')
  })
  it('ad uzantısızsa MIME türüne döner', () => {
    expect(mediaExtension('image', 'image/png')).toBe('png')
    expect(mediaExtension('', 'application/pdf')).toBe('pdf')
  })
  it('garip uzantıyı reddeder, bilinmeyen MIME için bin verir', () => {
    expect(mediaExtension('a.ü', 'application/x-bilinmez')).toBe('bin')
    expect(mediaExtension('a.çokuzunuzantı', 'image/webp')).toBe('webp')
  })
  it('noktayla başlayan adı uzantı saymaz', () => {
    expect(mediaExtension('.gitignore', 'text/plain')).toBe('txt')
  })
})

describe('mediaFileName ve isMediaFileName', () => {
  it('hash + uzantı üretir ve bu ad geçerlidir', () => {
    const name = mediaFileName(HASH, 'x.png', 'image/png')
    expect(name).toBe(`${HASH}.png`)
    expect(isMediaFileName(name)).toBe(true)
  })
  it('yol kaçışı ve biçimsiz adları reddeder', () => {
    expect(isMediaFileName(`../${HASH}.png`)).toBe(false)
    expect(isMediaFileName(`${HASH}.png/..`)).toBe(false)
    expect(isMediaFileName('secondmind.db')).toBe(false)
    expect(isMediaFileName(`${'A'.repeat(64)}.png`)).toBe(false)
  })
})

describe('dumpKind', () => {
  it('eksiz döküm metindir', () => expect(dumpKind([])).toBe('text'))
  it('ilk ek resimse resim', () => expect(dumpKind(['image/png', 'application/pdf'])).toBe('image'))
  it('ilk ek resim değilse dosya', () => expect(dumpKind(['application/pdf'])).toBe('file'))
})
