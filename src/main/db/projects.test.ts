import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { createTask, listTasks, splitTask } from './planning'
import {
  addParking,
  closeSession,
  createProject,
  deleteProject,
  discardSession,
  folderOwner,
  listParking,
  listProjects,
  listSessions,
  resolveParking,
  restoreParking,
  restoreProject,
  startSession,
  updateProject,
} from './projects'
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
const make = (name: string, folderPath: string | null = null, now = at(20)) =>
  createProject(db, { name, kind: 'unity', color: '#3be08f', folderPath }, now)

describe('projeler', () => {
  it('oluşturma: klasör bağlanır, ad benzersiz, klasör iki canlı projeye bağlanamaz', () => {
    const id = make('Runika', 'C:\\ajanda\\Runika\\')
    const [p] = listProjects(db, at(28))
    expect(p).toMatchObject({
      id,
      name: 'Runika',
      color: '#3BE08F',
      folderPath: 'C:\\ajanda\\Runika',
    })
    expect(folderOwner(db, 'c:/ajanda/runika')).toBe('Runika')
    expect(() => make('Runika')).toThrow(/zaten var/)
    expect(() => make('Başka', 'C:/AJANDA/Runika')).toThrow(/Runika/)
    // Proje ve klasör aynı grupla loglanır.
    const created = log().filter((l) => l.action === 'create')
    expect(created.map((l) => l.targetTable)).toEqual(['projects', 'project_folders'])
    expect(created[0]!.groupId).toBe(created[1]!.groupId)
  })

  it('çöp kutusundaki projenin klasörü yeni projeye geçer; geri gelen ad çakışırsa (2) alır', () => {
    const old = make('Runika', 'C:\\ajanda\\Runika')
    deleteProject(db, old, at(21))
    const fresh = make('Runika', 'C:\\ajanda\\Runika', at(22))
    expect(listProjects(db, at(28)).map((p) => [p.id, p.folderPath])).toEqual([
      [fresh, 'C:\\ajanda\\Runika'],
    ])
    restoreProject(db, old, at(23))
    expect(listProjects(db, at(28)).find((p) => p.id === old)?.name).toBe('Runika (2)')
  })

  it('arşivleme tarih yazar, liste sırası: aktif önce', () => {
    const a = make('A')
    const b = make('B', null, at(21))
    updateProject(db, { id: b, status: 'archived' }, at(22))
    expect(listProjects(db, at(28)).map((p) => [p.name, p.status])).toEqual([
      ['A', 'active'],
      ['B', 'archived'],
    ])
    updateProject(db, { id: a, name: 'A2', nextStep: 'Menü müziği' }, at(22))
    expect(listProjects(db, at(28))[0]).toMatchObject({ name: 'A2', nextStep: 'Menü müziği' })
  })
})

describe('oturumlar', () => {
  it('başla → kapat: süre, sıradaki adım projeye yazılır, tek grup log', () => {
    const id = make('Runika')
    const s = startSession(db, { projectId: id }, at(28, 9))
    // Aynı projede ikinci Başla aynı oturumu döndürür; başka projede hata.
    expect(startSession(db, { projectId: id }, at(28, 9, 5)).id).toBe(s.id)
    const other = make('SecondMind')
    expect(() => startSession(db, { projectId: other }, at(28, 9, 10))).toThrow(/Runika/)

    const live = listProjects(db, at(28, 10)).find((p) => p.id === id)!
    expect(live.activeSession?.id).toBe(s.id)
    expect(live.rhythm.at(-1)).toBe(60)

    const closed = closeSession(
      db,
      { id: s.id, leftOff: 'Boss fazı 2 yarım', nextStep: 'Boss müziğini hızlandır' },
      at(28, 10, 30),
    )
    expect(closed.endedAt).toBe(at(28, 10, 30).getTime())
    const p = listProjects(db, at(28, 11)).find((x) => x.id === id)!
    expect(p).toMatchObject({
      nextStep: 'Boss müziğini hızlandır',
      activeSession: null,
      weekMinutes: 90,
      weekSessions: 1,
      silentDays: 0,
    })
    expect(p.lastSession?.leftOff).toBe('Boss fazı 2 yarım')
    const g = log().at(-1)!.groupId
    expect(
      log()
        .filter((l) => l.groupId === g)
        .map((l) => l.targetTable),
    ).toEqual(['sessions', 'projects'])
    expect(() => closeSession(db, { id: s.id, leftOff: '', nextStep: 'x' })).toThrow(/kapalı/)
  })

  it('uzun açık kalan oturum verilen süreyle kapanır; atılan oturum listede yok', () => {
    const id = make('Runika')
    const s = startSession(db, { projectId: id }, at(27, 22))
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'Devam', durationMin: 120 }, at(28, 9))
    expect(listSessions(db, id, 10)[0]!.endedAt).toBe(at(28, 0).getTime())

    const wrong = startSession(db, { projectId: id }, at(28, 10))
    discardSession(db, wrong.id, at(28, 10, 1))
    expect(listSessions(db, id, 10).map((x) => x.id)).toEqual([s.id])
    expect(listProjects(db, at(28, 11))[0]!.activeSession).toBeNull()
  })

  it('duraklatılmış projede oturum açmak onu aktif eder; silinen projenin oturumu kapanır', () => {
    const id = make('Albüm')
    updateProject(db, { id, status: 'paused' }, at(21))
    startSession(db, { projectId: id }, at(28, 9))
    expect(listProjects(db, at(28, 9, 30))[0]!.status).toBe('active')
    deleteProject(db, id, at(28, 10))
    expect(listSessions(db, id, 5)[0]!.endedAt).toBe(at(28, 10).getTime())
    expect(listProjects(db, at(28, 11))).toEqual([])
  })

  it('silence: son oturumdan bu yana gün', () => {
    const id = make('Albüm', null, at(1))
    const s = startSession(db, { projectId: id }, at(10, 9))
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'Miks' }, at(10, 10))
    expect(listProjects(db, at(28))[0]!.silentDays).toBe(18)
  })
})

describe('park alanı', () => {
  it('ekle, göreve çevir, geri al; oturum sırasında eklenenler işaretli', () => {
    const id = make('Runika')
    const before = addParking(
      db,
      { projectId: id, text: ' Kamera sarsıntısı ', source: 'app' },
      at(28, 8),
    )
    const s = startSession(db, { projectId: id }, at(28, 9))
    const during = addParking(
      db,
      { projectId: id, text: 'Ses menüsü', source: 'shortcut' },
      at(28, 9, 30),
    )
    expect(listParking(db, id).map((p) => [p.text, p.inActiveSession])).toEqual([
      ['Ses menüsü', true],
      ['Kamera sarsıntısı', false],
    ])
    expect(listProjects(db, at(28, 10))[0]!.parkingWaiting).toBe(2)

    const { taskId } = resolveParking(db, during.id, 'convert', at(28, 10))
    const task = listTasks(db, 'open', at(28, 10)).find((t) => t.id === taskId)!
    expect(task).toMatchObject({ title: 'Ses menüsü', projectId: id, plannedDate: null })
    resolveParking(db, before.id, 'dismiss', at(28, 10))
    expect(listParking(db, id)).toEqual([])
    expect(() => resolveParking(db, before.id, 'dismiss')).toThrow()

    restoreParking(db, during.id, at(28, 11))
    expect(listParking(db, id).map((p) => p.text)).toEqual(['Ses menüsü'])
    expect(listTasks(db, 'open', at(28, 11)).find((t) => t.id === taskId)).toBeUndefined()
    closeSession(db, { id: s.id, leftOff: '', nextStep: 'x' }, at(28, 12))
  })
})

describe('proje görevleri', () => {
  it('görev projeyi taşır, bölünen parçalar da', () => {
    const id = make('Runika')
    const t = createTask(db, { title: 'Büyük iş', projectId: id, estimateMin: 60 }, at(28, 9))
    expect(t.projectId).toBe(id)
    const parts = splitTask(db, t.id, ['A', 'B'], at(28, 9))
    expect(parts.map((p) => p.projectId)).toEqual([id, id])
    expect(listProjects(db, at(28, 10))[0]!.openTasks).toBe(2)
  })
})
