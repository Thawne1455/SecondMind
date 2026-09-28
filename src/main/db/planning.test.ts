import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import {
  createReminder,
  createRoutine,
  createTask,
  deleteReminder,
  deleteRoutine,
  deleteTask,
  listReminders,
  listRoutines,
  listTasks,
  resolveMissedReminders,
  restoreTask,
  setTaskDone,
  sweepDueReminders,
  updateReminder,
  updateRoutine,
  updateTask,
} from './planning'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

// 28 Eylül 2026 Pazartesi, yerel saat.
const at = (day: number, hour = 12, min = 0) => new Date(2026, 8, day, hour, min)
const log = () => db.select().from(schema.activityLog).all()

describe('görevler', () => {
  it('oluşturma, sıralı liste, güncelleme ve log', () => {
    const now = at(28)
    createTask(db, { title: 'Sonra' }, now)
    const today = createTask(db, { title: ' Bugün ', plannedDate: '2026-09-28' }, now)
    expect(today).toMatchObject({ title: 'Bugün', priority: 2, status: 'open', postponeCount: 0 })
    expect(listTasks(db, 'open', now).map((t) => t.title)).toEqual(['Bugün', 'Sonra'])

    const upd = updateTask(db, { id: today.id, estimateMin: 45, priority: 3 }, now)
    expect(upd).toMatchObject({ estimateMin: 45, priority: 3 })
    expect(log().map((l) => l.action)).toEqual(['create', 'create', 'update'])
  })

  it('tamamlama bitenlere taşır, geri açma sıfırlar', () => {
    const t = createTask(db, { title: 'Yaz' }, at(28))
    const done = setTaskDone(db, t.id, true, at(28, 15))
    expect(done.completedAt).toBe(at(28, 15).getTime())
    expect(listTasks(db, 'open')).toEqual([])
    expect(listTasks(db, 'done').map((x) => x.id)).toEqual([t.id])
    expect(setTaskDone(db, t.id, false).completedAt).toBeNull()
  })

  it('silme çöp kutusuna, geri alma döndürür', () => {
    const t = createTask(db, { title: 'Sil' })
    deleteTask(db, t.id)
    expect(listTasks(db, 'open')).toEqual([])
    expect(() => updateTask(db, { id: t.id, title: 'x' })).toThrow('Görev bulunamadı')
    restoreTask(db, t.id)
    expect(listTasks(db, 'open').map((x) => x.id)).toEqual([t.id])
    expect(log().map((l) => l.action)).toEqual(['create', 'delete', 'restore'])
  })
})

describe('hatırlatmalar', () => {
  it('geçmiş zamanlı tek seferlik reddedilir; tekrarlayanın ilk çalması kuraldan', () => {
    expect(() => createReminder(db, { title: 'x', at: at(28, 10).getTime() }, at(28))).toThrow(
      'geçmişte',
    )
    const r = createReminder(
      db,
      { title: 'İlaç', rule: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7], time: '09:00' } },
      at(28),
    )
    expect(r.at).toBe(at(29, 9).getTime())
  })

  it('zamanı gelen çalar ve listeden düşer; tekrarlayan ileri alınır', () => {
    createReminder(db, { title: 'Doğum günü', at: at(28, 20).getTime() }, at(28))
    const daily = createReminder(
      db,
      { title: 'Su iç', rule: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7], time: '20:00' } },
      at(28),
    )
    expect(sweepDueReminders(db, at(28, 19, 59))).toEqual({ fired: [], missed: 0 })

    const res = sweepDueReminders(db, at(28, 20))
    expect(res.fired.map((r) => r.title).sort()).toEqual(['Doğum günü', 'Su iç'])
    expect(listReminders(db).map((r) => r.id)).toEqual([daily.id])
    expect(listReminders(db)[0]?.at).toBe(at(29, 20).getTime())
    expect(sweepDueReminders(db, at(28, 20, 1)).fired).toEqual([])
    // Çalma sistem sinyali: log'a yazılmaz.
    expect(log().every((l) => l.action === 'create')).toBe(true)
  })

  it('açılışta kaçırılanlar işaretlenir; Bugüne al görev yapar, tek grupla loglanır', () => {
    const r = createReminder(db, { title: 'Kitabı iade et', at: at(27, 10).getTime() }, at(26))
    expect(sweepDueReminders(db, at(28, 9))).toEqual({ fired: [], missed: 1 })
    expect(listReminders(db)[0]?.missedAt).toBe(at(27, 10).getTime())
    // İkinci tarama aynı kaçırılanı tekrar saymaz.
    expect(sweepDueReminders(db, at(28, 9, 1)).missed).toBe(0)

    const { taskIds } = resolveMissedReminders(db, [r.id], 'today', at(28, 9, 5))
    expect(taskIds).toHaveLength(1)
    expect(listTasks(db, 'open', at(28, 10))[0]).toMatchObject({
      title: 'Kitabı iade et',
      plannedDate: '2026-09-28',
    })
    expect(listReminders(db)).toEqual([])
    const group = log().filter((l) => l.groupId)
    expect(group.map((l) => l.targetTable).sort()).toEqual(['reminders', 'tasks'])
    expect(new Set(group.map((l) => l.groupId)).size).toBe(1)
  })

  it('kapatılan tekrarlayan listede kalır, kaçırılmışlığı silinir', () => {
    const r = createReminder(
      db,
      { title: 'Rapor', rule: { kind: 'weekly', days: [5], time: '17:00' } },
      at(20),
    )
    sweepDueReminders(db, at(28))
    expect(listReminders(db)[0]?.missedAt).toBe(at(25, 17).getTime())
    resolveMissedReminders(db, [r.id], 'dismiss', at(28))
    expect(listReminders(db)[0]).toMatchObject({
      missedAt: null,
      at: new Date(2026, 9, 2, 17).getTime(),
    })
  })

  it('zamanı değişen hatırlatma yeniden kurulur; silinen listeden düşer', () => {
    const r = createReminder(db, { title: 'Ara', at: at(27, 10).getTime() }, at(26))
    sweepDueReminders(db, at(28))
    const upd = updateReminder(db, { id: r.id, at: at(28, 18).getTime() }, at(28))
    expect(upd).toMatchObject({ missedAt: null, firedAt: null, at: at(28, 18).getTime() })
    deleteReminder(db, r.id)
    expect(listReminders(db)).toEqual([])
  })
})

describe('rutinler', () => {
  it('saate göre sıralı; güncelleme ve silme', () => {
    createRoutine(db, { title: 'Yürüyüş', days: [1, 3, 5], startTime: '19:00', durationMin: 30 })
    const r = createRoutine(db, {
      title: 'Kahvaltı',
      days: [1, 2, 3, 4, 5, 6, 7],
      startTime: '08:00',
      durationMin: 20,
    })
    expect(listRoutines(db).map((x) => x.title)).toEqual(['Kahvaltı', 'Yürüyüş'])
    expect(updateRoutine(db, { id: r.id, active: false, days: [6, 7] })).toMatchObject({
      active: false,
      days: [6, 7],
    })
    deleteRoutine(db, r.id)
    expect(listRoutines(db).map((x) => x.title)).toEqual(['Yürüyüş'])
  })
})
