import { and, desc, eq, getTableColumns, getTableName, inArray, is, isNull } from 'drizzle-orm'
import { SQLiteTable, type SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { UNDO_GROUP_PREFIX } from '../domain/activityText'
import { logActivity } from './activity'
import type { Db } from './client'
import * as schema from './schema'
import { activityLog, courses, courseSlots, examTopics } from './schema'

// Bir `activity_log` grubunu geri alır (Aşama 4: onaylanmış AI önerisi, Onay Kutusu > İşlem günlüğü).
// Kayıtlar tersten işlenir: 'create' → soft delete (çöp kutusundan geri gelebilir), 'update' → değişen kolonlar eski
// değerine. Arada Taha aynı kolonu değiştirdiyse geri alma reddedilir (onun yazdığı ezilmez).
// Silme kolonu olmayan yan kayıtlar (fikir satırı notuyla birlikte gizlenir) atlanır; sınav konusu bağı silinir.
// Ders saatleri (`course_slots`, silme kolonu yok) bir dersin programı değişince gerçekten silinir/eklenir: geri almada
// silinen saat geri yazılır, eklenen saat silinir (ders de bu grupta oluştuysa saatleri dersle birlikte çöpe gider, dokunulmaz).
// Grubun oluşturduğu dönemde sonradan başka gruplarla eklenmiş canlı ders varsa geri alma reddedilir (dersler dönemsiz kalmasın).

const TABLES = new Map<string, SQLiteTable>()
for (const v of Object.values(schema) as unknown[])
  if (is(v, SQLiteTable)) TABLES.set(getTableName(v), v)

/** JSON'a yazılmış satırla aynı biçim (Date → ISO metin). */
const plain = (v: unknown): unknown =>
  v === undefined ? null : JSON.parse(JSON.stringify(v ?? null))
const same = (a: unknown, b: unknown) => JSON.stringify(plain(a)) === JSON.stringify(plain(b))

function revive(column: SQLiteColumn, value: unknown): unknown {
  if (value !== null && typeof value === 'string' && column.columnType === 'SQLiteTimestamp')
    return new Date(value)
  return value
}

export class UndoConflictError extends Error {}

export function undoGroup(db: Db, groupId: string, now = new Date()): number {
  return db.transaction((tx) => {
    const entries = tx
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.groupId, groupId), isNull(activityLog.undoneAt)))
      .orderBy(desc(activityLog.id))
      .all()
    if (!entries.length) throw new Error('Geri alınacak kayıt yok')
    const created = (table: string) =>
      new Set(
        entries
          .filter((e) => e.action === 'create' && e.targetTable === table)
          .map((e) => e.targetId),
      )
    const createdTerms = created('terms')
    const createdCourses = created('courses')
    if (createdTerms.size) {
      const others = tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(inArray(courses.termId, [...createdTerms]), isNull(courses.deletedAt)))
        .all()
        .filter((c) => !createdCourses.has(c.id))
      if (others.length)
        throw new UndoConflictError(
          'Bu döneme sonradan başka dersler eklendi; önce onları geri al.',
        )
    }
    // Geri almanın kendi grubu işaretli: günlükte "geri alma" olarak tanınır, kendisi geri alınmaz.
    const undoGroupId = `${UNDO_GROUP_PREFIX}${groupId}`
    let undone = 0
    for (const e of entries) {
      if (e.targetTable === 'exam_topics' && e.action === 'create') {
        const [examId, topicId] = e.targetId.split(':')
        tx.delete(examTopics)
          .where(and(eq(examTopics.examId, examId!), eq(examTopics.topicId, topicId!)))
          .run()
        logActivity(tx, {
          actor: 'taha',
          action: 'delete',
          targetTable: e.targetTable,
          targetId: e.targetId,
          groupId: undoGroupId,
          before: e.afterJson ? JSON.parse(e.afterJson) : undefined,
        })
        undone++
        continue
      }
      if (e.targetTable === 'course_slots' && (e.action === 'create' || e.action === 'delete')) {
        const current = tx.select().from(courseSlots).where(eq(courseSlots.id, e.targetId)).get()
        if (e.action === 'create') {
          if (!current || createdCourses.has(current.courseId)) continue
          tx.delete(courseSlots).where(eq(courseSlots.id, e.targetId)).run()
          logActivity(tx, {
            actor: 'taha',
            action: 'delete',
            targetTable: e.targetTable,
            targetId: e.targetId,
            groupId: undoGroupId,
            before: current,
          })
        } else {
          if (current || !e.beforeJson) continue
          const columns = getTableColumns(courseSlots) as Record<string, SQLiteColumn>
          const before = JSON.parse(e.beforeJson) as Record<string, unknown>
          const values: Record<string, unknown> = {}
          for (const [key, column] of Object.entries(columns))
            if (key in before) values[key] = revive(column, before[key])
          const row = tx
            .insert(courseSlots)
            .values(values as typeof courseSlots.$inferInsert)
            .returning()
            .get()
          logActivity(tx, {
            actor: 'taha',
            action: 'create',
            targetTable: e.targetTable,
            targetId: e.targetId,
            groupId: undoGroupId,
            after: row,
          })
        }
        undone++
        continue
      }
      const table = TABLES.get(e.targetTable)
      if (!table) continue
      const columns = getTableColumns(table) as Record<string, SQLiteColumn>
      const idCol = columns.id
      if (!idCol) continue
      const current = tx.select().from(table).where(eq(idCol, e.targetId)).get() as
        Record<string, unknown> | undefined
      if (!current) continue

      if (e.action === 'create') {
        if (!columns.deletedAt || current.deletedAt) continue
        const after = tx
          .update(table)
          .set({ deletedAt: now, ...(columns.updatedAt && { updatedAt: now }) })
          .where(eq(idCol, e.targetId))
          .returning()
          .get()
        logActivity(tx, {
          actor: 'taha',
          action: 'delete',
          targetTable: e.targetTable,
          targetId: e.targetId,
          groupId: undoGroupId,
          before: current,
          after,
        })
        undone++
      } else if (e.action === 'update') {
        const before = JSON.parse(e.beforeJson ?? '{}') as Record<string, unknown>
        const afterLog = JSON.parse(e.afterJson ?? '{}') as Record<string, unknown>
        const set: Record<string, unknown> = {}
        for (const [key, column] of Object.entries(columns)) {
          if (key === 'updatedAt' || !(key in before) || same(before[key], afterLog[key])) continue
          if (!same(current[key], afterLog[key]))
            throw new UndoConflictError(
              'Bu değişiklikten sonra kayıt elle düzenlenmiş; geri alınamaz',
            )
          set[key] = revive(column, before[key])
        }
        if (!Object.keys(set).length) continue
        if (columns.updatedAt) set.updatedAt = now
        const after = tx.update(table).set(set).where(eq(idCol, e.targetId)).returning().get()
        logActivity(tx, {
          actor: 'taha',
          action: 'update',
          targetTable: e.targetTable,
          targetId: e.targetId,
          groupId: undoGroupId,
          before: current,
          after,
        })
        undone++
      }
    }
    tx.update(activityLog).set({ undoneAt: now }).where(eq(activityLog.groupId, groupId)).run()
    return undone
  })
}
