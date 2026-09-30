import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  reminderRuleSchema,
  type Reminder,
  type ReminderRule,
  type Routine,
  type RoutineCreateInput,
  type RoutineUpdateInput,
  type Task,
  type TaskCreateInput,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateInput,
} from '@shared/ipc'
import {
  dayKey,
  isPending,
  nextOccurrence,
  sweepReminders,
  type ReminderTimes,
} from '../domain/recurrence'
import { compareTasks } from '../domain/tasks'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { reminders, routines, tasks } from './schema'

// Görevler, hatırlatmalar, rutinler. Taha'nın her değişikliği activity_log'a yazılır;
// hatırlatmanın çalması / kaçırılması sistem sinyalidir, log'a yazılmaz.

type TaskRow = typeof tasks.$inferSelect
type ReminderRow = typeof reminders.$inferSelect
type RoutineRow = typeof routines.$inferSelect

// ---------------------------------------------------------------- ortak: soft delete

type SoftTable = typeof tasks | typeof reminders | typeof routines

/** Çöp kutusuna taşır (`deleted`) ya da geri alır. Durumu zaten öyleyse bir şey yapmaz. */
function setDeleted(
  db: Db,
  table: SoftTable,
  targetTable: string,
  id: string,
  deleted: boolean,
  now: Date,
): void {
  // Üç tablonun id / deleted_at / updated_at kolonları aynı; birleşik tip drizzle'da sorgulanamıyor.
  const t = table as typeof tasks
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(t)
      .where(and(eq(t.id, id), deleted ? isNull(t.deletedAt) : isNotNull(t.deletedAt)))
      .get()
    if (!before) return
    const after = tx
      .update(t)
      .set({ deletedAt: deleted ? now : null, updatedAt: now })
      .where(eq(t.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: deleted ? 'delete' : 'restore',
      targetTable,
      targetId: id,
      before,
      after,
    })
  })
}

function logUpdate(
  db: Db | DbTx,
  targetTable: string,
  before: object,
  after: object & { id: string },
) {
  logActivity(db, {
    actor: 'taha',
    action: 'update',
    targetTable,
    targetId: after.id,
    before,
    after,
  })
}

// ---------------------------------------------------------------- görevler

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status,
    priority: r.priority as TaskPriority,
    estimateMin: r.estimateMin,
    dueDate: r.dueDate,
    plannedDate: r.plannedDate,
    postponeCount: r.postponeCount,
    completedAt: r.completedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
    projectId: r.projectId,
    kind: r.kind,
    kanbanStatus: r.kanbanStatus,
    severity: r.kind === 'bug' ? r.severity : null,
    reproSteps: r.reproSteps,
    milestoneId: r.milestoneId,
    source: r.source,
  }
}

const DONE_LIST_MAX = 100

/** Açıklar `compareTasks` sırasıyla; bitenler en son biten önce. */
export function listTasks(db: Db, status: TaskStatus, now = new Date()): Task[] {
  const where = and(eq(tasks.status, status), isNull(tasks.deletedAt))
  if (status === 'done') {
    return db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(desc(tasks.completedAt), desc(tasks.id))
      .limit(DONE_LIST_MAX)
      .all()
      .map(toTask)
  }
  const rows = db.select().from(tasks).where(where).all()
  return rows
    .map((r) => ({ ...r, priority: r.priority as TaskPriority }))
    .sort(compareTasks(dayKey(now)))
    .map(toTask)
}

const PROJECT_DONE_MAX = 50

/** Projenin görevleri (kanban): açıklar `compareTasks` sırasıyla, sonra bitenler en yeni önce (en fazla 50). */
export function listProjectTasks(db: Db, projectId: string, now = new Date()): Task[] {
  const live = and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
  const open = db
    .select()
    .from(tasks)
    .where(and(live, eq(tasks.status, 'open')))
    .all()
    .map((r) => ({ ...r, priority: r.priority as TaskPriority }))
    .sort(compareTasks(dayKey(now)))
  const done = db
    .select()
    .from(tasks)
    .where(and(live, eq(tasks.status, 'done')))
    .orderBy(desc(tasks.completedAt), desc(tasks.id))
    .limit(PROJECT_DONE_MAX)
    .all()
  return [...open, ...done].map(toTask)
}

export function createTask(db: Db, input: TaskCreateInput, now = new Date()): Task {
  return db.transaction((tx) => {
    const row = tx
      .insert(tasks)
      .values({
        id: ulid(),
        title: input.title.trim(),
        notes: input.notes ?? '',
        priority: input.priority ?? 2,
        estimateMin: input.estimateMin ?? null,
        dueDate: input.dueDate ?? null,
        plannedDate: input.plannedDate ?? null,
        projectId: input.projectId ?? null,
        courseId: input.courseId ?? null,
        kanbanStatus: input.projectId ? 'todo' : null,
        kind: input.kind ?? 'task',
        severity: input.kind === 'bug' ? (input.severity ?? null) : null,
        reproSteps: input.reproSteps ?? '',
        milestoneId: input.milestoneId ?? null,
        milestoneSetAt: input.milestoneId ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'tasks',
      targetId: row.id,
      after: row,
    })
    return toTask(row)
  })
}

function liveTask(db: Db | DbTx, id: string): TaskRow {
  const row = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get()
  if (!row) throw new Error('Görev bulunamadı')
  return row
}

/** Kısmi güncelleme. Planlanan gün elle değişince erteleme sayılmaz (sayaç sadece gün sonu kaydırmada artar). */
export function updateTask(db: Db, input: TaskUpdateInput, now = new Date()): Task {
  const { id, ...patch } = input
  return db.transaction((tx) => {
    const before = liveTask(tx, id)
    const set: Partial<typeof tasks.$inferInsert> = { ...patch, updatedAt: now }
    if (patch.title) set.title = patch.title.trim()
    // Kanban kolonu ↔ durum (MIMARI: aynı yazımda senkron). Proje dışı görev kolon almaz.
    if (patch.kanbanStatus !== undefined) {
      if (before.projectId === null) delete set.kanbanStatus
      else if ((patch.kanbanStatus === 'done') !== (before.status === 'done')) {
        set.status = patch.kanbanStatus === 'done' ? 'done' : 'open'
        set.completedAt = patch.kanbanStatus === 'done' ? now : null
      }
    }
    // Kapsam ölçer: taşa bağlandığı an.
    if (patch.milestoneId !== undefined && patch.milestoneId !== before.milestoneId)
      set.milestoneSetAt = patch.milestoneId ? now : null
    if ((patch.kind ?? before.kind) !== 'bug') set.severity = null
    const after = tx.update(tasks).set(set).where(eq(tasks.id, id)).returning().get()
    logUpdate(tx, 'tasks', before, after)
    return toTask(after)
  })
}

export function setTaskDone(db: Db, id: string, done: boolean, now = new Date()): Task {
  return db.transaction((tx) => {
    const before = liveTask(tx, id)
    if ((before.status === 'done') === done) return toTask(before)
    const after = tx
      .update(tasks)
      // Proje görevinde kanban kolonu da senkron (MIMARI: status ↔ kanban_status).
      .set({
        status: done ? 'done' : 'open',
        completedAt: done ? now : null,
        ...(before.kanbanStatus !== null && { kanbanStatus: done ? 'done' : 'todo' }),
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .returning()
      .get()
    logUpdate(tx, 'tasks', before, after)
    return toTask(after)
  })
}

/**
 * Erteleme sorusundaki "Böl": her parça bugüne yeni görev olur (öncelik ve son tarih aynen, tahmini süre
 * eşit bölünür), asıl görev çöp kutusuna gider. Hepsi tek grupla loglanır (birlikte geri alınır).
 */
export function splitTask(db: Db, id: string, titles: readonly string[], now = new Date()): Task[] {
  return db.transaction((tx) => {
    const before = liveTask(tx, id)
    const groupId = ulid()
    const estimate =
      before.estimateMin === null
        ? null
        : Math.max(5, Math.round(before.estimateMin / titles.length / 5) * 5)
    const parts = titles.map((title) => {
      const row = tx
        .insert(tasks)
        .values({
          id: ulid(),
          title: title.trim(),
          priority: before.priority,
          estimateMin: estimate,
          dueDate: before.dueDate,
          plannedDate: dayKey(now),
          kind: before.kind,
          projectId: before.projectId,
          kanbanStatus: before.kanbanStatus && 'todo',
          severity: before.severity,
          courseId: before.courseId,
          milestoneId: before.milestoneId,
          milestoneSetAt: before.milestoneSetAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: 'create',
        targetTable: 'tasks',
        targetId: row.id,
        groupId,
        after: row,
      })
      return toTask(row)
    })
    const after = tx
      .update(tasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'delete',
      targetTable: 'tasks',
      targetId: id,
      groupId,
      before,
      after,
    })
    return parts
  })
}

export const deleteTask = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, tasks, 'tasks', id, true, now)
export const restoreTask = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, tasks, 'tasks', id, false, now)

// ---------------------------------------------------------------- hatırlatmalar

function parseRule(json: string | null): ReminderRule | null {
  return json === null ? null : reminderRuleSchema.parse(JSON.parse(json))
}

const times = (r: ReminderRow): ReminderTimes => ({
  id: r.id,
  at: r.at,
  rule: parseRule(r.ruleJson),
  firedAt: r.firedAt,
  missedAt: r.missedAt,
})

function toReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    title: r.title,
    at: r.at.getTime(),
    rule: parseRule(r.ruleJson),
    firedAt: r.firedAt?.getTime() ?? null,
    missedAt: r.missedAt?.getTime() ?? null,
  }
}

const liveReminders = (db: Db) =>
  db.select().from(reminders).where(isNull(reminders.deletedAt)).orderBy(asc(reminders.at)).all()

/** Bekleyen ve kaçırılmış (ele alınmamış) hatırlatmalar, sıradaki çalmaya göre. */
export function listReminders(db: Db): Reminder[] {
  return liveReminders(db)
    .filter((r) => isPending(times(r)) || r.missedAt !== null)
    .map(toReminder)
}

// Formda "şimdi"ye ayarlanan saat, kayda kadar geçen saniyelerde geçmişte kalmasın.
const PAST_TOLERANCE_MS = 60_000

function firstAt(rule: ReminderRule | null | undefined, at: number | undefined, now: Date): Date {
  if (rule) return nextOccurrence(rule, new Date(now.getTime() - PAST_TOLERANCE_MS))
  if (at === undefined) throw new Error('Zaman ya da tekrar gerekli')
  if (at < now.getTime() - PAST_TOLERANCE_MS) throw new Error('Hatırlatma zamanı geçmişte')
  return new Date(at)
}

export function createReminder(
  db: Db,
  input: { title: string; at?: number; rule?: ReminderRule | null },
  now = new Date(),
): Reminder {
  return db.transaction((tx) => {
    const row = tx
      .insert(reminders)
      .values({
        id: ulid(),
        title: input.title.trim(),
        at: firstAt(input.rule, input.at, now),
        ruleJson: input.rule ? JSON.stringify(input.rule) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'reminders',
      targetId: row.id,
      after: row,
    })
    return toReminder(row)
  })
}

/** Zaman ya da kural değişirse hatırlatma yeniden kurulur: kaçırılmışlığı ve tek seferlikte çalmışlığı silinir. */
export function updateReminder(
  db: Db,
  input: { id: string; title?: string; at?: number; rule?: ReminderRule | null },
  now = new Date(),
): Reminder {
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, input.id), isNull(reminders.deletedAt)))
      .get()
    if (!before) throw new Error('Hatırlatma bulunamadı')
    const rearm = input.at !== undefined || input.rule !== undefined
    const rule = input.rule === undefined ? parseRule(before.ruleJson) : input.rule
    const after = tx
      .update(reminders)
      .set({
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(rearm && {
          at: firstAt(rule, input.at ?? before.at.getTime(), now),
          ruleJson: rule ? JSON.stringify(rule) : null,
          firedAt: null,
          missedAt: null,
        }),
        updatedAt: now,
      })
      .where(eq(reminders.id, input.id))
      .returning()
      .get()
    logUpdate(tx, 'reminders', before, after)
    return toReminder(after)
  })
}

export const deleteReminder = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, reminders, 'reminders', id, true, now)
export const restoreReminder = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, reminders, 'reminders', id, false, now)

/**
 * Kaçırılanları ele alır. 'today': her biri bugün yapılacak görev olur. İkisinde de kaçırılmışlık silinir,
 * tek seferlik hatırlatma bitmiş sayılır. Hepsi tek grupla loglanır (birlikte geri alınır).
 */
export function resolveMissedReminders(
  db: Db,
  ids: readonly string[],
  action: 'today' | 'dismiss',
  now = new Date(),
): { taskIds: string[] } {
  return db.transaction((tx) => {
    const groupId = ulid()
    const taskIds: string[] = []
    for (const id of ids) {
      const before = tx
        .select()
        .from(reminders)
        .where(
          and(eq(reminders.id, id), isNull(reminders.deletedAt), isNotNull(reminders.missedAt)),
        )
        .get()
      if (!before) continue
      const after = tx
        .update(reminders)
        .set({ missedAt: null, firedAt: before.ruleJson ? before.firedAt : now, updatedAt: now })
        .where(eq(reminders.id, id))
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: 'update',
        targetTable: 'reminders',
        targetId: id,
        groupId,
        before,
        after,
      })
      if (action !== 'today') continue
      const task = tx
        .insert(tasks)
        .values({
          id: ulid(),
          title: before.title,
          plannedDate: dayKey(now),
          projectId: before.projectId,
          courseId: before.courseId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: 'create',
        targetTable: 'tasks',
        targetId: task.id,
        groupId,
        after: task,
      })
      taskIds.push(task.id)
    }
    return { taskIds }
  })
}

/**
 * Zamanı gelenleri işler (dakikalık kontrol ve açılış). Çalanlar bildirim için döner;
 * kaçırılanlar `missed_at` alır. Tekrarlayanın `at`'i sıradaki çalmaya ilerler.
 */
export function sweepDueReminders(db: Db, now = new Date()): { fired: Reminder[]; missed: number } {
  return db.transaction((tx) => {
    const rows = tx.select().from(reminders).where(isNull(reminders.deletedAt)).all()
    const fired: Reminder[] = []
    let missed = 0
    for (const s of sweepReminders(rows.map(times), now)) {
      const row = tx
        .update(reminders)
        .set({
          ...(s.nextAt && { at: s.nextAt }),
          ...(s.outcome === 'fire' ? { firedAt: now } : { missedAt: s.dueAt }),
          updatedAt: now,
        })
        .where(eq(reminders.id, s.id))
        .returning()
        .get()
      if (s.outcome === 'fire') fired.push(toReminder(row))
      else missed++
    }
    return { fired, missed }
  })
}

// ---------------------------------------------------------------- rutinler

function toRoutine(r: RoutineRow): Routine {
  return {
    id: r.id,
    title: r.title,
    days: JSON.parse(r.daysJson) as number[],
    startTime: r.startTime,
    durationMin: r.durationMin,
    active: r.active,
  }
}

/** Saate göre; aynı saattekiler ada göre. */
export function listRoutines(db: Db): Routine[] {
  return db
    .select()
    .from(routines)
    .where(isNull(routines.deletedAt))
    .orderBy(asc(routines.startTime), asc(routines.title))
    .all()
    .map(toRoutine)
}

type ParsedRoutineCreate = Omit<RoutineCreateInput, 'days'> & { days: number[] }
type ParsedRoutineUpdate = Omit<RoutineUpdateInput, 'days'> & { days?: number[] }

export function createRoutine(db: Db, input: ParsedRoutineCreate, now = new Date()): Routine {
  return db.transaction((tx) => {
    const row = tx
      .insert(routines)
      .values({
        id: ulid(),
        title: input.title.trim(),
        daysJson: JSON.stringify(input.days),
        startTime: input.startTime,
        durationMin: input.durationMin,
        active: input.active ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'routines',
      targetId: row.id,
      after: row,
    })
    return toRoutine(row)
  })
}

export function updateRoutine(db: Db, input: ParsedRoutineUpdate, now = new Date()): Routine {
  const { id, days, title, ...rest } = input
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(routines)
      .where(and(eq(routines.id, id), isNull(routines.deletedAt)))
      .get()
    if (!before) throw new Error('Rutin bulunamadı')
    const after = tx
      .update(routines)
      .set({
        ...rest,
        ...(title !== undefined && { title: title.trim() }),
        ...(days && { daysJson: JSON.stringify(days) }),
        updatedAt: now,
      })
      .where(eq(routines.id, id))
      .returning()
      .get()
    logUpdate(tx, 'routines', before, after)
    return toRoutine(after)
  })
}

export const deleteRoutine = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, routines, 'routines', id, true, now)
export const restoreRoutine = (db: Db, id: string, now = new Date()) =>
  setDeleted(db, routines, 'routines', id, false, now)
