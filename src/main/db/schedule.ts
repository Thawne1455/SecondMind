import { and, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { ScheduleBlock, ScheduleDay, TaskPriority } from '@shared/ipc'
import { dayKey } from '../domain/recurrence'
import {
  clampMove,
  floorSnap,
  freeGaps,
  planDay,
  routineIntervals,
  sumGaps,
  taskDuration,
  type Block,
  type SchedTask,
} from '../domain/scheduler'
import { logActivity } from './activity'
import type { Db, DbTx } from './client'
import { routines, scheduleBlocks, tasks } from './schema'

// Günün yerleşimi (schedule_blocks). Algoritmanın yazdıkları türetilmiş plandır, log'a yazılmaz;
// Taha'nın taşıması / sabitliği kaldırması / "Başla"sı ve gün sonu kaydırması log'a yazılır.

type BlockRow = typeof scheduleBlocks.$inferSelect
type TaskRow = typeof tasks.$inferSelect

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

/**
 * Gün sonu kaydırma: planlanan günü geçmişte kalan açık görevler bugüne kayar. Kaç gün kaçırılmış
 * olursa olsun `postpone_count` görev başına bir kez artar; hepsi tek grupla loglanır.
 */
function rollover(tx: DbTx, now: Date): number {
  const today = dayKey(now)
  const rows = tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, 'open'), isNull(tasks.deletedAt), lt(tasks.plannedDate, today)))
    .all()
  const groupId = ulid()
  for (const before of rows) {
    const after = tx
      .update(tasks)
      .set({ plannedDate: today, postponeCount: before.postponeCount + 1, updatedAt: now })
      .where(eq(tasks.id, before.id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'system',
      action: 'update',
      targetTable: 'tasks',
      targetId: before.id,
      groupId,
      before,
      after,
    })
  }
  return rows.length
}

export const rolloverTasks = (db: Db, now = new Date()): number =>
  db.transaction((tx) => rollover(tx, now))

function toSchedTask(r: TaskRow, today: string): SchedTask {
  return {
    id: r.id,
    priority: r.priority as TaskPriority,
    dueDate: r.dueDate,
    plannedDate: r.plannedDate,
    postponeCount: r.postponeCount,
    createdAt: r.createdAt,
    status: r.status,
    estimateMin: r.estimateMin,
    completedMin:
      r.completedAt && dayKey(r.completedAt) === today ? minuteOfDay(r.completedAt) : null,
  }
}

const toBlock = (r: BlockRow): Block => ({
  id: r.id,
  kind: r.kind,
  sourceId: r.sourceId,
  start: r.startMin,
  end: r.endMin,
  pinned: r.pinned,
})

/** Kaydırır, planı hesaplar, farkı yazar ve Bugün'ün göreceği hali döner. */
function sync(tx: DbTx, now: Date, mode: 'fill' | 'replace'): ScheduleDay {
  const today = dayKey(now)
  const nowMin = minuteOfDay(now)
  const rolledOver = rollover(tx, now)

  const routineRows = tx.select().from(routines).where(isNull(routines.deletedAt)).all()
  const existing = tx.select().from(scheduleBlocks).where(eq(scheduleBlocks.day, today)).all()
  const blockTaskIds = existing.filter((b) => b.kind === 'task').map((b) => b.sourceId)
  const taskRows = tx
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        or(
          and(eq(tasks.status, 'open'), lte(tasks.plannedDate, today)),
          blockTaskIds.length ? inArray(tasks.id, blockTaskIds) : undefined,
        ),
      ),
    )
    .all()

  const plan = planDay({
    today,
    nowMin,
    routines: routineIntervals(
      routineRows.map((r) => ({ ...r, days: JSON.parse(r.daysJson) as number[] })),
      now,
    ),
    tasks: taskRows.map((r) => toSchedTask(r, today)),
    existing: existing.map(toBlock),
    mode,
  })

  // Farkı yaz: değişen satır güncellenir, yeni yerleşen eklenir, plandan düşen silinir.
  const before = new Map(existing.map((r) => [r.id, r]))
  const keptIds = new Set<string>()
  const rows: BlockRow[] = []
  for (const b of plan.blocks) {
    const old = b.id ? before.get(b.id) : undefined
    if (old) {
      keptIds.add(old.id)
      if (old.startMin === b.start && old.endMin === b.end && old.pinned === b.pinned) {
        rows.push(old)
        continue
      }
      rows.push(
        tx
          .update(scheduleBlocks)
          .set({ startMin: b.start, endMin: b.end, pinned: b.pinned, updatedAt: now })
          .where(eq(scheduleBlocks.id, old.id))
          .returning()
          .get(),
      )
      continue
    }
    rows.push(
      tx
        .insert(scheduleBlocks)
        .values({
          id: ulid(),
          day: today,
          startMin: b.start,
          endMin: b.end,
          kind: b.kind,
          sourceId: b.sourceId,
          pinned: b.pinned,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get(),
    )
  }
  const dropped = existing.filter((r) => !keptIds.has(r.id)).map((r) => r.id)
  if (dropped.length) tx.delete(scheduleBlocks).where(inArray(scheduleBlocks.id, dropped)).run()

  const taskById = new Map(taskRows.map((t) => [t.id, t]))
  const routineById = new Map(routineRows.map((r) => [r.id, r]))
  const blocks: ScheduleBlock[] = rows.map((r) => {
    const t = r.kind === 'task' ? taskById.get(r.sourceId) : undefined
    return {
      id: r.id,
      kind: r.kind,
      sourceId: r.sourceId,
      start: r.startMin,
      end: r.endMin,
      pinned: r.pinned,
      title: t?.title ?? routineById.get(r.sourceId)?.title ?? '',
      projectId: t?.projectId ?? null,
      done: t?.status === 'done',
      postponeCount: t?.postponeCount ?? 0,
    }
  })
  const gaps = freeGaps(plan.blocks, nowMin)
  return {
    day: today,
    nowMin,
    blocks,
    unplaced: plan.unplaced.map((id) => ({ id, title: taskById.get(id)?.title ?? '' })),
    freeGaps: gaps,
    freeMinutes: sumGaps(gaps),
    rolledOver,
  }
}

/** Bugünün yerleşimi; kayıtlı yerleşim korunur, bloğu olmayan görevler boşluklara girer. */
export const getTodaySchedule = (db: Db, now = new Date()): ScheduleDay =>
  db.transaction((tx) => sync(tx, now, 'fill'))

/** "Yeniden yerleştir". */
export const rescheduleToday = (db: Db, now = new Date()): ScheduleDay =>
  db.transaction((tx) => sync(tx, now, 'replace'))

function todayTaskBlock(tx: DbTx, id: string, now: Date): BlockRow {
  const row = tx
    .select()
    .from(scheduleBlocks)
    .where(
      and(
        eq(scheduleBlocks.id, id),
        eq(scheduleBlocks.day, dayKey(now)),
        eq(scheduleBlocks.kind, 'task'),
      ),
    )
    .get()
  if (!row) throw new Error('Blok bulunamadı')
  return row
}

function logBlock(tx: DbTx, before: BlockRow | undefined, after: BlockRow) {
  logActivity(tx, {
    actor: 'taha',
    action: before ? 'update' : 'create',
    targetTable: 'schedule_blocks',
    targetId: after.id,
    before,
    after,
  })
}

/** Elle taşıma: blok o gün sabitlenir; çakışan sabitlenmemiş bloklar yeniden yerleşir. */
export function moveBlock(db: Db, id: string, start: number, now = new Date()): ScheduleDay {
  return db.transaction((tx) => {
    const before = todayTaskBlock(tx, id, now)
    const to = clampMove(start, before.endMin - before.startMin, minuteOfDay(now))
    const after = tx
      .update(scheduleBlocks)
      .set({ startMin: to.start, endMin: to.end, pinned: true, updatedAt: now })
      .where(eq(scheduleBlocks.id, id))
      .returning()
      .get()
    logBlock(tx, before, after)
    return sync(tx, now, 'fill')
  })
}

/** Sabitliği kaldırır; blok yerinde kalır, sonraki "Yeniden yerleştir" taşıyabilir. */
export function unpinBlock(db: Db, id: string, now = new Date()): ScheduleDay {
  return db.transaction((tx) => {
    const before = todayTaskBlock(tx, id, now)
    if (!before.pinned) return sync(tx, now, 'fill')
    const after = tx
      .update(scheduleBlocks)
      .set({ pinned: false, updatedAt: now })
      .where(eq(scheduleBlocks.id, id))
      .returning()
      .get()
    logBlock(tx, before, after)
    return sync(tx, now, 'fill')
  })
}

/**
 * "Başla": görev bugüne alınır (değilse), bloğu şimdiye (5 dk'lık başına) çekilir ya da oluşturulur
 * ve sabitlenir. Oturum tablosu Aşama 5'te; o zamana kadar Başla bu kadarını yapar.
 */
export function startTask(db: Db, taskId: string, now = new Date()): ScheduleDay {
  return db.transaction((tx) => {
    const today = dayKey(now)
    const task = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt), eq(tasks.status, 'open')))
      .get()
    if (!task) throw new Error('Görev bulunamadı')
    if (task.plannedDate === null || task.plannedDate > today) {
      const after = tx
        .update(tasks)
        .set({ plannedDate: today, updatedAt: now })
        .where(eq(tasks.id, taskId))
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: 'update',
        targetTable: 'tasks',
        targetId: taskId,
        before: task,
        after,
      })
    }

    const nowMin = minuteOfDay(now)
    const to = clampMove(floorSnap(nowMin), taskDuration(task), nowMin)
    const before = tx
      .select()
      .from(scheduleBlocks)
      .where(
        and(
          eq(scheduleBlocks.day, today),
          eq(scheduleBlocks.kind, 'task'),
          eq(scheduleBlocks.sourceId, taskId),
        ),
      )
      .get()
    const after = before
      ? tx
          .update(scheduleBlocks)
          .set({ startMin: to.start, endMin: to.end, pinned: true, updatedAt: now })
          .where(eq(scheduleBlocks.id, before.id))
          .returning()
          .get()
      : tx
          .insert(scheduleBlocks)
          .values({
            id: ulid(),
            day: today,
            startMin: to.start,
            endMin: to.end,
            kind: 'task',
            sourceId: taskId,
            pinned: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
    logBlock(tx, before, after)
    return sync(tx, now, 'fill')
  })
}
