import { describe, expect, it } from 'vitest'
import {
  formatAgo,
  formatBytes,
  formatDayName,
  formatMinutes,
  formatReminderAt,
  formatRule,
} from './format'

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

// 28 Eylül 2026 Pazartesi.
const at = (day: number, hour = 12, min = 0, month = 8) => new Date(2026, month, day, hour, min)

describe('planlama biçimleri', () => {
  it('gün adı', () => {
    expect(formatDayName(at(28, 23), at(28, 1))).toBe('Bugün')
    expect(formatDayName(at(29), at(28))).toBe('Yarın')
    expect(formatDayName(at(27), at(28))).toBe('Dün')
    expect(formatDayName(at(2, 12, 0, 9), at(28))).toBe('Cuma')
    expect(formatDayName(at(5, 12, 0, 9), at(28))).toBe('5 Eki')
  })

  it('hatırlatma zamanı', () => {
    const now = at(28).getTime()
    expect(formatReminderAt(at(28, 20).getTime(), now)).toBe('20:00')
    expect(formatReminderAt(at(29, 10).getTime(), now)).toBe('Yarın 10:00')
    expect(formatReminderAt(at(27, 18).getTime(), now)).toBe('Dün 18:00')
    expect(formatReminderAt(at(29, 10).getTime() + 86_400_000, now)).toBe('Çar 10:00')
    expect(formatReminderAt(at(14, 9, 0, 9).getTime(), now)).toBe('14 Eki 09:00')
  })

  it('tekrar ve süre', () => {
    expect(formatRule({ kind: 'weekly', days: [7, 6] })).toBe('Hafta sonu')
    expect(formatRule({ kind: 'weekly', days: [1, 3] })).toBe('Pzt, Çar')
    expect(formatRule({ kind: 'monthly', day: 14 })).toBe('Her ay 14.')
    expect(formatRule({ kind: 'yearly', month: 10, day: 14 })).toBe('Her yıl 14 Eki')
    expect(formatMinutes(45)).toBe('45 dk')
    expect(formatMinutes(90)).toBe('1 sa 30 dk')
    expect(formatMinutes(120)).toBe('2 sa')
  })
})
