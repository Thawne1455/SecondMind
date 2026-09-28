import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { getTodayCheckin, getWeekAchievements, setTodayCheckin } from './mind'
import { createTask, deleteTask, setTaskDone } from './planning'
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

describe('günlük kayıt', () => {
  it('gün başına tek kayıt; alanlar tek tek dolar, verilmeyen alan korunur', () => {
    expect(getTodayCheckin(db, at(28))).toBeNull()
    setTodayCheckin(db, { mood: 3 }, at(28, 9))
    setTodayCheckin(db, { energy: 2 }, at(28, 9, 1))
    const c = setTodayCheckin(db, { mood: 4, sleepMin: 435 }, at(28, 9, 2))
    expect(c).toEqual({ day: '2026-09-28', mood: 4, energy: 2, sleepMin: 435, note: '' })
    expect(getTodayCheckin(db, at(28, 20))).toEqual(c)

    // Ertesi gün yeni kayıt.
    expect(getTodayCheckin(db, at(29))).toBeNull()
    setTodayCheckin(db, { mood: null, energy: 5 }, at(29))
    expect(getTodayCheckin(db, at(29))).toMatchObject({ mood: null, energy: 5 })
  })

  it('art arda tıklamalar 10 dk içinde tek log kaydında birleşir', () => {
    setTodayCheckin(db, { mood: 3 }, at(28, 9))
    setTodayCheckin(db, { mood: 4 }, at(28, 9, 1))
    setTodayCheckin(db, { energy: 4 }, at(28, 9, 5))
    setTodayCheckin(db, { sleepMin: 420 }, at(28, 9, 30))
    expect(log().map((l) => l.action)).toEqual(['create', 'update', 'update'])
  })
})

describe('haftanın başarıları', () => {
  it('Pazartesi 00:00dan beri ve bugün bitenler; silinen ve geri açılan sayılmaz', () => {
    const mk = (title: string) => createTask(db, { title }, at(20))
    setTaskDone(db, mk('geçen hafta').id, true, at(27, 23, 59))
    setTaskDone(db, mk('pazartesi sabah').id, true, at(28, 0, 5))
    const gone = mk('silinen')
    setTaskDone(db, gone.id, true, at(28, 10))
    deleteTask(db, gone.id, at(28, 11))
    const reopened = mk('geri açılan')
    setTaskDone(db, reopened.id, true, at(28, 10))
    setTaskDone(db, reopened.id, false, at(28, 10, 5))
    expect(getWeekAchievements(db, at(28, 18))).toEqual({ tasksWeek: 1, tasksToday: 1 })

    setTaskDone(db, mk('çarşamba').id, true, at(30, 14))
    expect(getWeekAchievements(db, at(30, 18))).toEqual({ tasksWeek: 2, tasksToday: 1 })
  })
})
