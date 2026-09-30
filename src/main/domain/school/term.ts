import { addDays, differenceInCalendarDays, getISODay, startOfWeek } from 'date-fns'
import type { DayKey } from '@shared/ipc'
import { dayKey, parseDayKey } from '../recurrence'

// Dönem takvimi: hafta numarası, hafta aralığı, ilerleme, ders tonları, dersin oturumları.
// Haftalar Pazartesi başlar; 1. hafta dönemin ilk gününün içinde olduğu haftadır.

export type TermDates = { startDate: DayKey; endDate: DayKey; weekCount: number }

const monday = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })

/** Günün dönem haftası: 1..weekCount; öncesi 0, sonrası weekCount + 1. */
export function termWeek(term: TermDates, day: DayKey): number {
  const diff = differenceInCalendarDays(monday(parseDayKey(day)), monday(parseDayKey(term.startDate)))
  const week = Math.floor(diff / 7) + 1
  if (week < 1) return 0
  return Math.min(week, term.weekCount + 1)
}

/** Haftanın Pazartesi–Pazar aralığı. */
export function weekRange(term: Pick<TermDates, 'startDate'>, weekNo: number): { start: DayKey; end: DayKey } {
  const start = addDays(monday(parseDayKey(term.startDate)), (weekNo - 1) * 7)
  return { start: dayKey(start), end: dayKey(addDays(start, 6)) }
}

/** Dönemin geçen kısmı (0–1), takvim günüyle. */
export function termProgress(term: TermDates, day: DayKey): number {
  const total = differenceInCalendarDays(parseDayKey(term.endDate), parseDayKey(term.startDate)) + 1
  const done = differenceInCalendarDays(parseDayKey(day), parseDayKey(term.startDate)) + 1
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, done / total))
}

/** Dönemin bitiş günü: başlangıç haftasından `weekCount` hafta sonraki Pazar (Cuma değil; hafta sonu da dönem). */
export function defaultEndDate(startDate: DayKey, weekCount: number): DayKey {
  return dayKey(addDays(monday(parseDayKey(startDate)), weekCount * 7 - 1))
}

/**
 * Gök mavisinin tonları: her ders bir ton (TASARIM.md). Hepsi açık; üstündeki metin #131316.
 * Sıra, yan yana derslerin ayrışacağı şekilde karışık.
 */
export const COURSE_TONES = [
  '#7CC4FF',
  '#B5DEFF',
  '#4FA8F2',
  '#9ED0F7',
  '#69D0F0',
  '#8DB5EE',
  '#C9E8FF',
  '#5BBBE6',
] as const

/** Kullanılmayan ilk ton; hepsi kullanıldıysa en az kullanılan. */
export function nextTone(used: readonly string[]): string {
  const counts = new Map<string, number>(COURSE_TONES.map((t) => [t, 0]))
  for (const u of used) if (counts.has(u.toUpperCase())) counts.set(u.toUpperCase(), counts.get(u.toUpperCase())! + 1)
  let best: string = COURSE_TONES[0]
  for (const t of COURSE_TONES) if (counts.get(t)! < counts.get(best)!) best = t
  return best
}

export type SlotDef = { id: string; weekday: number; startMin: number; endMin: number }

export type SlotOccurrence = { slotId: string; day: DayKey; startMin: number; endMin: number }

/** Dersin dönem içindeki bütün oturumları (başlangıç ile bitiş arası, iki uç dahil), tarih sırasıyla. */
export function slotOccurrences(
  term: Pick<TermDates, 'startDate' | 'endDate'>,
  slots: readonly SlotDef[],
  until?: DayKey,
): SlotOccurrence[] {
  const out: SlotOccurrence[] = []
  const last = until && until < term.endDate ? until : term.endDate
  let d = parseDayKey(term.startDate)
  const end = parseDayKey(last)
  while (d <= end) {
    const iso = getISODay(d)
    const key = dayKey(d)
    for (const s of slots)
      if (s.weekday === iso) out.push({ slotId: s.id, day: key, startMin: s.startMin, endMin: s.endMin })
    d = addDays(d, 1)
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin)
}

/**
 * Dersin sıradaki oturumu: bugün henüz bitmemiş (sürmekte olan dahil) ya da sonraki günlerdeki ilk oturum.
 * Dönem dışı günler atlanır; dönem bittiyse null.
 */
export function nextOccurrence(
  term: Pick<TermDates, 'startDate' | 'endDate'>,
  slots: readonly SlotDef[],
  today: DayKey,
  nowMin: number,
): SlotOccurrence | null {
  if (!slots.length) return null
  let d = parseDayKey(today < term.startDate ? term.startDate : today)
  for (let i = 0; i < 8; i++, d = addDays(d, 1)) {
    const key = dayKey(d)
    if (key > term.endDate) return null
    const iso = getISODay(d)
    const hit = slots
      .filter((s) => s.weekday === iso && (key > today || s.endMin > nowMin))
      .sort((a, b) => a.startMin - b.startMin)[0]
    if (hit) return { slotId: hit.id, day: key, startMin: hit.startMin, endMin: hit.endMin }
  }
  return null
}

/** Gün dönem içinde mi (iki uç dahil). */
export const inTerm = (term: Pick<TermDates, 'startDate' | 'endDate'>, day: DayKey) =>
  day >= term.startDate && day <= term.endDate
