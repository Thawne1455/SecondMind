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
