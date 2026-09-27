import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import type { IdeaStage, IdeaState, IdeaStatus } from '@shared/ipc'

// Fikir kuluçkası ve radar (EKRANLAR.md Bilgi). Saf fonksiyonlar; "şimdi" her zaman dışarıdan gelir.

/** Yeni fikir bu kadar gün kuluçkada kalır. */
export const INCUBATION_DAYS = 14
/** Aktif fikir bu kadar gün açılmazsa radara aday olur. */
export const RADAR_SILENT_DAYS = 30

export type IdeaTimes = {
  status: IdeaStatus
  incubateUntil: Date
  createdAt: Date
  decidedAt: Date | null
  lastOpenedAt: Date | null
}

/** Kuluçkanın bittiği an: başlangıçtan `days` gün sonraki günün başı (yerel saat). */
export function incubationEnd(start: Date, days = INCUBATION_DAYS): Date {
  return startOfDay(addDays(start, days))
}

/** Durum + zaman: kuluçkadaki fikrin süresi dolduysa 'due'. */
export function ideaStage(idea: Pick<IdeaTimes, 'status' | 'incubateUntil'>, now: Date): IdeaStage {
  if (idea.status !== 'incubating') return idea.status
  return now.getTime() >= idea.incubateUntil.getTime() ? 'due' : 'incubating'
}

/** Kuluçkanın bitmesine kalan takvim günü; dolduysa 0. */
export function incubationDaysLeft(incubateUntil: Date, now: Date): number {
  return Math.max(0, differenceInCalendarDays(incubateUntil, now))
}

/** Fikirle son temas: açılma, karar ya da oluşturma — hangisi en yeniyse. */
export function lastTouched(idea: IdeaTimes): Date {
  let t = idea.createdAt.getTime()
  if (idea.decidedAt) t = Math.max(t, idea.decidedAt.getTime())
  if (idea.lastOpenedAt) t = Math.max(t, idea.lastOpenedAt.getTime())
  return new Date(t)
}

export function silentDays(idea: IdeaTimes, now: Date): number {
  return Math.max(0, differenceInCalendarDays(now, lastTouched(idea)))
}

/** IPC'ye giden görünüm. */
export function ideaState(idea: IdeaTimes, now: Date): IdeaState {
  const stage = ideaStage(idea, now)
  return {
    status: idea.status,
    stage,
    daysLeft: stage === 'incubating' ? incubationDaysLeft(idea.incubateUntil, now) : 0,
    incubateUntil: idea.incubateUntil.getTime(),
    decidedAt: idea.decidedAt?.getTime() ?? null,
    lastOpenedAt: idea.lastOpenedAt?.getTime() ?? null,
  }
}

const STAGE_ORDER: Record<IdeaStage, number> = {
  due: 0,
  incubating: 1,
  active: 2,
  project: 3,
  archived: 4,
}

/**
 * Liste sırası: karar bekleyenler (en eski önce), kuluçkadakiler (en yakın biten önce),
 * sonra aktif / proje / arşiv (son düzenlenen önce).
 */
export function compareIdeas<T extends IdeaTimes & { updatedAt: Date; id: string }>(
  now: Date,
): (a: T, b: T) => number {
  return (a, b) => {
    const sa = ideaStage(a, now)
    const sb = ideaStage(b, now)
    if (sa !== sb) return STAGE_ORDER[sa] - STAGE_ORDER[sb]
    const diff =
      sa === 'due' || sa === 'incubating'
        ? a.incubateUntil.getTime() - b.incubateUntil.getTime()
        : b.updatedAt.getTime() - a.updatedAt.getTime()
    return diff || a.id.localeCompare(b.id)
  }
}

/** Bugün'deki kuluçka karosu: süresi en uzun zamandır dolmuş fikir ve kaç gündür beklediği. */
export function pickDueIdea<T extends IdeaTimes & { id: string }>(
  ideas: readonly T[],
  now: Date,
): { idea: T; overdueDays: number; count: number } | null {
  const due = ideas
    .filter((i) => ideaStage(i, now) === 'due')
    .sort(
      (a, b) => a.incubateUntil.getTime() - b.incubateUntil.getTime() || a.id.localeCompare(b.id),
    )
  const first = due[0]
  if (!first) return null
  return {
    idea: first,
    overdueDays: Math.max(0, differenceInCalendarDays(now, first.incubateUntil)),
    count: due.length,
  }
}

/** Kuluçkası en yakın bitecek fikir (karar bekleyen yokken karoda "sıradaki"). */
export function pickNextIncubating<T extends IdeaTimes & { id: string }>(
  ideas: readonly T[],
  now: Date,
): { idea: T; daysLeft: number } | null {
  const next = ideas
    .filter((i) => ideaStage(i, now) === 'incubating')
    .sort(
      (a, b) => a.incubateUntil.getTime() - b.incubateUntil.getTime() || a.id.localeCompare(b.id),
    )[0]
  return next ? { idea: next, daysLeft: incubationDaysLeft(next.incubateUntil, now) } : null
}

/**
 * Radar adayı: `RADAR_SILENT_DAYS` gündür dokunulmamış aktif fikirlerden en sessizi.
 * Kuluçkadakiler zaten kuluçka karosunda; arşiv ve proje olmuşlar radara girmez.
 */
export function pickRadarIdea<T extends IdeaTimes & { id: string }>(
  ideas: readonly T[],
  now: Date,
): { idea: T; silentDays: number } | null {
  let best: { idea: T; silentDays: number } | null = null
  for (const idea of ideas) {
    if (idea.status !== 'active') continue
    const days = silentDays(idea, now)
    if (days < RADAR_SILENT_DAYS) continue
    if (!best || days > best.silentDays || (days === best.silentDays && idea.id < best.idea.id))
      best = { idea, silentDays: days }
  }
  return best
}
