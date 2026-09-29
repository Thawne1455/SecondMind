import { describe, expect, it } from 'vitest'
import { assetKind, mimeOf, suggestImageDirs, topArea } from './shots'

describe('varlık türü', () => {
  it('MIME önce, yoksa uzantı', () => {
    expect(assetKind('a.bin', 'image/png')).toBe('image')
    expect(assetKind('demo.WAV')).toBe('audio')
    expect(assetKind('gdd.pdf')).toBe('pdf')
    expect(assetKind('proje.blend')).toBe('other')
    expect(mimeOf('kare.JPG')).toBe('image/jpeg')
    expect(mimeOf('demo.mp3')).toBe('audio/mpeg')
  })
})

describe('görüntü klasörü önerisi', () => {
  it('adı ekran görüntüsünü andıran, resimli, bağlı olmayan klasörler; çok resimli önce', () => {
    const dirs = [
      { path: 'Assets/Screenshots', images: 4 },
      { path: 'Captures', images: 34 },
      { path: 'Assets/Sprites', images: 200 },
      { path: 'Recordings/Captures', images: 0 },
      { path: '.secondmind/goruntuler', images: 5 },
      { path: 'Ekran Görüntüleri', images: 2 },
    ]
    expect(suggestImageDirs(dirs, ['assets/screenshots']).map((d) => d.path)).toEqual([
      'Captures',
      'Ekran Görüntüleri',
    ])
  })
})

describe('günün alanı', () => {
  it('commit alanları toplanır, en çok değişen; eşitlikte alfabetik', () => {
    expect(topArea([{ Kod: 3, Ses: 1 }, { Ses: 4 }])).toBe('Ses')
    expect(topArea([{ Kod: 2, Görsel: 2 }])).toBe('Görsel')
    expect(topArea([])).toBeNull()
  })
})
