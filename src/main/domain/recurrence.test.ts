import { describe, expect, it } from 'vitest'
import type { ReminderRule } from '@shared/ipc'
import {
  atClock,
  dayKey,
  lastOccurrence,
  nextOccurrence,
  parseDayKey,
  REMINDER_GRACE_MS,
  ruleMatchesDay,
  sweepReminders,
  type ReminderTimes,
} from './recurrence'

// Yerel saatle. 28 Eylül 2026 Pazartesi.
const d = (day: number, hour = 12, min = 0, month = 8, year = 2026) =>
  new Date(year, month, day, hour, min)

const weekdays: ReminderRule = { kind: 'weekly', days: [1, 2, 3, 4, 5], time: '09:00' }

describe('gün anahtarı ve saat', () => {
  it('yerel gün anahtarı gidip gelir', () => {
    expect(dayKey(d(28, 23, 59))).toBe('2026-09-28')
    expect(parseDayKey('2026-09-28')).toEqual(d(28, 0))
    expect(atClock(d(28, 17), '08:30')).toEqual(d(28, 8, 30))
  })
})

describe('tekrar kuralları', () => {
  it('haftalık: hafta içi', () => {
    expect(ruleMatchesDay(weekdays, d(28))).toBe(true) // Pzt
    expect(ruleMatchesDay(weekdays, d(27))).toBe(false) // Paz
  })

  it('sıradaki çalma kesinlikle sonra; hafta sonunu atlar', () => {
    expect(nextOccurrence(weekdays, d(28, 8))).toEqual(d(28, 9))
    expect(nextOccurrence(weekdays, d(28, 9))).toEqual(d(29, 9))
    expect(nextOccurrence(weekdays, d(2, 10, 0, 9))).toEqual(d(5, 9, 0, 9)) // Cuma → Pazartesi
  })

  it('aylık: ayda o gün yoksa ayın son günü', () => {
    const rule: ReminderRule = { kind: 'monthly', day: 31, time: '10:00' }
    expect(nextOccurrence(rule, d(28))).toEqual(d(30, 10)) // Eylül 30 gün
    expect(nextOccurrence(rule, d(30, 11))).toEqual(d(31, 10, 0, 9))
  })

  it('yıllık: 29 Şubat artık olmayan yılda 28 Şubat', () => {
    const rule: ReminderRule = { kind: 'yearly', month: 2, day: 29, time: '09:00' }
    expect(nextOccurrence(rule, d(28))).toEqual(d(28, 9, 0, 1, 2027))
    expect(nextOccurrence(rule, d(1, 12, 0, 2, 2027))).toEqual(d(29, 9, 0, 1, 2028))
  })

  it('son çalma: şimdiye kadar (dahil)', () => {
    expect(lastOccurrence(weekdays, d(28, 9))).toEqual(d(28, 9))
    expect(lastOccurrence(weekdays, d(28, 8))).toEqual(d(25, 9)) // önceki Cuma
  })
})

describe('hatırlatma taraması', () => {
  const r = (over: Partial<ReminderTimes>): ReminderTimes => ({
    id: 'r',
    at: d(28, 20),
    rule: null,
    firedAt: null,
    missedAt: null,
    ...over,
  })

  it('zamanı gelmemiş olana dokunmaz', () => {
    expect(sweepReminders([r({})], d(28, 19, 59))).toEqual([])
  })

  it('pay içinde gecikmiş çalar, daha eskisi kaçırılır', () => {
    const late = new Date(d(28, 20).getTime() + REMINDER_GRACE_MS)
    expect(sweepReminders([r({})], late)[0]?.outcome).toBe('fire')
    expect(sweepReminders([r({})], d(28, 21))[0]).toEqual({
      id: 'r',
      outcome: 'miss',
      dueAt: d(28, 20),
      nextAt: null,
    })
  })

  it('tek seferlik: çalmış ya da kaçırılmış olan bir daha taranmaz', () => {
    expect(sweepReminders([r({ firedAt: d(28, 20) })], d(29))).toEqual([])
    expect(sweepReminders([r({ missedAt: d(28, 20) })], d(29))).toEqual([])
  })

  it('tekrarlayan: birden çok kaçırılan tek kayıt, sıradaki çalma ileri alınır', () => {
    // Cuma 09:00'dan beri açılmadı; Pazartesi 12:00'de açıldı.
    const [s] = sweepReminders([r({ at: d(25, 9), rule: weekdays })], d(28, 12))
    expect(s).toEqual({ id: 'r', outcome: 'miss', dueAt: d(28, 9), nextAt: d(29, 9) })
  })

  it('tekrarlayan: eskisi kaçmış ama bugünkü pay içindeyse sadece çalar', () => {
    const [s] = sweepReminders([r({ at: d(25, 9), rule: weekdays })], d(28, 9, 3))
    expect(s).toMatchObject({ outcome: 'fire', dueAt: d(28, 9), nextAt: d(29, 9) })
  })
})
