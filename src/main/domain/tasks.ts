import type { DayKey, TaskPriority } from '@shared/ipc'

// Görev sıralaması (EKRANLAR.md Bugün): bugüne alınmış olanlar önce; sonra son tarihi yakın,
// sonra öncelik, sonra erteleme sayısı yüksek olan. Aynı kural Aşama 3b'de yerleştirmenin sırasıdır.

/** Tahmini süresi olmayan göreve verilen süre (dk). */
export const DEFAULT_ESTIMATE_MIN = 30

/** Erteleme bu sayıya ulaşınca Bugün "Böl · Sil · Bugün yap" diye sorar. */
export const POSTPONE_ASK_AT = 3

export type TaskOrderFields = {
  id: string
  priority: TaskPriority
  dueDate: DayKey | null
  plannedDate: DayKey | null
  postponeCount: number
  createdAt: Date
}

/** Bugün yapılacak mı: planlanan günü bugün ya da geçmiş. */
export const isForToday = (t: Pick<TaskOrderFields, 'plannedDate'>, today: DayKey): boolean =>
  t.plannedDate !== null && t.plannedDate <= today

// 'YYYY-MM-DD' metin olarak karşılaştırılabilir; son tarihi olmayan en sona.
const dueRank = (d: DayKey | null) => d ?? '9999-99-99'

export function compareTasks(today: DayKey) {
  return (a: TaskOrderFields, b: TaskOrderFields): number =>
    Number(isForToday(b, today)) - Number(isForToday(a, today)) ||
    dueRank(a.dueDate).localeCompare(dueRank(b.dueDate)) ||
    b.priority - a.priority ||
    b.postponeCount - a.postponeCount ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
}
