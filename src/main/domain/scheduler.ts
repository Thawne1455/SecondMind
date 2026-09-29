import { getISODay } from 'date-fns'
import type { DayKey } from '@shared/ipc'
import { compareTasks, DEFAULT_ESTIMATE_MIN, isForToday, type TaskOrderFields } from './tasks'

// Günün yerleştirmesi (EKRANLAR.md Bugün). Saf: "şimdi" günün dakikası olarak dışarıdan gelir.
// Önce sabit bloklar (rutinler, dersler, sınav çalışma blokları), sonra bugüne alınmış görevler
// `compareTasks` sırasıyla ilk uygun boşluğa. Taha'nın sabitlediği bloklara hiç dokunulmaz.

/** Bant ve yerleştirme aralığı: 08:00–24:00 (günün dakikası). */
export const DAY_START_MIN = 8 * 60
export const DAY_END_MIN = 24 * 60
/** Bloklar arası tampon (dk). */
export const BUFFER_MIN = 10
/** Yerleştirme ve sürükleme 5 dakikalık adımlarla. */
export const SNAP_MIN = 5

export type BlockKind = 'task' | 'routine' | 'class' | 'study'

export type Block = {
  /** Kayıtlı bloğun id'si; yeni yerleşenlerde yok. */
  id?: string
  kind: BlockKind
  sourceId: string
  start: number
  end: number
  /** Taha elle taşıdı: o gün sabit, algoritma dokunmaz. */
  pinned: boolean
}

export type Interval = { start: number; end: number }

export type SchedTask = TaskOrderFields & {
  status: 'open' | 'done'
  estimateMin: number | null
  /** Bugün tamamlandıysa günün dakikası. */
  completedMin: number | null
}

export type RoutineDef = {
  id: string
  days: readonly number[]
  startTime: string
  durationMin: number
  active: boolean
}

export const ceilSnap = (min: number) => Math.ceil(min / SNAP_MIN) * SNAP_MIN
export const floorSnap = (min: number) => Math.floor(min / SNAP_MIN) * SNAP_MIN

export const taskDuration = (t: Pick<SchedTask, 'estimateMin'>) =>
  t.estimateMin ?? DEFAULT_ESTIMATE_MIN

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** "HH:mm" → günün dakikası. */
function clockMin(clock: string): number {
  const [h, m] = clock.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/** Bu günün rutin blokları, 08–24'e kırpılmış; tamamen dışında kalanlar yok. */
export function routineIntervals(routines: readonly RoutineDef[], day: Date): Block[] {
  const iso = getISODay(day)
  const out: Block[] = []
  for (const r of routines) {
    if (!r.active || !r.days.includes(iso)) continue
    const s = clockMin(r.startTime)
    const start = Math.max(s, DAY_START_MIN)
    const end = Math.min(s + r.durationMin, DAY_END_MIN)
    if (end > start) out.push({ kind: 'routine', sourceId: r.id, start, end, pinned: false })
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * Şimdiden (5 dk'ya yuvarlanmış) gün sonuna kadar yeni blok konabilecek boşluklar.
 * Her bloğun iki yanında `BUFFER_MIN` tampon bırakılır; gün başı ve "şimdi" tampon istemez.
 */
export function freeGaps(occupied: readonly Interval[], nowMin: number): Interval[] {
  const sorted = [...occupied].sort((a, b) => a.start - b.start)
  const gaps: Interval[] = []
  let cursor = ceilSnap(Math.max(DAY_START_MIN, nowMin))
  for (const b of sorted) {
    const gapEnd = b.start - BUFFER_MIN
    if (gapEnd > cursor) gaps.push({ start: cursor, end: gapEnd })
    cursor = Math.max(cursor, ceilSnap(b.end + BUFFER_MIN))
  }
  if (DAY_END_MIN > cursor) gaps.push({ start: cursor, end: DAY_END_MIN })
  return gaps
}

export const sumGaps = (gaps: readonly Interval[]) =>
  gaps.reduce((n, g) => n + (g.end - g.start), 0)

export type PlanInput = {
  today: DayKey
  nowMin: number
  /** Sabit bloklar: `routineIntervals` çıktısı + dersler ve çalışma blokları (Aşama 6). */
  routines: readonly Block[]
  /** Açık görevler (bugüne alınmış olanlar yerleşir) + kayıtlı bloğu olan bitmiş görevler. */
  tasks: readonly SchedTask[]
  /** O günün kayıtlı blokları. */
  existing: readonly Block[]
  /**
   * fill: kayıtlı yerleşim korunur, sadece bloğu olmayan görevler boşluklara girer (her okumada).
   * replace: "Yeniden yerleştir"; sabitlenmemiş, henüz başlamamış ve kaçırılmış bloklar yeniden yerleşir.
   */
  mode: 'fill' | 'replace'
}

export type PlanResult = {
  blocks: Block[]
  /** Sığmayan görevlerin id'leri, yerleştirme sırasıyla. */
  unplaced: string[]
}

export function planDay({ today, nowMin, routines, tasks, existing, mode }: PlanInput): PlanResult {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const eligible = (t: SchedTask) => t.status === 'open' && isForToday(t, today)

  // Sabit bloklar: kayıtlı satır varsa id'si korunur (aynı rutin/ders, yeni saat olabilir).
  const fixedIds = new Map(
    existing.filter((b) => b.kind !== 'task').map((b) => [`${b.kind}:${b.sourceId}`, b.id]),
  )
  const fixed: Block[] = routines.map((r) => ({ ...r, id: fixedIds.get(`${r.kind}:${r.sourceId}`) }))

  // 1) Dokunulmayacak görev blokları: sabitlenenler, geçmişte kalanlar, bitmiş görevlerinki.
  const anchors: Block[] = []
  const candidates: Block[] = []
  const seen = new Set<string>()
  for (const b of [...existing].sort((x, y) => x.start - y.start)) {
    if (b.kind !== 'task' || seen.has(b.sourceId)) continue
    const t = byId.get(b.sourceId)
    if (!t) continue

    if (t.status === 'done') {
      // Başlamadan bitmişse yer açılır; başladıysa bitiş anında kesilir.
      if (b.start >= nowMin) continue
      const done = t.completedMin
      const end =
        done !== null && done > b.start && done < b.end ? Math.max(done, b.start + SNAP_MIN) : b.end
      anchors.push({ ...b, end })
      seen.add(b.sourceId)
      continue
    }
    if (!eligible(t)) continue

    const duration = taskDuration(t)
    if (b.pinned) {
      anchors.push({ ...b, end: Math.min(b.start + duration, DAY_END_MIN) })
      seen.add(b.sourceId)
    } else if (b.end <= nowMin) {
      // Kaçırılmış: "Yeniden yerleştir" ileri alır; kendiliğinden kaymaz.
      if (mode === 'fill') {
        anchors.push(b)
        seen.add(b.sourceId)
      }
    } else if (b.start > nowMin) {
      // Başlamamış: süresi değiştiyse ya da yeniden yerleştiriliyorsa yeniden yerleşir.
      if (mode === 'fill' && b.end - b.start === duration) candidates.push(b)
    } else {
      // Şu an süren blok yerinde kalır.
      candidates.push(b)
    }
  }

  // 2) Sabit bloklarla ya da birbiriyle çakışan adaylar yeniden yerleşir.
  const kept: Block[] = [...fixed, ...anchors]
  for (const c of candidates) {
    if (kept.some((k) => overlaps(k, c))) continue
    kept.push(c)
    seen.add(c.sourceId)
  }

  // 3) Kalan görevler sırayla ilk sığdıkları boşluğa.
  const unplaced: string[] = []
  const toPlace = tasks.filter((t) => eligible(t) && !seen.has(t.id)).sort(compareTasks(today))
  for (const t of toPlace) {
    const duration = taskDuration(t)
    const gap = freeGaps(kept, nowMin).find((g) => g.end - g.start >= duration)
    if (!gap) {
      unplaced.push(t.id)
      continue
    }
    kept.push({
      kind: 'task',
      sourceId: t.id,
      start: gap.start,
      end: gap.start + duration,
      pinned: false,
    })
  }

  return { blocks: kept.sort((a, b) => a.start - b.start || a.end - b.end), unplaced }
}

/**
 * Elle taşıma / "Başla": blok 5 dk adımına oturur, geçmişe (şimdinin 5 dk'lık başından öncesine)
 * ve 08–24 dışına çıkmaz; süresi korunur.
 */
export function clampMove(start: number, duration: number, nowMin: number): Interval {
  const earliest = Math.max(DAY_START_MIN, floorSnap(nowMin))
  const latest = DAY_END_MIN - duration
  const s = Math.max(earliest, Math.min(latest, Math.round(start / SNAP_MIN) * SNAP_MIN))
  return { start: s, end: Math.min(s + duration, DAY_END_MIN) }
}

/** Gün sonu kaydırma: planlanan günü geçmişte kalmış açık görevler bugüne kayar. */
export const needsRollover = (
  t: Pick<SchedTask, 'status' | 'plannedDate'>,
  today: DayKey,
): boolean => t.status === 'open' && t.plannedDate !== null && t.plannedDate < today
