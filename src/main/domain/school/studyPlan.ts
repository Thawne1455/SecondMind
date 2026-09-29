import type { DayKey } from '@shared/ipc'

// Sınav hazırlık planı (OKUL.md "Sınav hazırlık ekranı"). Saf; boş saatler dışarıdan gelir.
// Kurallar:
// - Konu süresi: elle girilen tahmin, yoksa seviyeye göre (Bilmiyorum 4 sa … Çözebiliyorum 30 dk);
//   hoca vurguladıysa 1,5 katı. 5 dk'ya yuvarlanır.
// - Sıra: önce vurgulananlar, sonra zor olan (düşük seviye), sonra müfredat sırası.
// - Sınavdan önceki son gün (en az iki çalışma günü varsa) genel tekrar: min(günlük sınır, 2 sa).
// - Konular çalışma günlerine eşit yayılır (günlük pay = toplam / gün, en az 1 sa, en fazla günlük sınır);
//   sığmayan kısım ikinci geçişte günlük sınıra kadar doldurulur. Hâlâ sığmayan "sığmadı" olarak döner.
// - Gün içinde önce 13:00 sonrası dolar, sabah ancak yer kalmazsa.
// - Blok en fazla 60 dk (kalan 80 dk'ya kadarsa tek blok), en az 25 dk; aynı boşlukta ardışık bloklar
//   arasında 10 dk mola.

export type Level = 0 | 1 | 2 | 3

/** Seviyeye göre varsayılan çalışma süresi (dk): Bilmiyorum, Tanıdık, Anladım, Çözebiliyorum. */
export const LEVEL_MINUTES: readonly number[] = [240, 150, 90, 30]
export const EMPHASIS_FACTOR = 1.5
export const BLOCK_MAX_MIN = 60
export const BLOCK_MIN_MIN = 25
export const STUDY_BREAK_MIN = 10
export const REVIEW_MAX_MIN = 120
/** Bloklar önce bu saatten sonraki boşluklara konur (öğleden sonra), sabah sonra. */
export const STUDY_PREFER_FROM = 13 * 60
/** Günlük payın alt sınırı (dk): az iş çok güne bölünüp 25'er dakikaya dağılmasın. */
const DAY_QUOTA_MIN = 60

const round5 = (n: number) => Math.round(n / 5) * 5
const ceil5 = (n: number) => Math.ceil(n / 5) * 5
const floor5 = (n: number) => Math.floor(n / 5) * 5

export type StudyTopic = {
  id: string
  level: Level
  emphasized: boolean
  /** Elle tahmin (dk); null = seviyeden. */
  estimateMin: number | null
  /** Müfredat sırası (hafta, sonra konu sırası). */
  sort: number
}

export type FreeSlot = { day: DayKey; start: number; end: number }

export type PlannedBlock = { day: DayKey; start: number; end: number; topicId: string | null }

export function topicMinutes(t: Pick<StudyTopic, 'level' | 'emphasized' | 'estimateMin'>): number {
  if (t.estimateMin !== null) return Math.max(0, round5(t.estimateMin))
  const base = LEVEL_MINUTES[t.level] ?? LEVEL_MINUTES[0]!
  return round5(base * (t.emphasized ? EMPHASIS_FACTOR : 1))
}

export function compareStudyTopics(a: StudyTopic, b: StudyTopic): number {
  return Number(b.emphasized) - Number(a.emphasized) || a.level - b.level || a.sort - b.sort
}

/** Hazırlık yüzdesi: seviyelerin ortalaması (vurgulananlar 1,5 kat ağır); konu yoksa null. */
export function examReadiness(topics: readonly Pick<StudyTopic, 'level' | 'emphasized'>[]): number | null {
  if (!topics.length) return null
  let sum = 0
  let weight = 0
  for (const t of topics) {
    const w = t.emphasized ? EMPHASIS_FACTOR : 1
    sum += (t.level / 3) * w
    weight += w
  }
  return Math.round((sum / weight) * 100)
}

type Need = { topicId: string | null; minutes: number }

/** Bir günün boşluklarına sırayla blok koyan imleç. */
class DayFiller {
  private slots: { start: number; end: number; cursor: number }[]
  used: number
  constructor(slots: readonly FreeSlot[], used: number) {
    // Öğleden sonrası önce dolar (dersten sonra çalışma); sabah ancak yer kalmazsa kullanılır.
    const parts: { start: number; end: number }[] = []
    for (const s of slots) {
      if (s.start < STUDY_PREFER_FROM && s.end > STUDY_PREFER_FROM) {
        parts.push({ start: STUDY_PREFER_FROM, end: s.end }, { start: s.start, end: STUDY_PREFER_FROM })
      } else parts.push({ start: s.start, end: s.end })
    }
    const late = parts.filter((p) => p.start >= STUDY_PREFER_FROM).sort((a, b) => a.start - b.start)
    const early = parts.filter((p) => p.start < STUDY_PREFER_FROM).sort((a, b) => a.start - b.start)
    this.slots = [...late, ...early].map((s) => ({ ...s, cursor: s.start }))
    this.used = used
  }

  /** En fazla `want` dakikalık blok; sığan yer yoksa null. */
  take(want: number, cap: number): { start: number; end: number } | null {
    const room = Math.min(want, cap - this.used)
    if (room < Math.min(BLOCK_MIN_MIN, want)) return null
    for (const s of this.slots) {
      const free = floor5(s.end - s.cursor)
      const len = Math.min(room, free)
      if (len < Math.min(BLOCK_MIN_MIN, want) || len <= 0) continue
      const block = { start: s.cursor, end: s.cursor + len }
      s.cursor = block.end + STUDY_BREAK_MIN
      this.used += len
      return block
    }
    return null
  }
}

/**
 * İhtiyaçları günlere sırayla yerleştirir: önce günlük payla, sonra günlük sınıra kadar. İkinci geçiş ilk
 * geçişin kaldığı günden başlar (sonra baştakilere döner): zor konular öne, kolaylar sona kalır.
 */
function place(
  needs: Need[],
  days: readonly DayKey[],
  fillers: Map<DayKey, DayFiller>,
  quota: number,
  dailyMax: number,
): PlannedBlock[] {
  const blocks: PlannedBlock[] = []
  let i = 0
  let stoppedAt = 0
  const pass = (order: readonly number[], cap: number) => {
    for (const d of order) {
      const day = days[d]!
      const filler = fillers.get(day)!
      while (i < needs.length) {
        const need = needs[i]!
        if (need.minutes <= 0) {
          i++
          continue
        }
        // 80 dk'ya kadar kalan konu tek blokta biter; 25 dk'dan kısa kırıntı bırakılmaz.
        const want = need.minutes < BLOCK_MAX_MIN + BLOCK_MIN_MIN ? need.minutes : BLOCK_MAX_MIN
        const got = filler.take(want, cap)
        if (!got) break
        blocks.push({ day, ...got, topicId: need.topicId })
        need.minutes -= got.end - got.start
      }
      stoppedAt = d
      if (i >= needs.length) return
    }
  }
  const all = days.map((_, d) => d)
  pass(all, Math.min(quota, dailyMax))
  if (quota < dailyMax && i < needs.length) {
    i = 0
    pass([...all.slice(stoppedAt), ...all.slice(0, stoppedAt)], dailyMax)
  }
  return blocks
}

function groupSlots(freeSlots: readonly FreeSlot[], from: DayKey, before: DayKey) {
  const byDay = new Map<DayKey, FreeSlot[]>()
  for (const s of freeSlots) {
    if (s.day < from || s.day >= before || s.end <= s.start) continue
    const list = byDay.get(s.day) ?? []
    list.push(s)
    byDay.set(s.day, list)
  }
  return byDay
}

export type StudyPlanInput = {
  examDay: DayKey
  today: DayKey
  topics: readonly StudyTopic[]
  /** Bugünden sınava kadar boş saatler (dersler, rutinler, başka planlar düşülmüş; bugün şimdiden sonrası). */
  freeSlots: readonly FreeSlot[]
  /** Günlük en fazla çalışma (dk). */
  dailyMax: number
  /** Günlerde zaten planlı çalışma (başka sınavlar), dk. */
  load?: Readonly<Record<DayKey, number>>
}

export type StudyPlan = {
  blocks: PlannedBlock[]
  /** Konu başına gereken ve yerleşen dakika. */
  topics: { topicId: string; needMin: number; placedMin: number }[]
  reviewMin: number
  /** Sığmayan toplam (dk); tekrar dahil. */
  unfitMin: number
}

export function buildStudyPlan({
  examDay,
  today,
  topics,
  freeSlots,
  dailyMax,
  load = {},
}: StudyPlanInput): StudyPlan {
  const byDay = groupSlots(freeSlots, today, examDay)
  const days = [...byDay.keys()].sort()
  const fillers = new Map(days.map((d) => [d, new DayFiller(byDay.get(d)!, load[d] ?? 0)]))

  const ordered = [...topics].sort(compareStudyTopics)
  const needs: Need[] = ordered.map((t) => ({ topicId: t.id, minutes: topicMinutes(t) }))
  const total = needs.reduce((n, x) => n + x.minutes, 0)

  // Son gün tekrar (en az iki gün varsa).
  const blocks: PlannedBlock[] = []
  let reviewMin = 0
  let reviewUnfit = 0
  let topicDays = days
  if (days.length >= 2 && total > 0) {
    const reviewDay = days[days.length - 1]!
    topicDays = days.slice(0, -1)
    const want = Math.min(dailyMax, REVIEW_MAX_MIN)
    const review: Need = { topicId: null, minutes: want }
    const got = place([review], [reviewDay], fillers, dailyMax, dailyMax)
    blocks.push(...got)
    reviewMin = want - review.minutes
    reviewUnfit = review.minutes
  }

  const quota = topicDays.length
    ? Math.min(dailyMax, Math.max(DAY_QUOTA_MIN, ceil5(total / topicDays.length)))
    : dailyMax
  const remaining = needs.map((n) => ({ ...n }))
  blocks.push(...place(remaining, topicDays, fillers, quota, dailyMax))

  const placed = new Map<string, number>()
  for (const b of blocks) if (b.topicId) placed.set(b.topicId, (placed.get(b.topicId) ?? 0) + (b.end - b.start))
  const unfit = remaining.reduce((n, x) => n + Math.max(0, x.minutes), 0)

  return {
    blocks: blocks.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start),
    topics: needs.map((n) => ({
      topicId: n.topicId!,
      needMin: n.minutes,
      placedMin: placed.get(n.topicId!) ?? 0,
    })),
    reviewMin,
    unfitMin: unfit + reviewUnfit,
  }
}

export type RedistributeInput = {
  /** Kaçırılan bloklar (zamanı geçti, işaretlenmedi). */
  missed: readonly PlannedBlock[]
  examDay: DayKey
  today: DayKey
  freeSlots: readonly FreeSlot[]
  dailyMax: number
  load?: Readonly<Record<DayKey, number>>
}

/**
 * Kaçırılan blokların süresi kalan günlere yayılır (sınav gününden önce). Konu sırası kaçırılanların
 * sırasıdır. Sığmayan dakikalar `unfitMin`'de döner.
 */
export function redistribute({
  missed,
  examDay,
  today,
  freeSlots,
  dailyMax,
  load = {},
}: RedistributeInput): { blocks: PlannedBlock[]; unfitMin: number } {
  const byTopic = new Map<string | null, number>()
  for (const b of [...missed].sort((x, y) => x.day.localeCompare(y.day) || x.start - y.start))
    byTopic.set(b.topicId, (byTopic.get(b.topicId) ?? 0) + (b.end - b.start))
  const needs: Need[] = [...byTopic].map(([topicId, minutes]) => ({ topicId, minutes }))
  const total = needs.reduce((n, x) => n + x.minutes, 0)
  if (!total) return { blocks: [], unfitMin: 0 }

  const byDay = groupSlots(freeSlots, today, examDay)
  const days = [...byDay.keys()].sort()
  const fillers = new Map(days.map((d) => [d, new DayFiller(byDay.get(d)!, load[d] ?? 0)]))
  const quota = days.length
    ? Math.min(dailyMax, Math.max(DAY_QUOTA_MIN, ceil5(total / days.length)))
    : dailyMax
  const blocks = place(needs, days, fillers, quota, dailyMax)
  return {
    blocks: blocks.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start),
    unfitMin: needs.reduce((n, x) => n + Math.max(0, x.minutes), 0),
  }
}

export type Interval = { start: number; end: number }

/** Çalışma penceresi varsayılanı: 09:00–22:00. */
export const STUDY_WINDOW: Interval = { start: 9 * 60, end: 22 * 60 }
/** Dolu aralıkların iki yanında bırakılan tampon (dk). */
export const STUDY_BUFFER_MIN = 10

/**
 * Bir günün boş aralıkları: pencere içinde, dolu aralıkların iki yanında tampon bırakarak.
 * `fromMin` verilirse (bugün) o dakikadan (5'e yuvarlanmış) sonrası.
 */
export function dayFreeSlots(
  day: DayKey,
  busy: readonly Interval[],
  window: Interval = STUDY_WINDOW,
  fromMin?: number,
): FreeSlot[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const out: FreeSlot[] = []
  let cursor = Math.max(window.start, fromMin === undefined ? 0 : ceil5(fromMin))
  for (const b of sorted) {
    const end = Math.min(b.start - STUDY_BUFFER_MIN, window.end)
    if (end > cursor) out.push({ day, start: cursor, end })
    cursor = Math.max(cursor, ceil5(b.end + STUDY_BUFFER_MIN))
  }
  if (window.end > cursor) out.push({ day, start: cursor, end: window.end })
  return out.filter((s) => s.end - s.start >= BLOCK_MIN_MIN)
}
