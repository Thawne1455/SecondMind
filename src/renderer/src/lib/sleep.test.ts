import { describe, expect, it } from 'vitest'
import { formatSleep, parseSleep } from './sleep'

describe('parseSleep', () => {
  it('saat, saat:dakika, ondalık ve kelimeli yazımlar', () => {
    expect(parseSleep('7')).toBe(420)
    expect(parseSleep('7:15')).toBe(435)
    expect(parseSleep('7.15')).toBe(435)
    expect(parseSleep('7.5')).toBe(450)
    expect(parseSleep('7,5')).toBe(450)
    expect(parseSleep('6 sa 40 dk')).toBe(400)
    expect(parseSleep('8s')).toBe(480)
    expect(parseSleep(' 0 ')).toBe(0)
  })
  it('boş alanı boşaltır, anlaşılmayanı ve 16 saati aşanı reddeder', () => {
    expect(parseSleep('  ')).toBeNull()
    expect(parseSleep('yedi')).toBeUndefined()
    expect(parseSleep('7:75')).toBeUndefined()
    expect(parseSleep('17')).toBeUndefined()
  })
})

describe('formatSleep', () => {
  it('dakikayı s:dd yazar', () => {
    expect(formatSleep(435)).toBe('7:15')
    expect(formatSleep(480)).toBe('8:00')
  })
})
