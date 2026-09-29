import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Milestone, MilestoneScope } from '@shared/ipc'
import { formatMinutes } from '../../lib/format'

// Yol haritası ve Kokpit'in Kilometre taşı karosunun metinleri. Hesap ana süreçte (`domain/scope`);
// burada sadece cümle kurulur.

/** "20 Eki" */
export const formatShortDay = (key: string): string =>
  format(parseISO(key), 'd MMM', { locale: tr })

/** Hedefe kalan gün: "12 gün kaldı" · "Bugün" · "3 gün geçti". */
export function daysLeftText(target: string, today: string): string {
  const d = differenceInCalendarDays(parseISO(target), parseISO(today))
  if (d === 0) return 'Bugün'
  return d > 0 ? `${d} gün kaldı` : `${-d} gün geçti`
}

/** Aktif taş: tamamlanmamış, hedefi en yakın; tarihsizler sona (`domain/nextSteps` ile aynı kural). */
export function activeMilestone<M extends Pick<Milestone, 'targetDate' | 'doneAt'>>(
  list: readonly M[],
): M | null {
  let best: M | null = null
  for (const m of list) {
    if (m.doneAt !== null) continue
    if (!best) best = m
    else if (m.targetDate !== null && (best.targetDate === null || m.targetDate < best.targetDate))
      best = m
  }
  return best
}

const TREND_WORD = { growing: 'kapsam büyüyor', closing: 'kapanıyor', balanced: 'dengede' } as const

/** "son 2 haftada 14 eklendi, 3 bitti · kapsam büyüyor" */
export function trendText(trend: MilestoneScope['trend']): string {
  return `son 2 haftada ${trend.added} eklendi, ${trend.done} bitti · ${TREND_WORD[trend.state]}`
}

/** Gerçekçi bitiş cümlesi (taş detayı). */
export function finishText(scope: MilestoneScope, targetDate: string | null): string {
  const f = scope.finish
  if (scope.openTasks === 0) return 'Açık görev yok.'
  if (f.notFinishing) return 'Bu hızla bitmiyor: son 2 haftada eklenen, bitenden fazla.'
  if (f.finishOn === null) return 'Son 2 haftada oturum yok; tahmin için çalışma lazım.'
  const work = `kalan ~${formatMinutes(f.remainingMin)} iş, günde ~${formatMinutes(Math.round(f.dailyPace))}`
  const when = `tahmin ${formatShortDay(f.finishOn)}`
  return targetDate && f.late
    ? `Hedef ${formatShortDay(targetDate)} · gerçekçi ${when} · ${work}`
    : `Gerçekçi ${when} · ${work}`
}

/** Zaman çizelgesindeki geç taşın etiketi: "Hedef 20 Eki · tahmin 3 Kas" ya da "Hedef 20 Eki · bu hızla bitmiyor". */
export function lateLabel(targetDate: string, scope: MilestoneScope | undefined): string {
  const f = scope?.finish
  const tail =
    f?.finishOn && !f.notFinishing ? `tahmin ${formatShortDay(f.finishOn)}` : 'bu hızla bitmiyor'
  return `Hedef ${formatShortDay(targetDate)} · ${tail}`
}
