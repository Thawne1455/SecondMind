import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { DayKey } from '@shared/ipc'
import { dayKey, parseDayKey } from './recurrence'

// Kapsam ölçer (PROJELER.md > Yol haritası > Kapsam ölçer): taşa eklenen/biten görevler, kapsam eğilimi
// ve gerçekçi bitiş tahmini. Tamamen algoritmik; metinleri renderer yazar ("şimdi" dışarıdan gelir).

/** Grafikteki hafta sayısı. */
export const SCOPE_WEEKS = 8
/** Eğilim cümlesinin penceresi (gün). */
export const TREND_DAYS = 14
/** Eklenen > biten × bu katsayı ise kapsam büyüyor. */
export const GROWING_FACTOR = 1.5
/** "Büyüyor" demek için gereken en az eklenen görev. */
export const GROWING_MIN_ADDED = 4
/** Oran için bakılan son bitmiş görev sayısı. */
export const RATIO_SAMPLE_LIMIT = 20
/** Bundan az örnek varsa oran FALLBACK_RATIO. */
export const RATIO_MIN_SAMPLES = 5
export const FALLBACK_RATIO = 1.5
/** Tahmini olmayan görevin süresi (dk). */
export const DEFAULT_TASK_MIN = 60
/** Hız: son bu kadar günde çalışılan dakikanın günlük ortalaması. */
export const PACE_DAYS = 14

const DAY = 86_400_000

export type ScopeTask = {
  /** Görevin taşa bağlandığı an; bağlı değilse null. */
  milestoneSetAt: number | null
  completedAt: number | null
}

export type ScopeWeek = {
  /** Haftanın Pazartesi'si. */
  weekStart: DayKey
  /** Bu hafta taşa bağlanan görev. */
  added: number
  /** Bu hafta biten görev. */
  done: number
  /** Hafta sonunda taşa bağlı olup bitmemiş görev. */
  remaining: number
}

/**
 * Son `weeks` hafta (Pazartesi başlangıçlı, en eski önce, son eleman bu hafta): eklenen, biten ve
 * hafta sonundaki kalan görev sayısı.
 */
export function scopeWeeks(
  tasks: readonly ScopeTask[],
  now: number,
  weeks: number = SCOPE_WEEKS,
): ScopeWeek[] {
  const first = addDays(startOfWeek(now, { weekStartsOn: 1 }), -7 * (weeks - 1))
  const index = (t: number) => Math.floor(differenceInCalendarDays(t, first) / 7)
  const out: ScopeWeek[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: dayKey(addDays(first, 7 * i)),
    added: 0,
    done: 0,
    remaining: 0,
  }))
  for (const t of tasks) {
    if (t.milestoneSetAt !== null) {
      const i = index(t.milestoneSetAt)
      if (i >= 0 && i < weeks) out[i]!.added++
    }
    if (t.completedAt !== null) {
      const i = index(t.completedAt)
      if (i >= 0 && i < weeks) out[i]!.done++
    }
  }
  out.forEach((w, i) => {
    const end = addDays(first, 7 * (i + 1)).getTime()
    w.remaining = tasks.filter(
      (t) =>
        t.milestoneSetAt !== null &&
        t.milestoneSetAt < end &&
        !(t.completedAt !== null && t.completedAt < end),
    ).length
  })
  return out
}

export type ScopeState = 'growing' | 'closing' | 'balanced'
export type ScopeTrend = { added: number; done: number; state: ScopeState }

/** Son 14 gün: eklenen > biten × 1,5 ve eklenen ≥ 4 → büyüyor; biten ≥ eklenen → kapanıyor; arası dengede. */
export function scopeTrend(tasks: readonly ScopeTask[], now: number): ScopeTrend {
  const since = now - TREND_DAYS * DAY
  const inWindow = (t: number | null) => t !== null && t > since && t <= now
  const added = tasks.filter((t) => inWindow(t.milestoneSetAt)).length
  const done = tasks.filter((t) => inWindow(t.completedAt)).length
  let state: ScopeState = 'balanced'
  if (added > done * GROWING_FACTOR && added >= GROWING_MIN_ADDED) state = 'growing'
  else if (done >= added) state = 'closing'
  return { added, done, state }
}

/** "son 2 haftada 14 eklendi, 3 bitti" */
export const scopeSentence = (trend: Pick<ScopeTrend, 'added' | 'done'>): string =>
  `son ${TREND_DAYS / 7} haftada ${trend.added} eklendi, ${trend.done} bitti`

export const median = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * Gerçek/tahmin oranı: tahmini ve gerçek süresi olan son 20 bitmiş görevin oranlarının medyanı.
 * Girdi yeni önce sıralı; 5 örnekten azsa 1,5.
 */
export function estimateRatio(
  done: readonly { estimateMin: number | null; actualMin: number }[],
): number {
  const ratios = done
    .filter((t) => t.estimateMin !== null && t.estimateMin > 0 && t.actualMin > 0)
    .slice(0, RATIO_SAMPLE_LIMIT)
    .map((t) => t.actualMin / t.estimateMin!)
  return ratios.length < RATIO_MIN_SAMPLES ? FALLBACK_RATIO : median(ratios)
}

export type FinishInput = {
  openTasks: readonly { estimateMin: number | null }[]
  ratio: number
  workedMinutesLast14Days: number
  /** Son 14 günde biten − eklenen. */
  netFlow14: number
  today: DayKey
  targetDate: DayKey | null
}

export type FinishEstimate = {
  /** Açık görevlerin tahmini toplamı × oran (dk, yuvarlanmış). */
  remainingMin: number
  /** Günlük ortalama çalışma (dk). */
  dailyPace: number
  /** Gerçekçi bitiş günü; kalan iş varken hız 0 ise null. */
  finishOn: DayKey | null
  /** Net akış ≤ 0 ve açık görev var: "bu hızla bitmiyor". */
  notFinishing: boolean
  /** Tahmin hedefi geçiyor ya da bu hızla bitmiyor ve hedef var: taş mercan. */
  late: boolean
}

export function realisticFinish(input: FinishInput): FinishEstimate {
  const estimated = input.openTasks.reduce((sum, t) => sum + (t.estimateMin ?? DEFAULT_TASK_MIN), 0)
  const remainingMin = Math.round(estimated * input.ratio)
  const dailyPace = input.workedMinutesLast14Days / PACE_DAYS
  let finishOn: DayKey | null = null
  if (remainingMin <= 0) finishOn = input.today
  else if (dailyPace > 0)
    finishOn = dayKey(addDays(parseDayKey(input.today), Math.ceil(remainingMin / dailyPace)))
  const notFinishing = input.netFlow14 <= 0 && input.openTasks.length > 0
  // 'YYYY-MM-DD' sözlük sırası takvim sırasıdır.
  const late =
    input.targetDate !== null &&
    ((finishOn !== null && finishOn > input.targetDate) || notFinishing)
  return { remainingMin, dailyPace, finishOn, notFinishing, late }
}
