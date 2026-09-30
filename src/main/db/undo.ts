import { and, desc, eq, getTableColumns, getTableName, is, isNull } from 'drizzle-orm'
import { SQLiteTable, type SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { ulid } from 'ulid'
import { logActivity } from './activity'
import type { Db } from './client'
import * as schema from './schema'
import { activityLog, examTopics } from './schema'

// Bir `activity_log` grubunu geri alır (Aşama 4: onaylanmış AI önerisi, Onay Kutusu > İşlem günlüğü).
// Kayıtlar tersten işlenir: 'create' → soft delete (çöp kutusundan geri gelebilir), 'update' → değişen kolonlar eski
// değerine. Arada Taha aynı kolonu değiştirdiyse geri alma reddedilir (onun yazdığı ezilmez).
// Silme kolonu olmayan yan kayıtlar (fikir satırı notuyla birlikte gizlenir) atlanır; sınav konusu bağı silinir.

const TABLES = new Map<string, SQLiteTable>()
for (const v of Object.values(schema) as unknown[]) if (is(v, SQLiteTable)) TABLES.set(getTableName(v), v)

/** JSON'a yazılmış satırla aynı biçim (Date → ISO metin). */
const plain = (v: unknown): unknown => (v === undefined ? null : JSON.parse(JSON.stringify(v ?? null)))
const same = (a: unknown, b: unknown) => JSON.stringify(plain(a)) === JSON.stringify(plain(b))

function revive(column: SQLiteColumn, value: unknown): unknown {
  if (value !== null && typeof value === 'string' && column.columnType === 'SQLiteTimestamp') return new Date(value)
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
    const undoGroupId = ulid()
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
      const table = TABLES.get(e.targetTable)
      if (!table) continue
      const columns = getTableColumns(table) as Record<string, SQLiteColumn>
      const idCol = columns.id
      if (!idCol) continue
      const current = tx.select().from(table).where(eq(idCol, e.targetId)).get() as Record<string, unknown> | undefined
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
            throw new UndoConflictError('Bu değişiklikten sonra kayıt elle düzenlenmiş; geri alınamaz')
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
