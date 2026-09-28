import { addDays, format, getDaysInMonth, getISODay, startOfDay } from 'date-fns'
import type { DayKey, ReminderRule } from '@shared/ipc'

// Tekrar kuralları ve hatırlatma taraması. Saf fonksiyonlar; "şimdi" her zaman dışarıdan gelir.
// Günler yerel takvime göre: yaz saati geçişinde de "her gün 09:00" 09:00'da çalar.

/** Uygulama bu kadar geç kalmışsa (uyku, meşgul) hatırlatma yine çalar; daha geçse kaçırılmış sayılır. */
export const REMINDER_GRACE_MS = 10 * 60_000

/** Yerel gün anahtarı: 'YYYY-MM-DD'. */
export const dayKey = (d: Date): DayKey => format(d, 'yyyy-MM-dd')

/** 'YYYY-MM-DD' → o günün yerel başlangıcı. */
export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** Gün + 'HH:mm' → yerel an. */
export function atClock(day: Date, clock: string): Date {
  const [h, m] = clock.split(':').map(Number) as [number, number]
  const d = startOfDay(day)
  d.setHours(h, m, 0, 0)
  return d
}

/** Kural bu günde çalıyor mu? */
export function ruleMatchesDay(rule: ReminderRule, day: Date): boolean {
  switch (rule.kind) {
    case 'weekly':
      return rule.days.includes(getISODay(day))
    case 'monthly':
      return day.getDate() === Math.min(rule.day, getDaysInMonth(day))
    case 'yearly':
      return (
        day.getMonth() === rule.month - 1 &&
        day.getDate() === Math.min(rule.day, getDaysInMonth(day))
      )
  }
}

// Yıllık kuralda bile bir yıl + bir gün içinde mutlaka bir eşleşme vardır.
const SEARCH_DAYS = 367

/** `after`'dan kesinlikle sonraki ilk çalma. */
export function nextOccurrence(rule: ReminderRule, after: Date): Date {
  for (let i = 0; i <= SEARCH_DAYS; i++) {
    const day = addDays(startOfDay(after), i)
    if (!ruleMatchesDay(rule, day)) continue
    const at = atClock(day, rule.time)
    if (at.getTime() > after.getTime()) return at
  }
  throw new Error('Tekrar kuralı hiç çalmıyor')
}

/** `upTo` anına kadar (dahil) son çalma. */
export function lastOccurrence(rule: ReminderRule, upTo: Date): Date {
  for (let i = 0; i <= SEARCH_DAYS; i++) {
    const day = addDays(startOfDay(upTo), -i)
    if (!ruleMatchesDay(rule, day)) continue
    const at = atClock(day, rule.time)
    if (at.getTime() <= upTo.getTime()) return at
  }
  throw new Error('Tekrar kuralı hiç çalmıyor')
}

export type ReminderTimes = {
  id: string
  at: Date
  rule: ReminderRule | null
  firedAt: Date | null
  missedAt: Date | null
}

/** Çalmayı bekliyor mu: tek seferlikte henüz çalmamış ve kaçırılmamış; tekrarlayan hep bekler. */
export const isPending = (r: ReminderTimes): boolean =>
  r.rule !== null || (r.firedAt === null && r.missedAt === null)

export type SweepResult = {
  id: string
  /** 'fire': bildirim göster. 'miss': kaçırıldı, Bugün'de rozet. */
  outcome: 'fire' | 'miss'
  /** Çalması gereken an (tekrarlayanda en son kaçırılan tekrar). */
  dueAt: Date
  /** Tekrarlayanın sıradaki çalması; tek seferlikte null. */
  nextAt: Date | null
}

/**
 * Zamanı gelmiş hatırlatmalar. Hem dakikalık kontrolde hem açılışta aynı kural: `grace` içinde gecikmiş
 * olan çalar, daha eskisi kaçırılmış sayılır. Tekrarlayanda birden çok kaçırılmış tekrar tek kayıt olur.
 */
export function sweepReminders(
  rows: readonly ReminderTimes[],
  now: Date,
  grace = REMINDER_GRACE_MS,
): SweepResult[] {
  const out: SweepResult[] = []
  for (const r of rows) {
    if (!isPending(r) || r.at.getTime() > now.getTime()) continue
    const dueAt = r.rule ? lastOccurrence(r.rule, now) : r.at
    out.push({
      id: r.id,
      outcome: now.getTime() - dueAt.getTime() <= grace ? 'fire' : 'miss',
      dueAt,
      nextAt: r.rule ? nextOccurrence(r.rule, now) : null,
    })
  }
  return out
}
