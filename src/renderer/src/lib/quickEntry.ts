import { addDays, format, getISODay } from 'date-fns'
import type { DayKey, ReminderRule } from '@shared/ipc'

// Hızlı giriş: tek satır metinden gün, saat, süre, öncelik ve tekrarı ayıklar (AI değil, kural).
//   "yarın 10:00 kitabı iade et"      → gün + saat
//   "raporu yaz 45dk ! son cuma"      → süre, yüksek öncelik, son tarih
//   "her pzt 09:00 haftalık plan"     → tekrar
// Tanınan kelimeler başlıktan çıkar; gerisi olduğu gibi kalır.

export type QuickEntry = {
  title: string
  /** Yapılacağı / çalacağı gün. */
  date: DayKey | null
  /** "son <gün>" ile verilen son tarih. */
  dueDate: DayKey | null
  time: string | null
  estimateMin: number | null
  /** "!" yazıldıysa 3 (yüksek). */
  priority: 3 | null
  /** Tekrar; saati `time` (yoksa `defaultTime`). */
  repeat: RepeatSpec | null
}

export type RepeatSpec =
  { kind: 'weekly'; days: number[] } | { kind: 'monthly' } | { kind: 'yearly' }

type Options = {
  /** Saat ve tekrar tanınsın mı (hatırlatma: evet; görev: hayır, "10:00" başlıkta kalır). */
  clock?: boolean
}

const DAY_NAMES: Record<string, number> = {
  pazartesi: 1,
  pzt: 1,
  salı: 2,
  sal: 2,
  çarşamba: 3,
  çar: 3,
  çrş: 3,
  perşembe: 4,
  per: 4,
  prş: 4,
  cuma: 5,
  cum: 5,
  cumartesi: 6,
  cmt: 6,
  pazar: 7,
  paz: 7,
}

const MONTHS = [
  'ocak',
  'şubat',
  'mart',
  'nisan',
  'mayıs',
  'haziran',
  'temmuz',
  'ağustos',
  'eylül',
  'ekim',
  'kasım',
  'aralık',
]

function monthIndex(word: string): number {
  const full = MONTHS.indexOf(word)
  if (full >= 0) return full
  // Üç harfli kısaltma: oca, şub, mar, nis, may, haz, tem, ağu, eyl, eki, kas, ara.
  return word.length === 3 ? MONTHS.findIndex((m) => m.startsWith(word)) : -1
}

const key = (d: Date): DayKey => format(d, 'yyyy-MM-dd')

/** Bugünden itibaren bu hafta gününe denk gelen ilk gün (bugün dahil). */
function nextWeekday(now: Date, isoDay: number): Date {
  return addDays(now, (isoDay - getISODay(now) + 7) % 7)
}

type Match = { length: number; apply: (e: QuickEntry) => void }

/** `words[i]`'den başlayan gün ifadesi: bugün, yarın, öbür gün, gün adı, "5 ekim". */
function matchDay(words: string[], i: number, now: Date): { length: number; day: Date } | null {
  const w = words[i]!
  if (w === 'bugün') return { length: 1, day: now }
  if (w === 'yarın') return { length: 1, day: addDays(now, 1) }
  if (w === 'öbürgün') return { length: 1, day: addDays(now, 2) }
  if (w === 'öbür' && words[i + 1] === 'gün') return { length: 2, day: addDays(now, 2) }
  if (w in DAY_NAMES) return { length: 1, day: nextWeekday(now, DAY_NAMES[w]!) }
  const num = /^(\d{1,2})$/.exec(w)
  const month = words[i + 1] !== undefined ? monthIndex(words[i + 1]!) : -1
  if (num && month >= 0) {
    const d = Number(num[1])
    let day = new Date(now.getFullYear(), month, d)
    if (day.getMonth() !== month) return null // 31 şubat
    if (key(day) < key(now)) day = new Date(now.getFullYear() + 1, month, d)
    return { length: 2, day }
  }
  return null
}

function matchAt(words: string[], i: number, now: Date, opts: Options): Match | null {
  const w = words[i]!
  const next = words[i + 1]

  if (w === '!' || w === '!!') return { length: 1, apply: (e) => (e.priority = 3) }

  // Süre: "45dk", "1.5sa", "45 dk", "2 saat"
  const dur = /^(\d+(?:[.,]\d+)?)(dk|dakika|sa|saat)?$/.exec(w)
  if (dur) {
    const unit = dur[2] ?? (next && /^(dk|dakika|sa|saat)$/.test(next) ? next : undefined)
    if (unit) {
      const n = Number(dur[1]!.replace(',', '.'))
      const min = Math.round(unit === 'dk' || unit === 'dakika' ? n : n * 60)
      if (min >= 5 && min <= 24 * 60)
        return { length: dur[2] ? 1 : 2, apply: (e) => (e.estimateMin = min) }
    }
  }

  if (w === 'son' && next !== undefined) {
    const day = matchDay(words, i + 1, now)
    if (day) return { length: day.length + 1, apply: (e) => (e.dueDate = key(day.day)) }
  }

  if (opts.clock) {
    const t = /^(\d{1,2})[:.](\d{2})$/.exec(w)
    if (t && Number(t[1]) <= 23 && Number(t[2]) <= 59) {
      const time = `${t[1]!.padStart(2, '0')}:${t[2]}`
      return { length: 1, apply: (e) => (e.time = time) }
    }
    if (w === 'her' && next !== undefined) {
      if (next === 'gün')
        return {
          length: 2,
          apply: (e) => (e.repeat = { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] }),
        }
      if (next === 'ay') return { length: 2, apply: (e) => (e.repeat = { kind: 'monthly' }) }
      if (next === 'yıl') return { length: 2, apply: (e) => (e.repeat = { kind: 'yearly' }) }
      if (next in DAY_NAMES) {
        const d = DAY_NAMES[next]!
        return {
          length: 2,
          apply: (e) => {
            e.repeat = { kind: 'weekly', days: [d] }
            e.date = key(nextWeekday(now, d))
          },
        }
      }
    }
    if (w === 'hafta' && (next === 'içi' || next === 'içleri'))
      return { length: 2, apply: (e) => (e.repeat = { kind: 'weekly', days: [1, 2, 3, 4, 5] }) }
    if (w === 'hafta' && (next === 'sonu' || next === 'sonları'))
      return { length: 2, apply: (e) => (e.repeat = { kind: 'weekly', days: [6, 7] }) }
  }

  const day = matchDay(words, i, now)
  if (day) return { length: day.length, apply: (e) => (e.date = key(day.day)) }
  return null
}

export function parseQuickEntry(text: string, now: Date, opts: Options = {}): QuickEntry {
  const entry: QuickEntry = {
    title: '',
    date: null,
    dueDate: null,
    time: null,
    estimateMin: null,
    priority: null,
    repeat: null,
  }
  const original = text.trim().split(/\s+/).filter(Boolean)
  const words = original.map((w) => w.toLocaleLowerCase('tr-TR'))
  const kept: string[] = []
  for (let i = 0; i < words.length;) {
    const m = matchAt(words, i, now, opts)
    if (m) {
      m.apply(entry)
      i += m.length
    } else {
      kept.push(original[i]!)
      i++
    }
  }
  entry.title = kept.join(' ')
  return entry
}

/** Ayrıştırılan tekrar + saat → kayıt kuralı. Aylık/yıllık gün, verilen günden (yoksa bugünden) alınır. */
export function toReminderRule(repeat: RepeatSpec, time: string, day: Date): ReminderRule {
  switch (repeat.kind) {
    case 'weekly':
      return { kind: 'weekly', days: repeat.days, time }
    case 'monthly':
      return { kind: 'monthly', day: day.getDate(), time }
    case 'yearly':
      return { kind: 'yearly', month: day.getMonth() + 1, day: day.getDate(), time }
  }
}
