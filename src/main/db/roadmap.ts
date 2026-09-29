import { and, asc, between, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm'
import { ulid } from 'ulid'
import type {
  CalendarEntry,
  Milestone,
  MilestoneCreateInput,
  MilestoneScope,
  MilestoneUpdateInput,
  NextStep,
  ReleasePlatform,
} from '@shared/ipc'
import { unityTemplate } from '../domain/milestoneTemplate'
import { type NextStepMilestone, type NextStepTask, rankNextSteps } from '../domain/nextSteps'
import { dailyMinutes, sessionMinutes } from '../domain/projects'
import { dayKey } from '../domain/recurrence'
import { estimateRatio, PACE_DAYS, realisticFinish, scopeTrend, scopeWeeks } from '../domain/scope'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { latestSnapshots, uncommittedOf } from './projectInfo'
import {
  milestones,
  parking,
  playtestClusters,
  playtestFeedback,
  playtestPoints,
  projects,
  scheduleBlocks,
  sessions,
  tasks,
} from './schema'

// Proje planlaması (Aşama 5c): sıradaki adım motorunun girdisi, kilometre taşları, kapsam ölçer ve
// proje takvimi. Taha'nın her yazımı activity_log'a gider.

type MilestoneRow = typeof milestones.$inferSelect

type CriterionJson = { id: string; text: string; done: boolean; taskId: string | null }

/** Açık proje görevleri; göreve bağlı playtest kümesini bildiren farklı kişi sayısıyla. */
function openProjectTasks(db: Db, projectId: string): NextStepTask[] {
  const rows = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'open'), isNull(tasks.deletedAt)))
    .all()
  if (!rows.length) return []
  const reporters = db
    .selectDistinct({ taskId: playtestClusters.taskId, tester: playtestFeedback.tester })
    .from(playtestClusters)
    .innerJoin(playtestPoints, eq(playtestPoints.clusterId, playtestClusters.id))
    .innerJoin(playtestFeedback, eq(playtestFeedback.id, playtestPoints.feedbackId))
    .where(
      and(
        inArray(
          playtestClusters.taskId,
          rows.map((r) => r.id),
        ),
        isNull(playtestClusters.deletedAt),
        isNull(playtestFeedback.deletedAt),
      ),
    )
    .all()
  const count = new Map<string, number>()
  for (const r of reporters) if (r.taskId) count.set(r.taskId, (count.get(r.taskId) ?? 0) + 1)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.kind,
    severity: r.kind === 'bug' ? r.severity : null,
    kanbanStatus: r.kanbanStatus,
    milestoneId: r.milestoneId,
    playtestCount: count.get(r.id) ?? 0,
    priority: r.priority as NextStepTask['priority'],
    dueDate: r.dueDate,
    plannedDate: r.plannedDate,
    postponeCount: r.postponeCount,
    createdAt: r.createdAt,
  }))
}

function projectMilestones(db: Db, projectId: string): NextStepMilestone[] {
  return db
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .all()
    .map((m) => ({
      id: m.id,
      title: m.title,
      targetDate: m.targetDate,
      doneAt: m.doneAt?.getTime() ?? null,
      criteria: JSON.parse(m.criteriaJson) as CriterionJson[],
    }))
}

/** Kokpit'in "Şimdi bunu yap" karosu: sıralı adımlar (ilk 3 gösterilir). Proje yoksa boş. */
export function projectNextSteps(db: Db, projectId: string, now = new Date()): NextStep[] {
  const project = db
    .select({ nextStep: projects.nextStep })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .get()
  if (!project) return []
  const pendingParkingCount = db
    .select({ id: parking.id })
    .from(parking)
    .where(
      and(
        eq(parking.projectId, projectId),
        eq(parking.status, 'waiting'),
        isNull(parking.deletedAt),
      ),
    )
    .all().length
  const uncommitted = uncommittedOf(latestSnapshots(db, projectId))
  return rankNextSteps(
    {
      tasks: openProjectTasks(db, projectId),
      milestones: projectMilestones(db, projectId),
      lastSessionNextStep: project.nextStep,
      pendingParkingCount,
      oldestUncommittedAt: uncommitted?.oldestAt ?? null,
      today: dayKey(now),
    },
    now,
  )
}

/** Projenin taşları, sıraya göre. Göreve bağlı kriter görev bitince işaretli sayılır. */
export function listMilestones(db: Db, projectId: string): Milestone[] {
  const rows = db
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .orderBy(asc(milestones.sort), asc(milestones.id))
    .all()
  const done = new Set(
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'done'), isNull(tasks.deletedAt)))
      .all()
      .map((t) => t.id),
  )
  return rows.map((m) => toMilestone(m, done))
}

function toMilestone(m: MilestoneRow, doneTasks: ReadonlySet<string>): Milestone {
  return {
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    description: m.description,
    targetDate: m.targetDate,
    sort: m.sort,
    criteria: (JSON.parse(m.criteriaJson) as CriterionJson[]).map((c) => ({
      ...c,
      done: c.done || (c.taskId !== null && doneTasks.has(c.taskId)),
    })),
    doneAt: m.doneAt?.getTime() ?? null,
    createdAt: m.createdAt.getTime(),
  }
}

// ---------------------------------------------------------------- taş yazımları

function log(
  db: Db | DbTx,
  action: 'create' | 'update' | 'delete' | 'restore',
  targetTable: string,
  after: { id: string },
  before?: object,
  groupId?: string,
): void {
  logActivity(db, {
    actor: 'taha',
    action,
    targetTable,
    targetId: after.id,
    before,
    after,
    groupId,
  })
}

function liveProjectId(db: Db | DbTx, id: string): string {
  const row = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
  return row.id
}

function liveMilestone(db: Db | DbTx, id: string): MilestoneRow {
  const row = db
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), isNull(milestones.deletedAt)))
    .get()
  if (!row) throw new Error('Kilometre taşı bulunamadı')
  return row
}

/** Tek taşı okuma (yazımdan sonra dönen değer): bağlı kriterlerin durumu görevden. */
function readMilestone(db: Db | DbTx, row: MilestoneRow): Milestone {
  const criteria = JSON.parse(row.criteriaJson) as CriterionJson[]
  const ids = criteria.flatMap((c) => (c.taskId ? [c.taskId] : []))
  const done = new Set(
    ids.length
      ? db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(inArray(tasks.id, ids), eq(tasks.status, 'done'), isNull(tasks.deletedAt)))
          .all()
          .map((t) => t.id)
      : [],
  )
  return toMilestone(row, done)
}

function nextSort(db: Db | DbTx, projectId: string): number {
  const row = db
    .select({ max: max(milestones.sort) })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .get()
  return row?.max === null || row?.max === undefined ? 0 : row.max + 1
}

export function createMilestone(db: Db, input: MilestoneCreateInput, now = new Date()): Milestone {
  return db.transaction((tx) => {
    const projectId = liveProjectId(tx, input.projectId)
    const row = tx
      .insert(milestones)
      .values({
        id: ulid(),
        projectId,
        title: input.title.trim(),
        targetDate: input.targetDate ?? null,
        sort: nextSort(tx, projectId),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    log(tx, 'create', 'milestones', row)
    return readMilestone(tx, row)
  })
}

/**
 * Kısmi güncelleme. Göreve bağlı kriterin `done`'u saklanmaz (görevin durumundan okunur); böylece görev
 * yeniden açılınca kriter de açılır.
 */
export function updateMilestone(db: Db, input: MilestoneUpdateInput, now = new Date()): Milestone {
  const { id, done, criteria, ...patch } = input
  return db.transaction((tx) => {
    const before = liveMilestone(tx, id)
    const set: Partial<typeof milestones.$inferInsert> = { ...patch, updatedAt: now }
    if (patch.title !== undefined) set.title = patch.title.trim()
    if (done !== undefined) set.doneAt = done ? (before.doneAt ?? now) : null
    if (criteria !== undefined) {
      const list: CriterionJson[] = criteria.map((c) => ({
        id: c.id ?? ulid(),
        text: c.text.trim(),
        done: c.taskId ? false : c.done,
        taskId: c.taskId,
      }))
      set.criteriaJson = JSON.stringify(list)
    }
    const after = tx.update(milestones).set(set).where(eq(milestones.id, id)).returning().get()
    log(tx, 'update', 'milestones', after, before)
    return readMilestone(tx, after)
  })
}

/** Çöp kutusuna. Bağlı görevler bağını korur: geri alınca taş görevleriyle döner. */
export function deleteMilestone(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = liveMilestone(tx, id)
    const after = tx
      .update(milestones)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(milestones.id, id))
      .returning()
      .get()
    log(tx, 'delete', 'milestones', after, before)
  })
}

export function restoreMilestone(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(milestones)
      .where(and(eq(milestones.id, id), isNotNull(milestones.deletedAt)))
      .get()
    if (!before) return
    const after = tx
      .update(milestones)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(milestones.id, id))
      .returning()
      .get()
    log(tx, 'restore', 'milestones', after, before)
  })
}

/** Unity oyunu şablonu: 6 taş ve projenin yayın platformu, tek grupla. Canlı taş varken çalışmaz. */
export function applyMilestoneTemplate(
  db: Db,
  projectId: string,
  platform: ReleasePlatform,
  now = new Date(),
): Milestone[] {
  return db.transaction((tx) => {
    liveProjectId(tx, projectId)
    const existing = tx
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
      .get()
    if (existing) throw new Error('Projede zaten kilometre taşı var')
    const groupId = ulid()
    const project = tx.select().from(projects).where(eq(projects.id, projectId)).get()!
    if (project.releasePlatform !== platform) {
      const after = tx
        .update(projects)
        .set({ releasePlatform: platform, updatedAt: now })
        .where(eq(projects.id, projectId))
        .returning()
        .get()
      log(tx, 'update', 'projects', after, project, groupId)
    }
    return unityTemplate(platform).map((m, sort) => {
      const row = tx
        .insert(milestones)
        .values({
          id: ulid(),
          projectId,
          title: m.title,
          sort,
          criteriaJson: JSON.stringify(
            m.criteria.map((text) => ({ id: ulid(), text, done: false, taskId: null })),
          ),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      log(tx, 'create', 'milestones', row, undefined, groupId)
      return readMilestone(tx, row)
    })
  })
}

// ---------------------------------------------------------------- kapsam ölçer

const RATIO_DONE_LOOKBACK = 60

/**
 * Tamamlanmamış taşların kapsam ölçeri ve gerçekçi bitiş tahmini (PROJELER.md > Kapsam ölçer).
 * Oran ve hız proje genelinden: son bitmiş görevlerin gerçek/tahmin oranı, son 14 günün oturum dakikası.
 */
export function milestoneScopes(db: Db, projectId: string, now = new Date()): MilestoneScope[] {
  const open = db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, projectId),
        isNull(milestones.deletedAt),
        isNull(milestones.doneAt),
      ),
    )
    .all()
  if (!open.length) return []

  const bound = db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(
          tasks.milestoneId,
          open.map((m) => m.id),
        ),
        isNull(tasks.deletedAt),
      ),
    )
    .all()

  const spans = db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt, taskId: sessions.taskId })
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), isNull(sessions.deletedAt)))
    .all()
  const worked14 = dailyMinutes(spans, now, PACE_DAYS).reduce((a, b) => a + b, 0)
  const actualByTask = new Map<string, number>()
  for (const s of spans)
    if (s.taskId)
      actualByTask.set(s.taskId, (actualByTask.get(s.taskId) ?? 0) + sessionMinutes(s, now))
  const recentDone = db
    .select({ id: tasks.id, estimateMin: tasks.estimateMin })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'done'), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.completedAt), desc(tasks.id))
    .limit(RATIO_DONE_LOOKBACK)
    .all()
  const ratio = estimateRatio(
    recentDone.map((t) => ({ estimateMin: t.estimateMin, actualMin: actualByTask.get(t.id) ?? 0 })),
  )

  const at = now.getTime()
  return open.map((m) => {
    const mine = bound.filter((t) => t.milestoneId === m.id)
    const scopeTasks = mine.map((t) => ({
      milestoneSetAt: t.milestoneSetAt?.getTime() ?? null,
      completedAt: t.status === 'done' ? (t.completedAt?.getTime() ?? null) : null,
    }))
    const trend = scopeTrend(scopeTasks, at)
    const openTasks = mine.filter((t) => t.status === 'open')
    return {
      milestoneId: m.id,
      weeks: scopeWeeks(scopeTasks, at),
      trend,
      finish: realisticFinish({
        openTasks,
        ratio,
        workedMinutesLast14Days: worked14,
        netFlow14: trend.done - trend.added,
        today: dayKey(now),
        targetDate: m.targetDate,
      }),
      openTasks: openTasks.length,
      doneTasks: mine.length - openTasks.length,
    }
  })
}

// ---------------------------------------------------------------- proje takvimi

/** Verilen günler arası (dahil): taş hedefleri, son tarihli görevler ve görevlerin planlanmış blokları. */
export function projectCalendar(
  db: Db,
  projectId: string,
  from: string,
  to: string,
): CalendarEntry[] {
  const out: CalendarEntry[] = []
  for (const m of db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, projectId),
        isNull(milestones.deletedAt),
        between(milestones.targetDate, from, to),
      ),
    )
    .all())
    out.push({
      day: m.targetDate!,
      kind: 'milestone',
      id: m.id,
      title: m.title,
      startMin: null,
      done: m.doneAt !== null,
    })

  const live = and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
  for (const t of db
    .select()
    .from(tasks)
    .where(and(live, between(tasks.dueDate, from, to)))
    .all())
    out.push({
      day: t.dueDate!,
      kind: 'due',
      id: t.id,
      title: t.title,
      startMin: null,
      done: t.status === 'done',
    })

  for (const b of db
    .select({
      id: scheduleBlocks.id,
      day: scheduleBlocks.day,
      startMin: scheduleBlocks.startMin,
      title: tasks.title,
      status: tasks.status,
    })
    .from(scheduleBlocks)
    .innerJoin(tasks, eq(tasks.id, scheduleBlocks.sourceId))
    .where(and(eq(scheduleBlocks.kind, 'task'), between(scheduleBlocks.day, from, to), live))
    .all())
    out.push({
      day: b.day,
      kind: 'block',
      id: b.id,
      title: b.title,
      startMin: b.startMin,
      done: b.status === 'done',
    })

  const order = { milestone: 0, due: 1, block: 2 }
  return out.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      order[a.kind] - order[b.kind] ||
      (a.startMin ?? 0) - (b.startMin ?? 0),
  )
}
