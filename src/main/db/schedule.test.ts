import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import {
  createRoutine,
  createTask,
  listTasks,
  setTaskDone,
  splitTask,
  updateTask,
} from './planning'
import {
  getTodaySchedule,
  moveBlock,
  rescheduleToday,
  rolloverTasks,
  startTask,
  unpinBlock,
} from './schedule'
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
const h = (hour: number, min = 0) => hour * 60 + min
const log = () => db.select().from(schema.activityLog).all()
const spans = (day: ReturnType<typeof getTodaySchedule>) =>
  day.blocks.map((b) => `${b.title} ${b.start}-${b.end}${b.pinned ? ' *' : ''}`)

describe('günün yerleşimi', () => {
  it('rutin ve bugünkü görevler yerleşir, okumalar arasında sabit kalır', () => {
    const t0 = at(28, 9)
    createRoutine(db, { title: 'Yürüyüş', days: [1], startTime: '10:00', durationMin: 30 }, t0)
    createTask(db, { title: 'A', plannedDate: '2026-09-28', estimateMin: 45 }, t0)
    createTask(db, { title: 'Yarın', plannedDate: '2026-09-29' }, t0)

    const first = getTodaySchedule(db, t0)
    expect(spans(first)).toEqual([`A ${h(9)}-${h(9, 45)}`, `Yürüyüş ${h(10)}-${h(10, 30)}`])
    expect(first.freeMinutes).toBe(h(24) - h(10, 40))

    // Yeni görev boşluğa girer; eskiler aynı satır (id) olarak kalır.
    createTask(db, { title: 'B', plannedDate: '2026-09-28' }, t0)
    const second = getTodaySchedule(db, at(28, 9, 5))
    expect(spans(second)).toEqual([...spans(first), `B ${h(10, 40)}-${h(11, 10)}`])
    expect(second.blocks[0]!.id).toBe(first.blocks[0]!.id)
    // Algoritma yazdıkları log'a düşmez.
    expect(log().filter((l) => l.targetTable === 'schedule_blocks')).toEqual([])
  })

  it('sığmayan görev listelenir', () => {
    createTask(db, { title: 'Uzun', plannedDate: '2026-09-28', estimateMin: 240 })
    const day = getTodaySchedule(db, at(28, 22))
    expect(day.blocks).toEqual([])
    expect(day.unplaced.map((u) => u.title)).toEqual(['Uzun'])
  })

  it('biten görevin gelecekteki bloğu kalkar, sürerken biten kesilir', () => {
    const a = createTask(db, { title: 'A', plannedDate: '2026-09-28', estimateMin: 60 }, at(28, 9))
    const b = createTask(db, { title: 'B', plannedDate: '2026-09-28', estimateMin: 60 }, at(28, 9))
    getTodaySchedule(db, at(28, 9)) // A 09:00–10:00, B 10:10–11:10
    setTaskDone(db, a.id, true, at(28, 9, 20))
    setTaskDone(db, b.id, true, at(28, 9, 20))
    const day = getTodaySchedule(db, at(28, 9, 21))
    expect(spans(day)).toEqual([`A ${h(9)}-${h(9, 20)}`])
    expect(day.blocks[0]!.done).toBe(true)
  })
})

describe('taşıma ve sabitleme', () => {
  it('taşınan blok sabitlenir, çakışan kayar, yeniden yerleştirme sabite dokunmaz', () => {
    createTask(db, { title: 'A', plannedDate: '2026-09-28', estimateMin: 60 }, at(28, 9))
    createTask(db, { title: 'B', plannedDate: '2026-09-28', estimateMin: 60 }, at(28, 9))
    const first = getTodaySchedule(db, at(28, 9))
    const a = first.blocks.find((x) => x.title === 'A')!

    // A'yı B'nin üstüne (10:10) taşı: B kayar.
    const moved = moveBlock(db, a.id, h(10, 12), at(28, 9))
    expect(spans(moved)).toEqual([`B ${h(9)}-${h(10)}`, `A ${h(10, 10)}-${h(11, 10)} *`])

    const again = rescheduleToday(db, at(28, 9, 30))
    expect(spans(again)).toContain(`A ${h(10, 10)}-${h(11, 10)} *`)

    const unpinned = unpinBlock(db, a.id, at(28, 9, 30))
    expect(unpinned.blocks.find((x) => x.id === a.id)!.pinned).toBe(false)
    expect(
      log()
        .filter((l) => l.targetTable === 'schedule_blocks')
        .map((l) => l.action),
    ).toEqual(['update', 'update'])
  })

  it('geçmişe taşınamaz', () => {
    createTask(db, { title: 'A', plannedDate: '2026-09-28', estimateMin: 30 }, at(28, 9))
    const { blocks } = getTodaySchedule(db, at(28, 13, 42))
    const moved = moveBlock(db, blocks[0]!.id, h(9), at(28, 13, 42))
    expect(moved.blocks[0]).toMatchObject({ start: h(13, 40), end: h(14, 10), pinned: true })
  })

  it('Başla: bugüne alınmamış görev de şimdiye yerleşir ve sabitlenir', () => {
    const t = createTask(db, { title: 'Sonra', estimateMin: 50 }, at(28, 9))
    const day = startTask(db, t.id, at(28, 13, 42))
    expect(spans(day)).toEqual([`Sonra ${h(13, 40)}-${h(14, 30)} *`])
    expect(listTasks(db, 'open', at(28, 13, 42))[0]!.plannedDate).toBe('2026-09-28')
  })
})

describe('gün sonu kaydırma', () => {
  it('kaçırılan günler tek seferde bugüne, erteleme görev başına bir kez, tek grup', () => {
    const old = createTask(db, { title: 'Üç gün önce', plannedDate: '2026-09-25' }, at(25))
    const y = createTask(db, { title: 'Dün', plannedDate: '2026-09-27' }, at(27))
    createTask(db, { title: 'Bugün', plannedDate: '2026-09-28' }, at(27))
    const done = createTask(db, { title: 'Bitti', plannedDate: '2026-09-27' }, at(27))
    setTaskDone(db, done.id, true, at(27))

    expect(rolloverTasks(db, at(28, 8))).toBe(2)
    expect(rolloverTasks(db, at(28, 9))).toBe(0)

    const open = listTasks(db, 'open', at(28))
    const byId = new Map(open.map((t) => [t.id, t]))
    expect(byId.get(old.id)).toMatchObject({ plannedDate: '2026-09-28', postponeCount: 1 })
    expect(byId.get(y.id)).toMatchObject({ plannedDate: '2026-09-28', postponeCount: 1 })

    const entries = log().filter((l) => l.actor === 'system')
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((l) => l.groupId)).size).toBe(1)

    // Ertesi gün tekrar kayar: sayaç bir daha artar.
    rolloverTasks(db, at(29, 8))
    expect(listTasks(db, 'open', at(29)).find((t) => t.id === old.id)!.postponeCount).toBe(2)
  })

  it('Bugün okuması da kaydırır ve sayısını döner', () => {
    createTask(db, { title: 'Dün', plannedDate: '2026-09-27' }, at(27))
    expect(getTodaySchedule(db, at(28, 9)).rolledOver).toBe(1)
  })
})

describe('bölme', () => {
  it('parçalar bugüne, süre bölünür, asıl görev silinir, tek grup', () => {
    const t = createTask(
      db,
      {
        title: 'Büyük',
        plannedDate: '2026-09-25',
        estimateMin: 90,
        priority: 3,
        dueDate: '2026-10-01',
      },
      at(25),
    )
    updateTask(db, { id: t.id, notes: 'x' }, at(25))
    const parts = splitTask(db, t.id, ['Bir', ' İki '], at(28))
    expect(
      parts.map((p) => [p.title, p.estimateMin, p.plannedDate, p.priority, p.dueDate]),
    ).toEqual([
      ['Bir', 45, '2026-09-28', 3, '2026-10-01'],
      ['İki', 45, '2026-09-28', 3, '2026-10-01'],
    ])
    expect(
      listTasks(db, 'open', at(28))
        .map((x) => x.title)
        .sort(),
    ).toEqual(['Bir', 'İki'])
    const group = log().filter((l) => l.groupId)
    expect(group.map((l) => l.action)).toEqual(['create', 'create', 'delete'])
  })
})
