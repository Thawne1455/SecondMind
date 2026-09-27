import { describe, expect, it } from 'vitest'
import { blockTiming, formatDuration, hourTicks, parseTime, timeToPercent } from './flow'

describe('parseTime', () => {
  it('saati dakikaya çevirir', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('13:40')).toBe(820)
    expect(parseTime('9:05')).toBe(545)
  })
  it('geçersiz biçimi reddeder', () => {
    expect(() => parseTime('1340')).toThrow()
  })
})

describe('timeToPercent', () => {
  it('08–24 aralığını 0–100 yapar', () => {
    expect(timeToPercent(parseTime('08:00'))).toBe(0)
    expect(timeToPercent(parseTime('16:00'))).toBe(50)
    expect(timeToPercent(parseTime('24:00'))).toBe(100)
    expect(timeToPercent(parseTime('13:40'))).toBeCloseTo(35.42, 2)
  })
  it('bant dışını kenara yapıştırır', () => {
    expect(timeToPercent(parseTime('06:30'))).toBe(0)
  })
})

describe('formatDuration', () => {
  it('saat ve dakikayı Türkçe yazar', () => {
    expect(formatDuration(260)).toBe('4 sa 20 dk')
    expect(formatDuration(120)).toBe('2 sa')
    expect(formatDuration(50)).toBe('50 dk')
  })
})

describe('blockTiming', () => {
  const now = parseTime('13:40')
  it('bitmiş, süren ve gelecek blokları ayırır', () => {
    expect(blockTiming(parseTime('09:00'), parseTime('10:50'), now)).toBe('past')
    expect(blockTiming(parseTime('13:00'), parseTime('14:30'), now)).toBe('current')
    expect(blockTiming(parseTime('15:00'), parseTime('16:50'), now)).toBe('future')
  })
  it('tam şimdi biten blok geçmiştir', () => {
    expect(blockTiming(parseTime('12:40'), now, now)).toBe('past')
  })
})

describe('hourTicks', () => {
  it('iki saatte bir etiket', () => {
    expect(hourTicks()).toEqual([8, 10, 12, 14, 16, 18, 20, 22, 24])
  })
})
