import { describe, expect, it } from 'vitest'
import {
  compareProjects,
  dailyMinutes,
  folderKey,
  guessProjectKind,
  parseUnityVersion,
  pickProjectColor,
  PROJECT_COLORS,
  projectNameFromPath,
  sessionMinutes,
  silenceDays,
} from './projects'

const at = (day: number, hour = 12, min = 0) => new Date(2026, 8, day, hour, min)

describe('renk seçimi', () => {
  it('kullanılmayan ilk rengi verir, büyük/küçük harf fark etmez', () => {
    expect(pickProjectColor([])).toBe('#3BE08F')
    expect(pickProjectColor(['#3be08f', '#FF8A3D'])).toBe('#F59BE6')
  })
  it('palet dolunca en az kullanılanı verir', () => {
    expect(pickProjectColor([...PROJECT_COLORS, '#3BE08F'])).toBe('#FF8A3D')
  })
})

describe('klasörden tahmin', () => {
  it('tür: Unity > yazılım > yaratıcı', () => {
    expect(guessProjectKind({ unity: true, git: true, code: true })).toBe('unity')
    expect(guessProjectKind({ unity: false, git: true, code: false })).toBe('software')
    expect(guessProjectKind({ unity: false, git: false, code: true })).toBe('software')
    expect(guessProjectKind({ unity: false, git: false, code: false })).toBe('creative')
  })
  it('Unity sürümü', () => {
    const text = 'm_EditorVersion: 6000.3.18f1\nm_EditorVersionWithRevision: 6000.3.18f1 (5eb)'
    expect(parseUnityVersion(text)).toBe('6000.3.18f1')
    expect(parseUnityVersion('boş')).toBeNull()
  })
  it('ad klasörden, Türkçe büyük harf', () => {
    expect(projectNameFromPath('C:\\ajanda\\Runika\\')).toBe('Runika')
    expect(projectNameFromPath('D:/Müzik/ilk_albüm')).toBe('İlk albüm')
    expect(projectNameFromPath('C:\\')).toBe('')
  })
  it('yol anahtarı büyük/küçük harf ve eğik çizgi duyarsız', () => {
    expect(folderKey('C:/Ajanda/Runika/')).toBe(folderKey('c:\\ajanda\\runika'))
  })
})

describe('oturum süreleri', () => {
  it('süren oturum şimdiye kadar sayılır', () => {
    expect(sessionMinutes({ startedAt: at(28, 10), endedAt: null }, at(28, 11, 30))).toBe(90)
    expect(sessionMinutes({ startedAt: at(28, 10), endedAt: at(28, 10, 20) }, at(28, 12))).toBe(20)
  })
  it('günlük dakikalar: gece yarısını geçen oturum bölünür, pencere dışı kırpılır', () => {
    const spans = [
      { startedAt: at(26, 23), endedAt: at(27, 1) }, // 60 + 60
      { startedAt: at(28, 9), endedAt: null }, // süren: 9:00 → 10:30
      { startedAt: at(20, 10), endedAt: at(20, 11) }, // pencere dışı
    ]
    expect(dailyMinutes(spans, at(28, 10, 30), 3)).toEqual([60, 60, 90])
  })
  it('sessizlik takvim günüyle', () => {
    expect(silenceDays(at(27, 23), at(28, 1))).toBe(1)
    expect(silenceDays(at(28, 9), at(28, 20))).toBe(0)
  })
})

describe('liste sırası', () => {
  it('aktif önce, oturumu süren önce, sonra son etkinlik', () => {
    const p = (name: string, over: Partial<Parameters<typeof compareProjects>[0]> = {}) => ({
      name,
      status: 'active' as const,
      sessionOpen: false,
      lastActivityAt: 0,
      ...over,
    })
    const list = [
      p('Arşiv', { status: 'archived', lastActivityAt: 99 }),
      p('Eski', { lastActivityAt: 1 }),
      p('Yeni', { lastActivityAt: 5 }),
      p('Süren', { sessionOpen: true }),
      p('Duran', { status: 'paused', lastActivityAt: 50 }),
    ]
    expect(list.sort(compareProjects).map((x) => x.name)).toEqual([
      'Süren',
      'Yeni',
      'Eski',
      'Duran',
      'Arşiv',
    ])
  })
})
