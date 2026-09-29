import { describe, expect, it } from 'vitest'
import {
  adrBody,
  DECISIONS_TITLE,
  docTemplate,
  looksLikeGdd,
  relativeInside,
  titleFromPath,
} from './docTemplates'

describe('doküman şablonları', () => {
  it('Unity: GDD kökü (gdd türünde) ve spesifikasyondaki bölümler, sonra Kararlar', () => {
    const [gdd, decisions] = docTemplate('unity')
    expect(gdd!.kind).toBe('gdd')
    expect(gdd!.children.map((c) => c.title)).toEqual([
      'Oyun özeti',
      'Temel döngü',
      'Mekanikler',
      'Bölümler / Sahneler',
      'Karakterler',
      'Sanat yönü',
      'Ses listesi',
      'Arayüz ve menüler',
      'Kontroller',
      'Teknik notlar',
      'Yayın',
    ])
    expect(decisions!.title).toBe(DECISIONS_TITLE)
  })

  it('ses listesi GFM tablosu: başlık, ayraç ve boş satır', () => {
    const sound = docTemplate('unity')[0]!.children.find((c) => c.title === 'Ses listesi')!
    expect(sound.bodyMd.split('\n')).toEqual([
      '| Parça | Sahne | Süre | Döngü | Durum |',
      '| --- | --- | --- | --- | --- |',
      '|  |  |  |  |  |',
    ])
  })

  it('yazılım ve yaratıcı şablonları, genel boş', () => {
    expect(docTemplate('software')[0]!.children.map((c) => c.title)).toEqual([
      'Genel bakış',
      'Mimari',
      'Kurulum',
      'Veri modeli',
    ])
    expect(docTemplate('creative')[0]!.children).toHaveLength(5)
    expect(docTemplate('general')).toEqual([])
  })

  it('ADR gövdesi tarih ve dört bölüm', () => {
    const body = adrBody(new Date(2026, 8, 29))
    expect(body.startsWith('**Tarih:** 29 Eylül 2026')).toBe(true)
    expect(body.match(/^## /gm)).toHaveLength(4)
  })

  it('bağlı dosya başlığı ve GDD tahmini', () => {
    expect(titleFromPath('Assets\\Notlar\\GDD_Runika.md')).toBe('GDD Runika')
    expect(looksLikeGdd('Assets/Notlar/GDD_Runika.md')).toBe(true)
    expect(looksLikeGdd('docs/tasarim-dokumani.md')).toBe(true)
    expect(looksLikeGdd('Assets/Notlar/Sesler.md')).toBe(false)
    expect(looksLikeGdd('budget.md')).toBe(false)
  })
})

describe('relativeInside', () => {
  it('içerideki dosya göreli yolunu verir, dışarıdakini reddeder', () => {
    const root = String.raw`C:\ajanda\Runika`
    expect(relativeInside(root, String.raw`C:\ajanda\Runika\Assets\Notlar\GDD.md`)).toBe(
      'Assets/Notlar/GDD.md',
    )
    expect(relativeInside(`${root}\\`, 'c:/AJANDA/runika/a.md')).toBe('a.md')
    expect(relativeInside(root, String.raw`C:\ajanda\Runika2\a.md`)).toBeNull()
    expect(relativeInside(root, String.raw`C:\ajanda\Runika\..\x.md`)).toBeNull()
    expect(relativeInside(root, root)).toBeNull()
  })
})
