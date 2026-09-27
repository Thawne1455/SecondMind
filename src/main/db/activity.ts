import { and, desc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { Db, DbTx } from './client'
import { activityLog } from './schema'

type Entry = Omit<typeof activityLog.$inferInsert, 'id' | 'beforeJson' | 'afterJson'> & {
  before?: unknown
  after?: unknown
}

/** Değişikliği `activity_log`'a yazar; değiştiren işlemle aynı transaction içinde çağrılır. */
export function logActivity(db: Db | DbTx, { before, after, ...entry }: Entry): void {
  db.insert(activityLog)
    .values({
      id: ulid(),
      ...entry,
      beforeJson: before === undefined ? null : JSON.stringify(before),
      afterJson: after === undefined ? null : JSON.stringify(after),
    })
    .run()
}

/**
 * Otomatik kayıt gibi sık güncellemeler için: aynı hedefin son kaydı, `windowMs` içinde açılmış,
 * geri alınmamış bir 'update' ise yeni kayıt açılmaz; o kaydın `after_json`'u güncellenir.
 * Böylece `before_json` pencerenin başındaki hali tutar.
 */
export function logUpdateMerged(
  db: Db | DbTx,
  entry: Omit<Entry, 'action'>,
  windowMs: number,
  now = new Date(),
): void {
  const last = db
    .select()
    .from(activityLog)
    .where(
      and(eq(activityLog.targetTable, entry.targetTable), eq(activityLog.targetId, entry.targetId)),
    )
    // ulid zaman sıralı (ms); created_at varsayılanı saniye hassasiyetinde.
    .orderBy(desc(activityLog.id))
    .get()
  if (
    last &&
    last.action === 'update' &&
    last.actor === entry.actor &&
    !last.undoneAt &&
    !last.groupId &&
    now.getTime() - last.createdAt.getTime() < windowMs
  ) {
    db.update(activityLog)
      .set({ afterJson: JSON.stringify(entry.after), updatedAt: now })
      .where(eq(activityLog.id, last.id))
      .run()
    return
  }
  logActivity(db, { ...entry, action: 'update', createdAt: now, updatedAt: now })
}
