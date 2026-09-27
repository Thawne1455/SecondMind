import { describe, expect, it } from 'vitest'
import { formatAgo, formatBytes } from './format'

describe('formatBytes', () => {
  it('Türkçe ondalık virgülle yazar', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1,2 MB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB')
  })
})

describe('formatAgo', () => {
  const now = new Date(2026, 8, 27, 15, 0).getTime()
  const ago = (ms: number) => formatAgo(now - ms, now)
  const MIN = 60_000

  it('bir dakikadan azı "az önce"', () => {
    expect(ago(30_000)).toBe('az önce')
    expect(formatAgo(now + 5000, now)).toBe('az önce')
  })
  it('dakika, saat, gün', () => {
    expect(ago(14 * MIN)).toBe('14 dk önce')
    expect(ago(3 * 60 * MIN)).toBe('3 sa önce')
    expect(ago(30 * 60 * MIN)).toBe('dün')
    expect(ago(4 * 24 * 60 * MIN)).toBe('4 gün önce')
  })
  it('bir haftadan eskisi Türkçe tarih', () => {
    expect(formatAgo(new Date(2026, 8, 3).getTime(), now)).toBe('3 Eyl')
    expect(formatAgo(new Date(2025, 11, 31).getTime(), now)).toBe('31 Ara 2025')
  })
})
