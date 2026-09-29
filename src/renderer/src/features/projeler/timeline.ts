import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { tr } from 'date-fns/locale'

// Yol haritası zaman çizelgesinin yerleşimi (akış bandının haftalık/aylık hali): her tarihli taş bir blok
// (önceki taşın hedefinden kendi hedefine), hedefte pin, gecikecekse tahmine uzanan kesikli kuyruk.
// Saf hesap; çizim `Roadmap.tsx`'te.

export type TimelineMilestone = {
  id: string
  title: string
  /** 'YYYY-MM-DD'; null = tarihsiz (çizelgede değil, yanda listelenir). */
  targetDate: string | null
  /** Unix ms. */
  createdAt: number
  done: boolean
  /** Gerçekçi bitiş tahmini ve hedefi geçiyor mu (`milestone:scope`). */
  finishOn: string | null
  late: boolean
}

export type TimelineBlock = {
  id: string
  title: string
  targetDate: string
  /** Yüzde (0–100). */
  left: number
  width: number
  /** Hedef pininin yeri. */
  target: number
  /** Geç taşta tahminin yeri (çizelge dışındaysa sona kırpılır); değilse null. */
  finish: number | null
  late: boolean
  done: boolean
}

export type Timeline = {
  start: string
  end: string
  months: { key: string; label: string; left: number }[]
  weeks: number[]
  today: number
  blocks: TimelineBlock[]
  undated: TimelineMilestone[]
}

/** Çizelge en az bu kadar gün. */
export const MIN_SPAN_DAYS = 84
/** Sağda bırakılan boşluk; tahmin bundan uzaksa kırpılır. */
const TAIL_DAYS = 14
const MAX_AHEAD_DAYS = 365
/** Hedefi önceki taşla aynı güne düşen taşın bloğu en az bu kadar. */
const MIN_BLOCK_DAYS = 3

const day = (ms: number) => format(ms, 'yyyy-MM-dd')

export function layoutTimeline(items: readonly TimelineMilestone[], today: string): Timeline {
  const todayDate = parseISO(today)
  const dated = items
    .filter((m): m is TimelineMilestone & { targetDate: string } => m.targetDate !== null)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.createdAt - b.createdAt)
  const undated = items.filter((m) => m.targetDate === null)

  // Blok başlangıçları: ilk taş oluşturulduğu günden (hedeften sonraysa hedef − 3), sonrakiler öncekinin hedefinden.
  const spans = dated.map((m, i) => {
    const end = parseISO(m.targetDate)
    let start = i === 0 ? parseISO(day(m.createdAt)) : parseISO(dated[i - 1]!.targetDate)
    if (differenceInCalendarDays(end, start) < MIN_BLOCK_DAYS) start = addDays(end, -MIN_BLOCK_DAYS)
    return { m, start, end }
  })

  const limit = addDays(todayDate, MAX_AHEAD_DAYS)
  const clampAhead = (d: Date) => (d > limit ? limit : d)
  let first = todayDate
  let last = todayDate
  for (const s of spans) {
    if (s.start < first) first = s.start
    if (clampAhead(s.end) > last) last = clampAhead(s.end)
    if (s.m.late && s.m.finishOn) {
      const f = clampAhead(parseISO(s.m.finishOn))
      if (f > last) last = f
    }
  }
  const start = startOfWeek(addDays(first, -7), { weekStartsOn: 1 })
  let end = addDays(last, TAIL_DAYS)
  if (differenceInCalendarDays(end, start) < MIN_SPAN_DAYS) end = addDays(start, MIN_SPAN_DAYS)
  const total = differenceInCalendarDays(end, start)
  const pct = (d: Date) =>
    Math.min(100, Math.max(0, (differenceInCalendarDays(d, start) / total) * 100))

  const months: Timeline['months'] = []
  for (let m = startOfMonth(addDays(start, 1)); m < end; m = startOfMonth(addDays(m, 32))) {
    if (m < start) continue
    months.push({
      key: format(m, 'yyyy-MM'),
      label: format(m, 'LLL', { locale: tr }).toLocaleUpperCase('tr-TR'),
      left: pct(m),
    })
  }
  const weeks: number[] = []
  for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(pct(w))

  return {
    start: day(start.getTime()),
    end: day(end.getTime()),
    months,
    weeks,
    today: pct(todayDate),
    blocks: spans.map(({ m, start: s, end: e }) => {
      const left = pct(s)
      return {
        id: m.id,
        title: m.title,
        targetDate: m.targetDate,
        left,
        width: Math.max(0, pct(e) - left),
        target: pct(e),
        finish: m.late && m.finishOn && !m.done ? pct(parseISO(m.finishOn)) : null,
        late: m.late && !m.done,
        done: m.done,
      }
    }),
    undated,
  }
}
