import { differenceInCalendarDays } from 'date-fns'
import type { DayKey } from '@shared/ipc'
import { compareTasks, type TaskOrderFields } from './tasks'

// Sıradaki adım motoru (PROJELER.md > Sıradaki adım motoru): projenin adaylarını puanlar ve sıralar.
// Her puan terimi bir gerekçe cümlesi üretir; ilk 3 adım gösterilir. Tamamen algoritmik, AI yok.

/** Son oturumun sıradaki adımı. */
export const SESSION_SCORE = 35
/** Hata puanı, önem derecesine göre. */
export const BUG_SCORES = { critical: 50, major: 20, minor: 5 } as const
/** Playtest: bildiren kişi başına puan ve tavan. */
export const PLAYTEST_PER_REPORTER = 8
export const PLAYTEST_MAX = 40
/** Aktif taşın çıkış kriteri ya da ona bağlı görev. */
export const CRITERION_SCORE = 20
/** Taşın hedefine bu kadar gün ya da daha az kaldıysa +(21 − g). */
export const MILESTONE_WINDOW_DAYS = 21
export const DOING_SCORE = 15
export const TESTING_SCORE = 8
export const HIGH_PRIORITY_SCORE = 10
export const LOW_PRIORITY_SCORE = -5
/** Erteleme bu sayıya ulaşınca −10 ve "Böl" işareti. */
export const POSTPONE_SPLIT_AT = 3
export const POSTPONE_PENALTY = -10
/** Bekleyen park öğesi bundan fazlaysa "Park alanını gözden geçir". */
export const PARKING_REVIEW_OVER = 10
export const PARKING_SCORE = 10
/** Commit'lenmemiş değişiklik bundan eskiyse "commit'le" adımı. */
export const COMMIT_STALE_DAYS = 3
export const COMMIT_SCORE = 12
/** Serbest metin ile görev başlığı "içerir" eşleşmesi için gereken en kısa uzunluk. */
export const SESSION_MATCH_MIN_LENGTH = 8
/** Gerekçede gösterilen en fazla terim. */
export const MAX_REASONS = 3

const DAY = 86_400_000

export type NextStepTask = TaskOrderFields & {
  title: string
  type: 'task' | 'bug' | 'research'
  severity: 'critical' | 'major' | 'minor' | null
  kanbanStatus: 'todo' | 'doing' | 'testing' | 'done' | null
  milestoneId: string | null
  /** Playtest kutusunda bu göreve bağlı kümeyi bildiren kişi sayısı. */
  playtestCount: number
}

export type NextStepMilestone = {
  id: string
  title: string
  targetDate: DayKey | null
  doneAt: number | null
  criteria: { id: string; text: string; done: boolean; taskId: string | null }[]
}

export type NextStepsInput = {
  tasks: NextStepTask[]
  milestones: NextStepMilestone[]
  /** Son oturumun sıradaki adımı (serbest metin, boş olabilir). */
  lastSessionNextStep: string
  pendingParkingCount: number
  oldestUncommittedAt: number | null
  today: DayKey
}

export type NextStepKind = 'task' | 'criterion' | 'session' | 'parking' | 'commit'

export type NextStep = {
  kind: NextStepKind
  id: string
  title: string
  taskId?: string
  score: number
  /** Katkısı (mutlak) en büyük en fazla 3 terimin cümlesi, çoktan aza. */
  reasons: string[]
  reason: string
  suggestSplit: boolean
}

type Term = { points: number; text: string }

type Candidate = {
  step: Omit<NextStep, 'score' | 'reasons' | 'reason'>
  terms: Term[]
  task: NextStepTask | null
  /** Görev olmayan adımlar arasındaki sabit sıra. */
  order: number
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')

/** Serbest metin görev başlığına uyuyor mu: aynı ya da (≥ 8 harf) biri diğerini içeriyor. */
export function matchesTitle(text: string, title: string): 'exact' | 'contains' | null {
  const a = normalize(text)
  const b = normalize(title)
  if (!a || !b) return null
  if (a === b) return 'exact'
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= SESSION_MATCH_MIN_LENGTH && long.includes(short) ? 'contains' : null
}

const dayKeyToDate = (d: DayKey) => {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

/** Aktif taş: tamamlanmamış, hedef tarihi en yakın; tarihsiz olanlar sona. */
export function activeMilestone(
  milestones: readonly NextStepMilestone[],
): NextStepMilestone | null {
  let best: NextStepMilestone | null = null
  for (const m of milestones) {
    if (m.doneAt !== null) continue
    if (!best) best = m
    else if (m.targetDate !== null && (best.targetDate === null || m.targetDate < best.targetDate))
      best = m
  }
  return best
}

/** Taşın hedefine kalan gün terimi; pencere dışındaysa ya da katkısı 0 ise null. */
function milestoneDaysTerm(m: NextStepMilestone, today: DayKey): Term | null {
  if (m.targetDate === null) return null
  const g = differenceInCalendarDays(dayKeyToDate(m.targetDate), dayKeyToDate(today))
  if (g > MILESTONE_WINDOW_DAYS) return null
  if (g < 0) return { points: MILESTONE_WINDOW_DAYS, text: 'hedef tarihi geçti' }
  if (g === MILESTONE_WINDOW_DAYS) return null
  return {
    points: MILESTONE_WINDOW_DAYS - g,
    text: g === 0 ? 'hedef tarihi bugün' : `${g} gün kaldı`,
  }
}

const BUG_TEXT = { critical: 'kritik hata', major: 'önemli hata', minor: 'küçük hata' } as const

const NON_TASK_ORDER: Record<Exclude<NextStepKind, 'task'>, number> = {
  session: 0,
  criterion: 1,
  commit: 2,
  parking: 3,
}

export function rankNextSteps(input: NextStepsInput, now: Date | number): NextStep[] {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const cmp = compareTasks(input.today)
  const open = input.tasks.filter((t) => t.kanbanStatus !== 'done')
  const milestone = activeMilestone(input.milestones)
  const daysTerm = milestone ? milestoneDaysTerm(milestone, input.today) : null
  const criterionText = milestone ? `${milestone.title} taşının çıkış kriteri` : ''
  const openCriteria = milestone ? milestone.criteria.filter((c) => !c.done) : []
  const criterionTaskIds = new Set(openCriteria.map((c) => c.taskId).filter((id) => id !== null))

  // Son oturumun sıradaki adımı bir göreve eşleşirse o görevle birleşir; tam eşleşme önce.
  const sessionText = input.lastSessionNextStep.trim()
  let sessionTask: NextStepTask | null = null
  if (sessionText) {
    const sorted = [...open].sort(cmp)
    sessionTask =
      sorted.find((t) => matchesTitle(sessionText, t.title) === 'exact') ??
      sorted.find((t) => matchesTitle(sessionText, t.title) === 'contains') ??
      null
  }

  const candidates: Candidate[] = []

  for (const t of open) {
    const terms: Term[] = []
    if (t === sessionTask)
      terms.push({ points: SESSION_SCORE, text: 'son oturumda buradan devam edecektin' })
    if (t.type === 'bug' && t.severity)
      terms.push({ points: BUG_SCORES[t.severity], text: BUG_TEXT[t.severity] })
    if (t.playtestCount > 0)
      terms.push({
        points: Math.min(PLAYTEST_PER_REPORTER * t.playtestCount, PLAYTEST_MAX),
        text: `${t.playtestCount} test eden bildirdi`,
      })
    if (criterionTaskIds.has(t.id)) terms.push({ points: CRITERION_SCORE, text: criterionText })
    if (daysTerm && milestone && t.milestoneId === milestone.id) terms.push(daysTerm)
    if (t.kanbanStatus === 'doing') terms.push({ points: DOING_SCORE, text: 'yarım duruyor' })
    if (t.priority === 3) terms.push({ points: HIGH_PRIORITY_SCORE, text: 'yüksek öncelik' })
    if (t.priority === 1) terms.push({ points: LOW_PRIORITY_SCORE, text: 'düşük öncelik' })
    const split = t.postponeCount >= POSTPONE_SPLIT_AT
    if (split)
      terms.push({
        points: POSTPONE_PENALTY,
        text: `${t.postponeCount} kez ertelendi, bölmeyi düşün`,
      })
    if (t.kanbanStatus === 'testing') terms.push({ points: TESTING_SCORE, text: 'test bekliyor' })
    candidates.push({
      step: { kind: 'task', id: t.id, title: t.title, taskId: t.id, suggestSplit: split },
      terms,
      task: t,
      order: 0,
    })
  }

  if (sessionText && !sessionTask)
    candidates.push({
      step: { kind: 'session', id: 'session', title: sessionText, suggestSplit: false },
      terms: [{ points: SESSION_SCORE, text: 'son oturumda buradan devam edecektin' }],
      task: null,
      order: NON_TASK_ORDER.session,
    })

  openCriteria.forEach((c, i) => {
    if (c.taskId !== null) return
    const terms: Term[] = [{ points: CRITERION_SCORE, text: criterionText }]
    if (daysTerm) terms.push(daysTerm)
    candidates.push({
      step: { kind: 'criterion', id: c.id, title: c.text, suggestSplit: false },
      terms,
      task: null,
      order: NON_TASK_ORDER.criterion + i / (openCriteria.length + 1),
    })
  })

  const u = input.oldestUncommittedAt
  if (u !== null && nowMs - u > COMMIT_STALE_DAYS * DAY)
    candidates.push({
      step: {
        kind: 'commit',
        id: 'commit',
        title: "Commit'lenmemiş değişiklikleri commit'le",
        suggestSplit: false,
      },
      terms: [
        {
          points: COMMIT_SCORE,
          text: `${differenceInCalendarDays(nowMs, u)} gündür commit'lenmemiş`,
        },
      ],
      task: null,
      order: NON_TASK_ORDER.commit,
    })

  if (input.pendingParkingCount > PARKING_REVIEW_OVER)
    candidates.push({
      step: {
        kind: 'parking',
        id: 'parking',
        title: 'Park alanını gözden geçir',
        suggestSplit: false,
      },
      terms: [{ points: PARKING_SCORE, text: `${input.pendingParkingCount} bekleyen park öğesi` }],
      task: null,
      order: NON_TASK_ORDER.parking,
    })

  const scored = candidates.map((c) => ({
    c,
    score: c.terms.reduce((s, t) => s + t.points, 0),
  }))

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.c.task && b.c.task) return cmp(a.c.task, b.c.task)
    if (a.c.task) return -1
    if (b.c.task) return 1
    return a.c.order - b.c.order
  })

  return scored.map(({ c, score }) => {
    // Kararlı sıralama: eşit katkıda tablodaki sıra korunur.
    const reasons = [...c.terms]
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, MAX_REASONS)
      .map((t) => t.text)
    return { ...c.step, score, reasons, reason: reasons.join(' · ') }
  })
}
