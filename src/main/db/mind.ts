import { and, count, eq, gte, isNull } from 'drizzle-orm'
import { startOfDay, startOfWeek } from 'date-fns'
import { ulid } from 'ulid'
import type { Checkin, CheckinSetInput, WeekAchievements } from '@shared/ipc'
import { dayKey } from '../domain/recurrence'
import { logActivity, logUpdateMerged } from './activity'
import type { Db } from './client'
import { checkins, tasks } from './schema'

// Zihin: günlük kayıt ve haftanın başarıları (Aşama 3c).

type CheckinRow = typeof checkins.$inferSelect

/** Karodaki art arda tıklamalar (ruh hâli 3 → 4) bu süre içinde tek log kaydında birleşir. */
const CHECKIN_LOG_WINDOW_MS = 10 * 60_000

const toCheckin = (r: CheckinRow): Checkin => ({
  day: r.day,
  mood: r.mood,
  energy: r.energy,
  sleepMin: r.sleepMin,
  note: r.note,
})

export function getTodayCheckin(db: Db, now = new Date()): Checkin | null {
  const row = db
    .select()
    .from(checkins)
    .where(eq(checkins.day, dayKey(now)))
    .get()
  return row ? toCheckin(row) : null
}

/** Bugünün kaydı: yoksa oluşturur, varsa sadece verilen alanları yazar. */
export function setTodayCheckin(db: Db, input: CheckinSetInput, now = new Date()): Checkin {
  const day = dayKey(now)
  return db.transaction((tx) => {
    const before = tx.select().from(checkins).where(eq(checkins.day, day)).get()
    if (!before) {
      const row = tx
        .insert(checkins)
        .values({ id: ulid(), day, ...input, createdAt: now, updatedAt: now })
        .returning()
        .get()
      logActivity(tx, {
        actor: 'taha',
        action: 'create',
        targetTable: 'checkins',
        targetId: row.id,
        after: row,
      })
      return toCheckin(row)
    }
    const after = tx
      .update(checkins)
      .set({ ...input, updatedAt: now })
      .where(eq(checkins.id, before.id))
      .returning()
      .get()
    logUpdateMerged(
      tx,
      { actor: 'taha', targetTable: 'checkins', targetId: before.id, before, after },
      CHECKIN_LOG_WINDOW_MS,
      now,
    )
    return toCheckin(after)
  })
}

function doneSince(db: Db, since: Date): number {
  const row = db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.status, 'done'), isNull(tasks.deletedAt), gte(tasks.completedAt, since)))
    .get()
  return row?.n ?? 0
}

/** Bu hafta (Pazartesi 00:00'dan) ve bugün tamamlanan görevler; silinenler sayılmaz. */
export function getWeekAchievements(db: Db, now = new Date()): WeekAchievements {
  return {
    tasksWeek: doneSince(db, startOfWeek(now, { weekStartsOn: 1 })),
    tasksToday: doneSince(db, startOfDay(now)),
  }
}
